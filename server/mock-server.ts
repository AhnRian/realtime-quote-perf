import { WebSocketServer, WebSocket } from "ws";
import { createMockGenerator } from "../src/lib/mock-generator";
import { parseMockParams } from "../src/lib/query";
import type { Frame } from "../src/lib/types";

// Mock 시세 서버 (spec 8장)
// 접속 예: ws://localhost:8787?rate=200&symbols=30&burst=1&seed=42

const PORT = Number(process.env.MOCK_PORT ?? 8787);
const SEND_INTERVAL_MS = 20;
const BURST_MS = 10_000;
const BURST_FACTOR = 5;

const wss = new WebSocketServer({ port: PORT });
let clientSeq = 0;

wss.on("connection", (ws, req) => {
  const id = ++clientSeq;
  const params = parseMockParams(new URL(req.url ?? "/", "http://localhost").searchParams);
  const generator = createMockGenerator(params);
  console.log(`[mock #${id}] 접속`, params);

  const send = (raw: string) => {
    const frame: Frame = { t: Date.now(), raw };
    ws.send(JSON.stringify(frame));
  };

  for (const raw of generator.snapshot()) send(raw);

  const startedAt = Date.now();
  let sentTotal = 0;
  let sentInSecond = 0;

  // 경과 시간 기준 "보냈어야 할 누적 건수"를 계산해 모자란 만큼 보낸다.
  // setInterval은 지연이 누적되므로 매번 고정 건수를 보내면 실제 rate가 목표보다 낮아진다.
  const expectedTotal = (elapsedMs: number) => {
    const base = (params.rate * elapsedMs) / 1000;
    const extra = params.burst ? (params.rate * (BURST_FACTOR - 1) * Math.min(elapsedMs, BURST_MS)) / 1000 : 0;
    return Math.floor(base + extra);
  };

  const sendTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const due = expectedTotal(Date.now() - startedAt) - sentTotal;
    for (let i = 0; i < due; i++) send(generator.next());
    sentTotal += due;
    sentInSecond += due;
  }, SEND_INTERVAL_MS);

  const logTimer = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const burstOn = params.burst && elapsed < BURST_MS;
    const target = params.rate * (burstOn ? BURST_FACTOR : 1);
    const bufferedKb = Math.round(ws.bufferedAmount / 1024);
    console.log(`[mock #${id}] ${sentInSecond}건/s (목표 ${target}${burstOn ? ", burst" : ""}) 버퍼 ${bufferedKb}KB`);
    sentInSecond = 0;
  }, 1000);

  ws.on("close", () => {
    clearInterval(sendTimer);
    clearInterval(logTimer);
    console.log(`[mock #${id}] 종료 (총 ${sentTotal}건)`);
  });
});

console.log(`[mock] ws://localhost:${PORT} 대기 중`);
