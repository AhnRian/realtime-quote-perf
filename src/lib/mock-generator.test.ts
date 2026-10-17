import { describe, expect, it } from "vitest";
import { createMockGenerator, symbolName } from "./mock-generator";
import { parseRaw } from "./parser";
import { tickSize } from "./tick-size";
import type { MarketEvent } from "./types";

function take(seed: number, n: number): string[] {
  const g = createMockGenerator({ seed, symbols: 30 });
  return [...g.snapshot(), ...Array.from({ length: n }, () => g.next())];
}

function parseAll(raws: string[]): MarketEvent[] {
  return raws.flatMap((raw) => {
    const events = parseRaw(raw, 0);
    if (!events) throw new Error(`파싱 실패: ${raw.slice(0, 40)}`);
    return events;
  });
}

describe("mock-generator", () => {
  it("같은 seed면 같은 메시지 순서가 나온다", () => {
    expect(take(42, 2_000)).toEqual(take(42, 2_000));
  });

  it("다른 seed면 다른 메시지가 나온다", () => {
    expect(take(1, 200)).not.toEqual(take(2, 200));
  });

  it("생성된 raw를 파서가 모두 파싱한다", () => {
    expect(() => parseAll(take(42, 5_000))).not.toThrow();
  });

  it("snapshot은 전 종목의 체결·호가를 1건씩 준다", () => {
    const g = createMockGenerator({ seed: 42, symbols: 30 });
    const events = parseAll(g.snapshot());
    const tickCodes = new Set(events.flatMap((e) => (e.type === "tick" ? [e.tick.code] : [])));
    const bookCodes = new Set(events.flatMap((e) => (e.type === "book" ? [e.book.code] : [])));
    expect(tickCodes.size).toBe(30);
    expect(bookCodes.size).toBe(30);
  });

  it("체결:호가 비율이 약 7:3이다", () => {
    const g = createMockGenerator({ seed: 42, symbols: 30 });
    const events = parseAll(Array.from({ length: 10_000 }, () => g.next()));
    const tickRatio = events.filter((e) => e.type === "tick").length / events.length;
    expect(tickRatio).toBeGreaterThan(0.67);
    expect(tickRatio).toBeLessThan(0.73);
  });

  it("모든 가격이 호가 단위를 지킨다", () => {
    const events = parseAll(take(42, 5_000));
    const prices = events.flatMap((e) =>
      e.type === "tick" ? [e.tick.price] : [...e.book.asks, ...e.book.bids].map((l) => l.price),
    );
    for (const p of prices) {
      expect(p % tickSize(p), `가격 ${p}`).toBe(0);
    }
  });

  it("호가는 매도가 매수보다 높고 단계별로 정렬되어 있다", () => {
    for (const e of parseAll(take(7, 1_000))) {
      if (e.type !== "book") continue;
      const asks = e.book.asks.map((l) => l.price);
      const bids = e.book.bids.map((l) => l.price);
      expect(asks[0]!).toBeGreaterThan(bids[0]!);
      expect([...asks].sort((a, b) => a - b)).toEqual(asks);
      expect([...bids].sort((a, b) => b - a)).toEqual(bids);
    }
  });

  it("종목명을 코드로 찾는다", () => {
    expect(symbolName("900001")).toBe("한빛전자");
    expect(symbolName("900031")).toBe("가상종목31");
  });
});
