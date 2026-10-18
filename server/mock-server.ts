import { WebSocketServer, WebSocket } from "ws";
import { createMockGenerator, type MockGenerator } from "../src/lib/mock-generator";
import { parseClientMessage } from "../src/lib/parser";
import { parseMockParams, toMockQuery } from "../src/lib/query";
import type { Frame, MockParams } from "../src/lib/types";

// Mock 시세 서버 (spec 5.1)
// 접속 예: ws://localhost:8787?rate=200&symbols=30&burst=1&seed=42
//   mode=broadcast: 같은 쿼리로 접속한 클라이언트들이 생성기 1개를 공유한다 (k6 WebSocket 부하 테스트용)
//   그 외: 접속마다 생성기를 따로 만들어 seed 기준으로 같은 순서를 재현한다 (화면 측정용)

const PORT = Number(process.env.MOCK_PORT ?? 8787);
const SEND_INTERVAL_MS = 10;
const BURST_MS = 10_000;
const BURST_FACTOR = 5;

/** 생성기 1개와 그 메시지를 받는 클라이언트들 */
type Stream = {
  id: number;
  key: string | null;
  params: MockParams;
  generator: MockGenerator;
  clients: Set<WebSocket>;
  startedAt: number;
  sentTotal: number;
  sentInSecond: number;
  timer: ReturnType<typeof setInterval>;
};

const wss = new WebSocketServer({ port: PORT });
const streams = new Set<Stream>();
/** broadcast 스트림: 쿼리 → 스트림 */
const broadcastStreams = new Map<string, Stream>();
let streamSeq = 0;

// 경과 시간 기준 "보냈어야 할 누적 건수"를 계산해 모자란 만큼 보낸다.
// setInterval은 지연이 누적되므로 매번 고정 건수를 보내면 실제 rate가 목표보다 낮아진다.
function expectedTotal(params: MockParams, elapsedMs: number): number {
  const base = (params.rate * elapsedMs) / 1000;
  const extra = params.burst ? (params.rate * (BURST_FACTOR - 1) * Math.min(elapsedMs, BURST_MS)) / 1000 : 0;
  return Math.floor(base + extra);
}

function isBurst(stream: Stream): boolean {
  return stream.params.burst && Date.now() - stream.startedAt < BURST_MS;
}

function sendRaw(stream: Stream, raw: string, only?: WebSocket, snapshot = false) {
  const frame: Frame = snapshot ? { t: Date.now(), raw, s: 1 } : { t: Date.now(), raw };
  // 프레임 직렬화는 한 번만 하고 모든 클라이언트에 같은 문자열을 보낸다
  const data = JSON.stringify(frame);
  for (const ws of only ? [only] : stream.clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function createStream(params: MockParams, key: string | null): Stream {
  const stream: Stream = {
    id: ++streamSeq,
    key,
    params,
    generator: createMockGenerator(params),
    clients: new Set(),
    startedAt: Date.now(),
    sentTotal: 0,
    sentInSecond: 0,
    timer: setInterval(() => {
      const due = expectedTotal(stream.params, Date.now() - stream.startedAt) - stream.sentTotal;
      // burst 구간에는 일부 체결을 다건 메시지로 보낸다 (KIS가 체결이 몰릴 때 보내는 형식)
      const multi = isBurst(stream);
      for (let i = 0; i < due; i++) sendRaw(stream, stream.generator.next({ multi }));
      stream.sentTotal += due;
      stream.sentInSecond += due;
    }, SEND_INTERVAL_MS),
  };
  streams.add(stream);
  if (key) broadcastStreams.set(key, stream);
  return stream;
}

function removeClient(stream: Stream, ws: WebSocket) {
  stream.clients.delete(ws);
  if (stream.clients.size > 0) return;
  clearInterval(stream.timer);
  streams.delete(stream);
  if (stream.key) broadcastStreams.delete(stream.key);
  console.log(`[mock] 스트림 #${stream.id} 종료 (총 ${stream.sentTotal}건)`);
}

wss.on("connection", (ws, req) => {
  const query = new URL(req.url ?? "/", "http://localhost").searchParams;
  const params = parseMockParams(query);
  const broadcast = query.get("mode") === "broadcast";

  let stream: Stream;
  if (broadcast) {
    const key = toMockQuery(params);
    stream = broadcastStreams.get(key) ?? createStream(params, key);
  } else {
    stream = createStream(params, null);
    // 접속 직후 화면을 채우기 위해 전 종목 체결·호가 1건씩 (broadcast는 생략: 이미 흐르는 스트림에 합류)
    for (const raw of stream.generator.snapshot()) sendRaw(stream, raw, ws, true);
  }
  stream.clients.add(ws);
  if (stream.clients.size === 1) console.log(`[mock] 스트림 #${stream.id} 시작${broadcast ? " (broadcast)" : ""}`, params);

  ws.on("message", (data) => {
    const msg = parseClientMessage(data.toString());
    // 연결을 유지한 채 복귀한 브라우저: 최신값을 스냅샷으로 다시 보낸다 (spec 7.2)
    if (msg?.type === "snapshot" && !broadcast) {
      for (const raw of stream.generator.snapshot()) sendRaw(stream, raw, ws, true);
    }
    // subscribe·unsubscribe: Mock은 접속 단위로 전 종목을 보내므로 받기만 한다
  });
  ws.on("close", () => removeClient(stream, ws));
});

setInterval(() => {
  if (streams.size === 0) return;
  const clients = [...streams].reduce((n, s) => n + s.clients.size, 0);
  const parts = [...streams].map((s) => {
    const target = s.params.rate * (isBurst(s) ? BURST_FACTOR : 1);
    const buffered = Math.round(Math.max(0, ...[...s.clients].map((c) => c.bufferedAmount)) / 1024);
    const sent = s.sentInSecond;
    s.sentInSecond = 0;
    return `#${s.id}${s.key ? "(b)" : ""} ${sent}건/s 목표 ${target}${isBurst(s) ? " burst" : ""} 접속 ${s.clients.size} 버퍼최대 ${buffered}KB`;
  });
  console.log(`[mock] 접속 ${clients} | ${parts.join(" | ")}`);
}, 1000);

console.log(`[mock] ws://localhost:${PORT} 대기 중`);
