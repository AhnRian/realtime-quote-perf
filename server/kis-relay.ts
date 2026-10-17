import { appendFileSync, mkdirSync } from "node:fs";
import { WebSocket, WebSocketServer } from "ws";
import { TR_BOOK, TR_TICK } from "../src/lib/kis-fields";
import {
  KIS_ENDPOINTS,
  buildSubscribeMessage,
  classifyKisMessage,
  extractApprovalKey,
  parseKisEnv,
} from "../src/lib/kis-protocol";
import { KIS_SYMBOLS } from "../src/lib/kis-symbols";
import type { Frame } from "../src/lib/types";

// KIS 실시간 시세 중계 서버 (spec 12장)
// 앱키·시크릿은 이 프로세스 안에서만 쓰고, 브라우저에는 시세 원문만 내보낸다.
// 보안: 앱키·시크릿·접속키는 절대 로그로 출력하지 않는다.

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("[kis] .env.local 파일을 찾을 수 없습니다. 프로젝트 루트에서 실행하세요.");
  process.exit(1);
}

const REQUIRED_ENV = ["KIS_APP_KEY", "KIS_APP_SECRET"] as const;
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`[kis] .env.local에 다음 변수가 없습니다: ${missing.join(", ")} (.env.example 참고)`);
  process.exit(1);
}
const APP_KEY = process.env.KIS_APP_KEY ?? "";
const APP_SECRET = process.env.KIS_APP_SECRET ?? "";
const KIS_ENV = parseKisEnv(process.env.KIS_ENV);
const ENDPOINT = KIS_ENDPOINTS[KIS_ENV];
const RELAY_PORT = Number(process.env.RELAY_PORT ?? 8788);
/** 실데이터 원문 캡처 건수 (0이면 캡처 안 함). 월요일 장중에 KIS_CAPTURE=200 pnpm relay */
const CAPTURE_LIMIT = Number(process.env.KIS_CAPTURE ?? 0);
const CAPTURE_PATH = "fixtures/kis-raw.txt";

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
  if (!res.ok || !key) {
    // 응답 본문에는 키가 없지만, 혹시 몰라 오류 코드·설명만 출력한다
    const err = (json ?? {}) as Record<string, unknown>;
    throw new Error(`접속키 발급 실패: HTTP ${res.status} ${String(err.error_code ?? "")} ${String(err.error_description ?? err.msg1 ?? "")}`);
  }
  approvalKey = key;
  console.log(`[kis] 웹소켓 접속키 발급 완료 (${KIS_ENV === "paper" ? "모의투자" : "실전"})`);
  return key;
}

// ── 브라우저 쪽 서버 ──
const browsers = new Set<WebSocket>();
const wss = new WebSocketServer({ port: RELAY_PORT });
wss.on("connection", (ws) => {
  browsers.add(ws);
  console.log(`[relay] 브라우저 접속 (현재 ${browsers.size})`);
  ws.on("close", () => browsers.delete(ws));
});

function broadcast(raw: string) {
  // 중계 서버 수신 시각을 t로 쓴다 (KIS → 중계 구간 지연은 표시 지연에 포함되지 않음)
  const frame: Frame = { t: Date.now(), raw };
  const data = JSON.stringify(frame);
  for (const ws of browsers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
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
let retryMs = 1_000;
let received = 0;

async function connectKis() {
  let key: string;
  try {
    key = await getApprovalKey();
  } catch (e) {
    console.error(`[kis] ${(e as Error).message}`);
    scheduleReconnect();
    return;
  }

  const kis = new WebSocket(ENDPOINT.ws);

  kis.on("open", async () => {
    retryMs = 1_000;
    console.log(`[kis] 연결됨 ${ENDPOINT.ws} → ${KIS_SYMBOLS.length}종목 × 체결·호가 구독`);
    for (const { code } of KIS_SYMBOLS) {
      for (const trId of [TR_TICK, TR_BOOK]) {
        kis.send(buildSubscribeMessage(key, trId, code));
        // 구독 요청을 한꺼번에 보내면 거절될 수 있어 간격을 둔다
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  });

  let subscribed = 0;
  kis.on("message", (data) => {
    const text = data.toString();
    const msg = classifyKisMessage(text);
    switch (msg.kind) {
      case "data":
        received++;
        capture(msg.raw);
        broadcast(msg.raw);
        break;
      case "pingpong":
        kis.send(text);
        console.log("[kis] PINGPONG 응답");
        break;
      case "control":
        if (msg.ok) subscribed++;
        else console.warn(`[kis] 구독 실패 ${msg.trId} ${msg.trKey}: ${msg.message}`);
        if (subscribed === KIS_SYMBOLS.length * 2) console.log(`[kis] 구독 완료 ${subscribed}건 (${msg.message})`);
        break;
      case "unknown":
        console.warn(`[kis] 알 수 없는 메시지: ${text.slice(0, 80)}`);
    }
  });

  kis.on("close", (code) => {
    console.warn(`[kis] 연결 끊김 (code ${code})`);
    scheduleReconnect();
  });
  kis.on("error", (e) => console.error(`[kis] 오류: ${e.message}`));
}

function scheduleReconnect() {
  console.log(`[kis] ${retryMs / 1000}초 후 재연결`);
  setTimeout(connectKis, retryMs);
  retryMs = Math.min(retryMs * 2, 30_000);
}

setInterval(() => {
  console.log(`[relay] 최근 5초 수신 ${received}건 (${(received / 5).toFixed(1)}건/s), 브라우저 ${browsers.size}`);
  received = 0;
}, 5_000);

console.log(`[relay] ws://localhost:${RELAY_PORT} 대기 중`);
void connectKis();
