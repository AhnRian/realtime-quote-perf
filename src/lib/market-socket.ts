import { INITIAL_MODEL, shouldDeliver, transition, type ConnEvent, type ConnectionState, type Effect } from "./connection-state";
import { KIS_SYMBOLS } from "./kis-symbols";
import { symbolList, type SymbolInfo } from "./mock-generator";
import { parseFrameWithMeta } from "./parser";
import { countMessage } from "./perf-recorder";
import { toMockQuery } from "./query";
import type { ClientMessage, DataSource, MarketEvent, MockParams } from "./types";

// 브라우저 시세 연결 관리자 (spec 7.2). 세 렌더링 모드가 같은 연결 관리자를 쓴다.
// 상태 전이는 connection-state.ts의 순수 함수가 정하고, 여기서는 그 결과(effects)를 실제로 실행한다.
// 소스가 Mock이든 KIS 중계든 같은 내부 프레임을 받으므로 코드가 같다.

export type { ConnectionState };

/** 마지막 시세 수신 시각 (Date.now). 주문 패널의 "가격 지연" 경고와 3초 지연 배지에 쓴다 */
let lastMessageAt: number | null = null;

export function getLastMessageAt(): number | null {
  return lastMessageAt;
}

/** 복귀 측정 (spec 7.2): 복귀 → 스냅샷 반영, 복귀 → 첫 실시간 메시지, 숨김 중 수신 건수 */
export type ReconnectStats = {
  lastSnapshotMs: number | null;
  lastRealtimeMs: number | null;
  hiddenMessages: number;
  /** 마지막 숨김 동안 연결을 끊었는지 */
  disconnectedWhileHidden: boolean;
};

const stats: ReconnectStats = { lastSnapshotMs: null, lastRealtimeMs: null, hiddenMessages: 0, disconnectedWhileHidden: false };

export function getReconnectStats(): ReconnectStats {
  return { ...stats };
}

export function marketUrl(source: DataSource, params: MockParams): string {
  const host = typeof window === "undefined" ? "localhost" : window.location.hostname;
  return source === "kis" ? `ws://${host}:8788` : `ws://${host}:8787?${toMockQuery(params)}`;
}

export function marketSymbols(source: DataSource, params: MockParams): SymbolInfo[] {
  return source === "kis" ? KIS_SYMBOLS : symbolList(params.symbols);
}

/** 연결 후 메시지마다 onEvents 호출 (숨겨져 있으면 호출하지 않음). 반환값은 연결 해제 함수 */
export function connectMarket(
  url: string,
  codes: string[],
  handlers: { onEvents: (events: MarketEvent[]) => void; onStatus: (state: ConnectionState) => void },
): () => void {
  let model = INITIAL_MODEL;
  let ws: WebSocket | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  let visibleAt: number | null = null;
  let disposed = false;

  const send = (msg: ClientMessage) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const dispatch = (event: ConnEvent) => {
    if (disposed) return;
    const prevState = model.state;
    const result = transition(model, event);
    model = result.model;
    for (const effect of result.effects) run(effect);
    if (model.state !== prevState) handlers.onStatus(model.state);
  };

  const run = (effect: Effect) => {
    switch (effect.type) {
      case "connect":
        if (connectTimer) clearTimeout(connectTimer);
        connectTimer = setTimeout(open, effect.delayMs);
        break;
      case "disconnect":
        send({ type: "unsubscribe", codes });
        stats.disconnectedWhileHidden = true;
        ws?.close();
        break;
      case "subscribe":
        send({ type: "subscribe", codes });
        break;
      case "requestSnapshot":
        send({ type: "snapshot", codes });
        break;
      case "startHiddenTimer":
        if (hiddenTimer) clearTimeout(hiddenTimer);
        hiddenTimer = setTimeout(() => dispatch({ type: "hiddenTimeout" }), effect.ms);
        break;
      case "cancelHiddenTimer":
        if (hiddenTimer) clearTimeout(hiddenTimer);
        hiddenTimer = null;
        break;
    }
  };

  const open = () => {
    connectTimer = null;
    const socket = new WebSocket(url);
    ws = socket;
    socket.onopen = () => dispatch({ type: "open" });
    socket.onclose = () => {
      if (ws === socket) ws = null;
      dispatch({ type: "close" });
    };
    socket.onmessage = (e: MessageEvent<unknown>) => {
      if (typeof e.data !== "string") return;
      countMessage();
      lastMessageAt = Date.now();
      const parsed = parseFrameWithMeta(e.data);
      if (!parsed) return;

      if (!shouldDeliver(model)) {
        // 숨김: 즉시 화면 갱신 중지 (받은 메시지는 버린다)
        stats.hiddenMessages++;
        return;
      }
      if (visibleAt !== null) {
        const elapsed = performance.now() - visibleAt;
        if (parsed.snapshot && stats.lastSnapshotMs === null) stats.lastSnapshotMs = Math.round(elapsed);
        if (!parsed.snapshot) {
          stats.lastRealtimeMs = Math.round(elapsed);
          visibleAt = null;
        }
      }
      dispatch({ type: "message", snapshot: parsed.snapshot });
      handlers.onEvents(parsed.events);
    };
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      stats.hiddenMessages = 0;
      stats.disconnectedWhileHidden = false;
      dispatch({ type: "hidden" });
    } else {
      visibleAt = performance.now();
      stats.lastSnapshotMs = null;
      stats.lastRealtimeMs = null;
      dispatch({ type: "visible" });
    }
  };

  document.addEventListener("visibilitychange", onVisibility);
  dispatch({ type: "start", visible: document.visibilityState !== "hidden" });
  handlers.onStatus(model.state);

  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    if (connectTimer) clearTimeout(connectTimer);
    if (hiddenTimer) clearTimeout(hiddenTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  };
}
