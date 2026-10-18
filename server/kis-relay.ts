import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { WebSocket, WebSocketServer } from "ws";
import { TR_BOOK, TR_TICK } from "../src/lib/kis-fields";
import {
  KIS_ENDPOINTS,
  buildSubscribeMessage,
  classifyKisMessage,
  extractApprovalKey,
  parseKisEnv,
  parseRestQuote,
  rawCode,
  restQuoteToRaw,
} from "../src/lib/kis-protocol";
import { parseClientMessage } from "../src/lib/parser";
import type { Frame } from "../src/lib/types";

// KIS 실시간 시세 중계 서버 (spec 7.1)
// - 앱키·시크릿·접속키·토큰은 이 프로세스 안에서만 쓰고 절대 로그로 출력하지 않는다. 브라우저에는 시세 원문만 내보낸다.
// - 브라우저가 요청한 종목만 KIS에 구독하고(참조 카운트), 아무도 안 보면 해제한다.
// - 구독·복귀 시 스냅샷: 캐시를 즉시 보내고, 캐시가 오래됐으면 REST 현재가로 다시 맞춘다.
// - 시세 조회만 사용한다 (주문·잔고 API 호출 금지). KIS 서버에 부하 테스트 금지.

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("[kis] .env.local 파일을 찾을 수 없습니다. 프로젝트 루트에서 실행하세요.");
  process.exit(1);
}

const REQUIRED_ENV = ["KIS_APP_KEY", "KIS_APP_SECRET"] as const;
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`[kis] .env.local에 다음 변수가 없습니다: ${missing.join(", ")}`);
  process.exit(1);
}
const APP_KEY = process.env.KIS_APP_KEY ?? "";
const APP_SECRET = process.env.KIS_APP_SECRET ?? "";
const KIS_ENV = parseKisEnv(process.env.KIS_ENV);
const ENDPOINT = KIS_ENDPOINTS[KIS_ENV];
const RELAY_PORT = Number(process.env.RELAY_PORT ?? 8788);
/** 실데이터 원문 캡처 건수 (0이면 캡처 안 함). 장중에 KIS_CAPTURE=200 pnpm relay */
const CAPTURE_LIMIT = Number(process.env.KIS_CAPTURE ?? 0);
const CAPTURE_PATH = "fixtures/kis-raw.txt";
/** 캐시가 이보다 오래됐으면 스냅샷 때 REST로 다시 조회 */
const CACHE_FRESH_MS = 10_000;
/** 모의투자 REST는 초당 호출 제한이 낮아서 순서대로 천천히 보낸다 (600ms 간격에서도 EGW00201이 나와 1초로 맞춤) */
const REST_INTERVAL_MS = KIS_ENV === "paper" ? 1_000 : 100;
/** 초당 거래건수 초과 응답 코드 */
const RATE_LIMIT_CODE = "EGW00201";
/** REST 접근 토큰 캐시 (1분에 1번만 발급되므로 재시작해도 재사용). .gitignore에 포함 */
const TOKEN_CACHE_PATH = ".kis-cache/token.json";

// ── 웹소켓 접속키: 한 번 발급 후 재사용 (재연결마다 발급하지 않음) ──
let approvalKey: string | null = null;

async function getApprovalKey(): Promise<string> {
  if (approvalKey) return approvalKey;
  const res = await fetch(`${ENDPOINT.rest}/oauth2/Approval`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: APP_KEY, secretkey: APP_SECRET }),
  });
  const json: unknown = await res.json().catch(() => null);
  const key = extractApprovalKey(json);
  if (!res.ok || !key) throw new Error(`접속키 발급 실패: HTTP ${res.status} ${errorText(json)}`);
  approvalKey = key;
  console.log(`[kis] 웹소켓 접속키 발급 완료 (${KIS_ENV === "paper" ? "모의투자" : "실전"})`);
  return key;
}

// ── REST 접근 토큰 (현재가 조회용, 접속키와 다름) ──
let accessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (!accessToken) {
    try {
      const cached = JSON.parse(readFileSync(TOKEN_CACHE_PATH, "utf8")) as { token?: unknown; expiresAt?: unknown; env?: unknown };
      if (typeof cached.token === "string" && typeof cached.expiresAt === "number" && cached.env === KIS_ENV) {
        accessToken = { token: cached.token, expiresAt: cached.expiresAt };
      }
    } catch {
      // 캐시 없음
    }
  }
  if (accessToken && accessToken.expiresAt - 60_000 > Date.now()) return accessToken.token;

  const res = await fetch(`${ENDPOINT.rest}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: APP_KEY, appsecret: APP_SECRET }),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const token = json?.access_token;
  const expiresIn = Number(json?.expires_in ?? 0);
  if (!res.ok || typeof token !== "string") throw new Error(`접근 토큰 발급 실패: HTTP ${res.status} ${errorText(json)}`);
  accessToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  mkdirSync(".kis-cache", { recursive: true });
  writeFileSync(TOKEN_CACHE_PATH, JSON.stringify({ ...accessToken, env: KIS_ENV }), { mode: 0o600 });
  console.log("[kis] REST 접근 토큰 발급 완료 (캐시 저장)");
  return token;
}

function errorText(json: unknown): string {
  // 응답 본문에 키는 없지만, 혹시 몰라 오류 코드·설명만 출력한다
  const e = (json ?? {}) as Record<string, unknown>;
  return `${String(e.error_code ?? e.msg_cd ?? "")} ${String(e.error_description ?? e.msg1 ?? "")}`.trim();
}

// ── 종목별 최신 원문 캐시 ──
type Cached = { raw: string; at: number };
const tickCache = new Map<string, Cached>();
const bookCache = new Map<string, Cached>();

// ── 브라우저 쪽 서버 ──
type Browser = { ws: WebSocket; codes: Set<string> };
const browsers = new Set<Browser>();
/** 종목 → 구독 중인 브라우저 수 */
const refCount = new Map<string, number>();

function sendFrame(ws: WebSocket, raw: string, snapshot: boolean) {
  if (ws.readyState !== WebSocket.OPEN) return;
  // 중계 서버 수신 시각을 t로 쓴다 (KIS → 중계 구간 지연은 표시 지연에 포함되지 않음)
  const frame: Frame = snapshot ? { t: Date.now(), raw, s: 1 } : { t: Date.now(), raw };
  ws.send(JSON.stringify(frame));
}

function subscribeCodes(browser: Browser, codes: string[]) {
  for (const code of codes) {
    if (browser.codes.has(code)) continue;
    browser.codes.add(code);
    const count = (refCount.get(code) ?? 0) + 1;
    refCount.set(code, count);
    if (count === 1) kisSubscribe(code, true);
  }
}

function unsubscribeCodes(browser: Browser, codes: string[]) {
  for (const code of codes) {
    if (!browser.codes.delete(code)) continue;
    const count = (refCount.get(code) ?? 1) - 1;
    if (count > 0) {
      refCount.set(code, count);
      continue;
    }
    refCount.delete(code);
    kisSubscribe(code, false);
  }
}

/** 스냅샷: 캐시는 즉시, 캐시가 없거나 오래된 종목은 REST로 (요청 순서 = 화면 위쪽부터) */
function sendSnapshot(browser: Browser, codes: string[]) {
  const now = Date.now();
  const stale: string[] = [];
  for (const code of codes) {
    const tick = tickCache.get(code);
    const book = bookCache.get(code);
    if (tick) sendFrame(browser.ws, tick.raw, true);
    if (book) sendFrame(browser.ws, book.raw, true);
    if (!tick || now - tick.at > CACHE_FRESH_MS) stale.push(code);
  }
  if (stale.length > 0) enqueueRest(browser, stale);
}

wss();

function wss() {
  const server = new WebSocketServer({ port: RELAY_PORT });
  server.on("connection", (ws) => {
    const browser: Browser = { ws, codes: new Set() };
    browsers.add(browser);
    console.log(`[relay] 브라우저 접속 (현재 ${browsers.size})`);
    ws.on("message", (data) => {
      const msg = parseClientMessage(data.toString());
      if (!msg) return;
      if (msg.type === "subscribe") {
        subscribeCodes(browser, msg.codes);
        sendSnapshot(browser, msg.codes);
      } else if (msg.type === "unsubscribe") {
        unsubscribeCodes(browser, msg.codes);
      } else {
        sendSnapshot(browser, msg.codes);
      }
    });
    ws.on("close", () => {
      unsubscribeCodes(browser, [...browser.codes]);
      browsers.delete(browser);
      console.log(`[relay] 브라우저 종료 (현재 ${browsers.size}, KIS 구독 종목 ${refCount.size})`);
    });
  });
  console.log(`[relay] ws://localhost:${RELAY_PORT} 대기 중`);
}

// ── REST 현재가 큐 (초당 호출 제한 때문에 순서대로) ──
const restQueue: { browser: Browser; code: string }[] = [];
let restRunning = false;

function enqueueRest(browser: Browser, codes: string[]) {
  for (const code of codes) {
    if (!restQueue.some((q) => q.browser === browser && q.code === code)) restQueue.push({ browser, code });
  }
  if (!restRunning) void drainRest();
}

async function drainRest() {
  restRunning = true;
  while (restQueue.length > 0) {
    const item = restQueue.shift();
    if (!item || item.browser.ws.readyState !== WebSocket.OPEN) continue;
    try {
      let result = await fetchCurrentPrice(item.code);
      if (result === "rate-limited") {
        // 호출 제한에 걸리면 1초 뒤 한 번만 다시 시도한다 (계속 재시도하면 제한이 더 길어진다)
        await new Promise((r) => setTimeout(r, REST_INTERVAL_MS));
        result = await fetchCurrentPrice(item.code);
      }
      if (typeof result === "string" && result !== "rate-limited") {
        tickCache.set(item.code, { raw: result, at: Date.now() });
        sendFrame(item.browser.ws, result, true);
      }
    } catch (e) {
      console.warn(`[kis] REST 현재가 실패 ${item.code}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, REST_INTERVAL_MS));
  }
  restRunning = false;
}

async function fetchCurrentPrice(code: string): Promise<string | "rate-limited" | null> {
  const token = await getAccessToken();
  const url = `${ENDPOINT.rest}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`;
  const res = await fetch(url, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: "FHKST01010100",
      custtype: "P",
    },
  });
  const json: unknown = await res.json().catch(() => null);
  const quote = parseRestQuote(json);
  if (!quote) {
    const text = errorText(json);
    if (text.includes(RATE_LIMIT_CODE)) return "rate-limited";
    console.warn(`[kis] REST 현재가 응답 오류 ${code}: HTTP ${res.status} ${text}`);
    return null;
  }
  return restQuoteToRaw(code, quote, kstTime());
}

function kstTime(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 19).replaceAll(":", "");
}

// ── 실데이터 캡처 (parser 테스트용 fixture) ──
let captured = 0;
function capture(raw: string) {
  if (captured >= CAPTURE_LIMIT) return;
  if (captured === 0) mkdirSync("fixtures", { recursive: true });
  appendFileSync(CAPTURE_PATH, `${raw}\n`);
  captured++;
  if (captured === CAPTURE_LIMIT) console.log(`[kis] 원문 ${captured}건 캡처 완료 → ${CAPTURE_PATH}`);
}

// ── KIS 쪽 연결 (중계 서버당 1개, 끊기면 지수 백오프로 재연결) ──
let kis: WebSocket | null = null;
let retryMs = 1_000;
let received = 0;
/** 구독 요청은 한꺼번에 보내면 거절될 수 있어 50ms 간격으로 보낸다 */
const subscribeQueue: string[] = [];
let subscribeRunning = false;

function kisSubscribe(code: string, subscribe: boolean) {
  if (!approvalKey) return; // 연결되면 refCount 기준으로 다시 구독한다
  for (const trId of [TR_TICK, TR_BOOK]) subscribeQueue.push(buildSubscribeMessage(approvalKey, trId, code, subscribe));
  console.log(`[kis] ${subscribe ? "구독" : "해제"} ${code} (KIS 구독 종목 ${refCount.size}개)`);
  if (!subscribeRunning) void drainSubscribe();
}

async function drainSubscribe() {
  subscribeRunning = true;
  while (subscribeQueue.length > 0) {
    const msg = subscribeQueue.shift();
    if (msg && kis?.readyState === WebSocket.OPEN) kis.send(msg);
    await new Promise((r) => setTimeout(r, 50));
  }
  subscribeRunning = false;
}

async function connectKis() {
  try {
    await getApprovalKey();
  } catch (e) {
    console.error(`[kis] ${(e as Error).message}`);
    scheduleReconnect();
    return;
  }

  const socket = new WebSocket(ENDPOINT.ws);
  kis = socket;

  socket.on("open", () => {
    retryMs = 1_000;
    console.log(`[kis] 연결됨 ${ENDPOINT.ws}`);
    // 재연결이면 지금 보고 있는 종목을 다시 구독
    for (const code of refCount.keys()) kisSubscribe(code, true);
  });

  socket.on("message", (data) => {
    const text = data.toString();
    const msg = classifyKisMessage(text);
    switch (msg.kind) {
      case "data": {
        received++;
        capture(msg.raw);
        const code = rawCode(msg.raw);
        if (!code) break;
        const cache = msg.raw.includes(`|${TR_BOOK}|`) ? bookCache : tickCache;
        cache.set(code, { raw: msg.raw, at: Date.now() });
        for (const b of browsers) if (b.codes.has(code)) sendFrame(b.ws, msg.raw, false);
        break;
      }
      case "pingpong":
        socket.send(text);
        break;
      case "control":
        if (!msg.ok) console.warn(`[kis] 구독 응답 실패 ${msg.trId} ${msg.trKey}: ${msg.message}`);
        break;
      case "unknown":
        console.warn(`[kis] 알 수 없는 메시지: ${text.slice(0, 80)}`);
    }
  });

  socket.on("close", (code) => {
    if (kis === socket) kis = null;
    console.warn(`[kis] 연결 끊김 (code ${code})`);
    scheduleReconnect();
  });
  socket.on("error", (e) => console.error(`[kis] 오류: ${e.message}`));
}

function scheduleReconnect() {
  console.log(`[kis] ${retryMs / 1000}초 후 재연결`);
  setTimeout(connectKis, retryMs);
  retryMs = Math.min(retryMs * 2, 30_000);
}

setInterval(() => {
  console.log(`[relay] 최근 5초 KIS 수신 ${received}건 (${(received / 5).toFixed(1)}건/s), 브라우저 ${browsers.size}, 구독 종목 ${refCount.size}`);
  received = 0;
}, 5_000);

void connectKis();
