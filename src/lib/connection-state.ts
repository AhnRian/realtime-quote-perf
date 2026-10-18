// 재연결 상태 전이 (spec 7.2). 순수 함수: (상태, 이벤트) → (다음 상태, 실행할 일).
// 소켓·타이머·visibilitychange 같은 부수 효과는 market-connection.ts가 effects를 보고 실행한다.
// 이렇게 나누면 "숨김 60초 → 종료", "백오프" 같은 시나리오를 타이머 없이 테스트할 수 있다.

export type ConnectionState = "connected" | "refreshing" | "reconnecting" | "disconnected";

export const HIDDEN_DISCONNECT_MS = 60_000;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 10_000;
/** 복귀 시 재연결 전 지터 (동시에 돌아온 사용자들이 한꺼번에 몰리지 않도록) */
export const VISIBLE_JITTER_MS = 300;

export type ConnModel = {
  state: ConnectionState;
  socket: "none" | "connecting" | "open";
  /** 연속 실패 횟수 (백오프 계산용) */
  attempt: number;
  visible: boolean;
  /** 숨김 60초로 일부러 끊은 상태 */
  pausedByHidden: boolean;
  /** "갱신 중": 첫 실시간 메시지를 기다리는 중 */
  awaitingRealtime: boolean;
};

export type ConnEvent =
  | { type: "start"; visible: boolean }
  | { type: "open" }
  | { type: "message"; snapshot: boolean }
  | { type: "close" }
  | { type: "hidden" }
  | { type: "hiddenTimeout" }
  | { type: "visible" };

export type Effect =
  | { type: "connect"; delayMs: number }
  /** 구독 해제를 보내고 소켓을 닫는다 */
  | { type: "disconnect" }
  | { type: "subscribe" }
  /** 연결이 살아 있을 때 복귀: 서버에 스냅샷을 다시 요청 */
  | { type: "requestSnapshot" }
  | { type: "startHiddenTimer"; ms: number }
  | { type: "cancelHiddenTimer" };

export const INITIAL_MODEL: ConnModel = {
  state: "reconnecting",
  socket: "none",
  attempt: 0,
  visible: true,
  pausedByHidden: false,
  awaitingRealtime: true,
};

/** 지수 백오프 + 지터: 0.5s → 1s → 2s → … 최대 10s, 여기에 최대 30% 랜덤 */
export function backoffDelay(attempt: number, rand: () => number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(base + base * 0.3 * rand());
}

/** 화면에 이벤트를 전달할지: 숨겨져 있으면 즉시 갱신 중지 */
export function shouldDeliver(model: ConnModel): boolean {
  return model.visible;
}

export function transition(
  model: ConnModel,
  event: ConnEvent,
  rand: () => number = Math.random,
): { model: ConnModel; effects: Effect[] } {
  switch (event.type) {
    case "start":
      return {
        model: { ...INITIAL_MODEL, visible: event.visible, socket: "connecting" },
        effects: [{ type: "connect", delayMs: 0 }],
      };

    case "open":
      // 연결되면 구독하고, 첫 실시간 메시지가 올 때까지 "갱신 중"
      return {
        model: { ...model, socket: "open", attempt: 0, state: "refreshing", awaitingRealtime: true },
        effects: [{ type: "subscribe" }],
      };

    case "message":
      if (event.snapshot || !model.awaitingRealtime) return { model, effects: [] };
      return { model: { ...model, state: "connected", awaitingRealtime: false }, effects: [] };

    case "close": {
      const closed = { ...model, socket: "none" as const };
      // 숨김 때문에 일부러 끊었거나, 숨겨진 동안 끊겼으면 복귀할 때까지 기다린다
      if (model.pausedByHidden || !model.visible) return { model: { ...closed, state: "disconnected" }, effects: [] };
      const attempt = model.attempt + 1;
      return {
        model: { ...closed, state: "reconnecting", attempt, socket: "connecting" },
        effects: [{ type: "connect", delayMs: backoffDelay(attempt, rand) }],
      };
    }

    case "hidden":
      return {
        model: { ...model, visible: false },
        effects: [{ type: "startHiddenTimer", ms: HIDDEN_DISCONNECT_MS }],
      };

    case "hiddenTimeout":
      if (model.visible || model.socket === "none") return { model, effects: [] };
      return {
        model: { ...model, pausedByHidden: true, state: "disconnected" },
        effects: [{ type: "disconnect" }],
      };

    case "visible": {
      const base = { ...model, visible: true, pausedByHidden: false, state: "refreshing" as const, awaitingRealtime: true };
      const cancel: Effect = { type: "cancelHiddenTimer" };
      if (model.socket === "open") return { model: base, effects: [cancel, { type: "requestSnapshot" }] };
      if (model.socket === "connecting") return { model: base, effects: [cancel] };
      return {
        model: { ...base, socket: "connecting", attempt: 0 },
        effects: [cancel, { type: "connect", delayMs: Math.round(VISIBLE_JITTER_MS * rand()) }],
      };
    }
  }
}
