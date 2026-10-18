import { describe, expect, it } from "vitest";
import {
  BACKOFF_MAX_MS,
  HIDDEN_DISCONNECT_MS,
  INITIAL_MODEL,
  backoffDelay,
  shouldDeliver,
  transition,
  type ConnEvent,
  type ConnModel,
  type Effect,
} from "./connection-state";

const zero = () => 0;

/** 이벤트를 차례로 적용하고 마지막 모델과 모든 effect를 돌려준다 */
function run(events: ConnEvent[], rand = zero): { model: ConnModel; effects: Effect[][] } {
  let model = INITIAL_MODEL;
  const effects: Effect[][] = [];
  for (const e of events) {
    const r = transition(model, e, rand);
    model = r.model;
    effects.push(r.effects);
  }
  return { model, effects };
}

describe("connection-state", () => {
  it("시작 → 연결 → 구독 → 첫 실시간 메시지에 연결됨", () => {
    const { model, effects } = run([{ type: "start", visible: true }, { type: "open" }, { type: "message", snapshot: false }]);
    expect(effects[0]).toEqual([{ type: "connect", delayMs: 0 }]);
    expect(effects[1]).toEqual([{ type: "subscribe" }]);
    expect(model.state).toBe("connected");
  });

  it("스냅샷 메시지로는 '갱신 중'이 풀리지 않는다", () => {
    const { model } = run([{ type: "start", visible: true }, { type: "open" }, { type: "message", snapshot: true }]);
    expect(model.state).toBe("refreshing");
  });

  it("끊기면 지수 백오프로 재연결한다 (0.5s → 1s → 2s …)", () => {
    const { effects, model } = run([
      { type: "start", visible: true },
      { type: "close" },
      { type: "close" },
      { type: "close" },
    ]);
    expect(effects.slice(1).map((e) => e[0])).toEqual([
      { type: "connect", delayMs: 500 },
      { type: "connect", delayMs: 1_000 },
      { type: "connect", delayMs: 2_000 },
    ]);
    expect(model.state).toBe("reconnecting");
    expect(model.attempt).toBe(3);
  });

  it("백오프는 최대 10초 + 지터 30%를 넘지 않는다", () => {
    expect(backoffDelay(20, zero)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(20, () => 1)).toBe(BACKOFF_MAX_MS * 1.3);
  });

  it("다시 연결되면 실패 횟수를 초기화한다", () => {
    const { model } = run([{ type: "start", visible: true }, { type: "close" }, { type: "close" }, { type: "open" }]);
    expect(model.attempt).toBe(0);
  });

  it("숨기면 즉시 화면 갱신을 멈추고 60초 타이머를 건다", () => {
    const { model, effects } = run([{ type: "start", visible: true }, { type: "open" }, { type: "hidden" }]);
    expect(shouldDeliver(model)).toBe(false);
    expect(effects[2]).toEqual([{ type: "startHiddenTimer", ms: HIDDEN_DISCONNECT_MS }]);
  });

  it("숨김 60초 → 구독 해제 + 연결 종료, 이후 close에도 재연결하지 않는다", () => {
    const { model, effects } = run([
      { type: "start", visible: true },
      { type: "open" },
      { type: "hidden" },
      { type: "hiddenTimeout" },
      { type: "close" },
    ]);
    expect(effects[3]).toEqual([{ type: "disconnect" }]);
    expect(effects[4]).toEqual([]);
    expect(model.state).toBe("disconnected");
  });

  it("60초 전에 돌아오면 연결을 유지한 채 스냅샷만 다시 요청한다", () => {
    const { model, effects } = run([{ type: "start", visible: true }, { type: "open" }, { type: "hidden" }, { type: "visible" }]);
    expect(effects[3]).toEqual([{ type: "cancelHiddenTimer" }, { type: "requestSnapshot" }]);
    expect(model.state).toBe("refreshing");
    expect(shouldDeliver(model)).toBe(true);
  });

  it("끊긴 뒤 돌아오면 즉시 '갱신 중' → 0~300ms 지터 후 재연결 → 스냅샷 → 첫 실시간에 연결됨", () => {
    const { model, effects } = run(
      [
        { type: "start", visible: true },
        { type: "open" },
        { type: "hidden" },
        { type: "hiddenTimeout" },
        { type: "close" },
        { type: "visible" },
      ],
      () => 0.5,
    );
    expect(model.state).toBe("refreshing");
    expect(effects[5]).toEqual([{ type: "cancelHiddenTimer" }, { type: "connect", delayMs: 150 }]);

    const opened = transition(model, { type: "open" }).model;
    const afterSnapshot = transition(opened, { type: "message", snapshot: true }).model;
    expect(afterSnapshot.state).toBe("refreshing");
    expect(transition(afterSnapshot, { type: "message", snapshot: false }).model.state).toBe("connected");
  });

  it("숨겨진 동안 연결이 끊기면 재연결하지 않고 복귀를 기다린다", () => {
    const { model, effects } = run([{ type: "start", visible: true }, { type: "open" }, { type: "hidden" }, { type: "close" }]);
    expect(effects[3]).toEqual([]);
    expect(model.state).toBe("disconnected");
  });
});
