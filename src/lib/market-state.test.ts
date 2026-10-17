import { describe, expect, it } from "vitest";
import { EMPTY_MARKET, TRADE_LIMIT, applyEvent, flashDirection } from "./market-state";
import type { MarketEvent, Tick } from "./types";

function tick(code: string, price: number, sentAt = 0): MarketEvent {
  const t: Tick = { code, time: "090000", price, change: 0, rate: 0, tradeVol: 1, accVol: 1, sentAt };
  return { type: "tick", tick: t };
}

describe("applyEvent", () => {
  it("체결은 최신 시세를 바꾸고 체결 리스트 맨 앞에 넣는다", () => {
    let s = applyEvent(EMPTY_MARKET, tick("A", 100));
    s = applyEvent(s, tick("A", 110));
    expect(s.quotes.A?.price).toBe(110);
    expect(s.trades.A?.map((t) => t.price)).toEqual([110, 100]);
  });

  it("체결 리스트는 종목별로 50건을 넘지 않고 오래된 것부터 버린다", () => {
    let s = EMPTY_MARKET;
    for (let i = 0; i < TRADE_LIMIT + 20; i++) s = applyEvent(s, tick("A", i));
    expect(s.trades.A).toHaveLength(TRADE_LIMIT);
    expect(s.trades.A?.[0]?.price).toBe(TRADE_LIMIT + 19);
    expect(s.trades.A?.at(-1)?.price).toBe(20);
  });

  it("호가는 종목별 최신값으로 덮어쓴다", () => {
    const book = { code: "A", asks: [], bids: [], sentAt: 1 };
    const s = applyEvent(EMPTY_MARKET, { type: "book", book });
    expect(s.books.A).toBe(book);
  });

  it("원래 상태를 바꾸지 않는다 (불변)", () => {
    const before = applyEvent(EMPTY_MARKET, tick("A", 100));
    applyEvent(before, tick("A", 200));
    expect(before.quotes.A?.price).toBe(100);
    expect(EMPTY_MARKET.quotes).toEqual({});
  });
});

describe("flashDirection", () => {
  it("오르면 up, 내리면 down, 같거나 처음이면 null", () => {
    expect(flashDirection(100, 110)).toBe("up");
    expect(flashDirection(100, 90)).toBe("down");
    expect(flashDirection(100, 100)).toBeNull();
    expect(flashDirection(undefined, 100)).toBeNull();
  });
});
