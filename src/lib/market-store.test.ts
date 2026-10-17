import { describe, expect, it, vi } from "vitest";
import { TRADE_LIMIT } from "./market-state";
import { MarketStore, storeKey } from "./market-store";
import type { MarketEvent, Tick } from "./types";

function tick(code: string, price: number, sentAt = 0): MarketEvent {
  const t: Tick = { code, time: "090000", price, change: 0, rate: 0, tradeVol: 1, accVol: 1, sentAt };
  return { type: "tick", tick: t };
}

describe("MarketStore", () => {
  it("flush 전에는 구독자에게 알리지 않는다", () => {
    const store = new MarketStore();
    const listener = vi.fn();
    store.subscribe(storeKey.quote("A"), listener);
    store.enqueue(tick("A", 100));
    expect(listener).not.toHaveBeenCalled();
    expect(store.getQuote("A")).toBeUndefined();
  });

  it("한 종목만 바뀌면 그 종목 구독자에게만 알린다", () => {
    const store = new MarketStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(storeKey.quote("A"), a);
    store.subscribe(storeKey.quote("B"), b);
    store.enqueue(tick("A", 100));
    store.enqueue(tick("A", 101));
    store.flush(0);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(store.getQuote("A")?.tick.price).toBe(101);
  });

  it("빈 버퍼면 flush가 아무것도 알리지 않는다", () => {
    const store = new MarketStore();
    const frame = vi.fn();
    store.subscribe(storeKey.frame, frame);
    expect(store.flush(0)).toBe(false);
    expect(frame).not.toHaveBeenCalled();
  });

  it("체결 리스트가 50건을 넘지 않고 최신이 앞에 온다", () => {
    const store = new MarketStore();
    for (let i = 0; i < TRADE_LIMIT * 3; i++) {
      store.enqueue(tick("A", i));
      if (i % 7 === 0) store.flush(0);
    }
    store.flush(0);
    const trades = store.getTrades("A");
    expect(trades).toHaveLength(TRADE_LIMIT);
    expect(trades[0]?.tick.price).toBe(TRADE_LIMIT * 3 - 1);
  });

  it("체결마다 고유 id가 붙고 새 체결이 들어와도 기존 id는 그대로다", () => {
    const store = new MarketStore();
    store.enqueue(tick("A", 1));
    store.flush(0);
    const firstId = store.getTrades("A")[0]?.id;
    store.enqueue(tick("A", 2));
    store.flush(0);
    const [newest, previous] = store.getTrades("A");
    expect(previous?.id).toBe(firstId);
    expect(newest?.id).not.toBe(firstId);
  });

  it("변경이 없으면 getTrades가 같은 배열 참조를 돌려준다 (useSyncExternalStore 요구사항)", () => {
    const store = new MarketStore();
    store.enqueue(tick("A", 1));
    store.flush(0);
    const first = store.getTrades("A");
    expect(store.getTrades("A")).toBe(first);
    store.enqueue(tick("B", 1));
    store.flush(0);
    expect(store.getTrades("A")).toBe(first);
    store.enqueue(tick("A", 2));
    store.flush(0);
    expect(store.getTrades("A")).not.toBe(first);
  });

  it("가격이 바뀌면 300ms 깜빡이고, 만료는 다음 flush에서 그 종목에만 알린다", () => {
    const store = new MarketStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(storeKey.quote("A"), a);
    store.subscribe(storeKey.quote("B"), b);
    const step = (price: number, now: number) => {
      store.enqueue(tick("A", price));
      store.flush(now);
      return store.getQuote("A")?.flash;
    };
    expect(step(100, 0)).toBeNull();
    expect(step(110, 100)).toBe("up");
    // 같은 가격 체결이 와도 깜빡임은 유지
    expect(step(110, 200)).toBe("up");
    a.mockClear();
    expect(store.flush(350)).toBe(false); // 아직 만료 전 (100 + 300)
    expect(store.flush(400)).toBe(true);
    expect(store.getQuote("A")?.flash).toBeNull();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(step(90, 500)).toBe("down");
  });

  it("반영된 메시지의 sentAt을 한 번만 꺼낼 수 있다", () => {
    const store = new MarketStore();
    store.enqueue(tick("A", 1, 10));
    store.enqueue(tick("A", 2, 11));
    store.flush(0);
    expect(store.takePendingSentAt()).toEqual([10, 11]);
    expect(store.takePendingSentAt()).toEqual([]);
  });
});
