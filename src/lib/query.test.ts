import { describe, expect, it } from "vitest";
import { DEFAULT_MOCK_PARAMS, parseMockParams, parseMode, parseSource, toMockQuery, toSearchParams } from "./query";

describe("query", () => {
  it("값이 없으면 기본값을 쓴다", () => {
    expect(parseMockParams(new URLSearchParams())).toEqual(DEFAULT_MOCK_PARAMS);
  });

  it("rate, symbols, burst, seed를 읽는다", () => {
    expect(parseMockParams(new URLSearchParams("rate=500&symbols=10&burst=1&seed=7"))).toEqual({
      rate: 500,
      symbols: 10,
      burst: true,
      seed: 7,
    });
  });

  it("범위를 벗어나면 잘라내고, 숫자가 아니면 기본값을 쓴다", () => {
    const p = parseMockParams(new URLSearchParams("rate=999999&symbols=0&seed=abc"));
    expect(p.rate).toBe(5_000);
    expect(p.symbols).toBe(1);
    expect(p.seed).toBe(42);
  });

  it("모르는 모드는 naive로 처리한다", () => {
    expect(parseMode("optimized")).toBe("optimized");
    expect(parseMode("fast")).toBe("naive");
    expect(parseMode(undefined)).toBe("naive");
  });

  it("모르는 소스는 mock으로 처리한다", () => {
    expect(parseSource("kis")).toBe("kis");
    expect(parseSource("worker")).toBe("mock");
    expect(parseSource(null)).toBe("mock");
  });

  it("toMockQuery 결과를 다시 파싱하면 같은 값이 나온다", () => {
    const params = { rate: 100, symbols: 30, burst: true, seed: 3 };
    expect(parseMockParams(new URLSearchParams(toMockQuery(params)))).toEqual(params);
  });

  it("Next.js searchParams의 배열 값은 첫 번째만 쓴다", () => {
    expect(toSearchParams({ rate: ["50", "100"], mode: "batched", x: undefined }).toString()).toBe(
      "rate=50&mode=batched",
    );
  });
});
