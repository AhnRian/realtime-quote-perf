import { KIS_SYMBOLS } from "./kis-symbols";
import { symbolList, type SymbolInfo } from "./mock-generator";
import { parseFrame } from "./parser";
import { countMessage } from "./perf-recorder";
import { toMockQuery } from "./query";
import type { DataSource, MarketEvent, MockParams } from "./types";

// 브라우저 웹소켓 연결. 소스가 Mock이든 KIS 중계든 같은 내부 프레임을 받으므로 코드가 같다.

export type ConnectionStatus = "connecting" | "open" | "closed";

export function marketUrl(source: DataSource, params: MockParams): string {
  const host = typeof window === "undefined" ? "localhost" : window.location.hostname;
  return source === "kis" ? `ws://${host}:8788` : `ws://${host}:8787?${toMockQuery(params)}`;
}

export function marketSymbols(source: DataSource, params: MockParams): SymbolInfo[] {
  return source === "kis" ? KIS_SYMBOLS : symbolList(params.symbols);
}

/** 연결 후 메시지마다 onEvents 호출. 반환값은 연결 해제 함수 (재연결은 T9) */
export function connectMarket(
  url: string,
  handlers: { onEvents: (events: MarketEvent[]) => void; onStatus: (status: ConnectionStatus) => void },
): () => void {
  const ws = new WebSocket(url);
  handlers.onStatus("connecting");
  ws.onopen = () => handlers.onStatus("open");
  ws.onclose = () => handlers.onStatus("closed");
  ws.onmessage = (e: MessageEvent<unknown>) => {
    if (typeof e.data !== "string") return;
    countMessage();
    const events = parseFrame(e.data);
    if (events) handlers.onEvents(events);
  };
  return () => {
    ws.onclose = null;
    ws.close();
  };
}
