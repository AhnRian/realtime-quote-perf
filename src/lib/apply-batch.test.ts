import { describe, expect, it } from "vitest";
import { addToBatch, applyBatch, batchSentAts, createBatch, isBatchEmpty, updateFlashes } from "./apply-batch";
import { EMPTY_MARKET, TRADE_LIMIT, applyEvent } from "./market-state";
import type { MarketEvent, OrderBook, Tick } from "./types";

function tick(code: string, price: number, sentAt = 0): MarketEvent {
  const t: Tick = { code, time: "090000", price, change: 0, rate: 0, tradeVol: 1, accVol: 1, sentAt };
  return { type: "tick", tick: t };
}

function book(code: string, sentAt: number): MarketEvent {
  const b: OrderBook = { code, asks: [], bids: [], sentAt };
  return { type: "book", book: b };
}

function batchOf(...events: MarketEvent[]) {
  const batch = createBatch();
  for (const e of events) addToBatch(batch, e);
  return batch;
}

describe("addToBatch / applyBatch", () => {
  it("같은 종목 여러 메시지가 한 프레임에 오면 시세는 최신값만 반영한다", () => {
    const batch = batchOf(tick("A", 100), tick("A", 110), tick("A", 105));
    expect(batch.quotes.size).toBe(1);
    expect(applyBatch(EMPTY_MARKET, batch).quotes.A?.price).toBe(105);
  });

  it("호가도 종목별 최신값만 남긴다", () => {
    const batch = batchOf(book("A", 1), book("A", 2), book("B", 3));
    expect(batch.books.size).toBe(2);
    expect(applyBatch(EMPTY_MARKET, batch).books.A?.sentAt).toBe(2);
  });

  it("체결은 사이에 들어온 것까지 모두 남기고 최신이 앞에 온다", () => {
    const state = applyBatch(EMPTY_MARKET, batchOf(tick("A", 100), tick("B", 1), tick("A", 110), tick("A", 105)));
    expect(state.trades.A?.map((t) => t.price)).toEqual([105, 110, 100]);
    expect(state.trades.B?.map((t) => t.price)).toEqual([1]);
  });

  it("메시지를 하나씩 적용한 결과(naive)와 같은 화면 상태가 된다", () => {
    const events = [tick("A", 1), book("A", 1), tick("B", 2), tick("A", 3), book("A", 2), tick("A", 4)];
    const naive = events.reduce(applyEvent, EMPTY_MARKET);
    expect(applyBatch(EMPTY_MARKET, batchOf(...events))).toEqual(naive);
  });

  it("체결은 종목별 50건을 넘지 않는다", () => {
    let state = EMPTY_MARKET;
    for (let frame = 0; frame < 3; frame++) {
      const events = Array.from({ length: 30 }, (_, i) => tick("A", frame * 100 + i));
      state = applyBatch(state, batchOf(...events));
    }
    expect(state.trades.A).toHaveLength(TRADE_LIMIT);
    expect(state.trades.A?.[0]?.price).toBe(229);
  });

  it("빈 버퍼면 같은 상태 객체를 돌려준다", () => {
    expect(isBatchEmpty(createBatch())).toBe(true);
    expect(applyBatch(EMPTY_MARKET, createBatch())).toBe(EMPTY_MARKET);
  });

  it("표시 지연용 sentAt은 모든 체결과 살아남은 호가만 포함한다", () => {
    const batch = batchOf(tick("A", 1, 10), tick("A", 2, 11), book("A", 12), book("A", 13));
    expect(batchSentAts(batch).sort()).toEqual([10, 11, 13]);
  });
});

describe("updateFlashes", () => {
  const prevQuotes = { A: (tick("A", 100) as { tick: Tick }).tick };

  it("가격이 바뀐 종목만 깜빡임을 시작한다", () => {
    const flashes = updateFlashes({}, prevQuotes, batchOf(tick("A", 110), tick("B", 50)), 1_000, 300);
    expect(flashes).toEqual({ A: { dir: "up", until: 1_300 } });
  });

  it("만료된 깜빡임은 지운다", () => {
    const flashes = updateFlashes({ A: { dir: "down", until: 900 } }, prevQuotes, createBatch(), 1_000, 300);
    expect(flashes).toEqual({});
  });

  it("바뀐 게 없으면 같은 객체를 돌려준다", () => {
    const before = { A: { dir: "up" as const, until: 2_000 } };
    expect(updateFlashes(before, prevQuotes, batchOf(tick("A", 100)), 1_000, 300)).toBe(before);
  });
});
