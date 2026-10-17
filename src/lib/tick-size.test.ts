import { describe, expect, it } from "vitest";
import { alignToTick, tickDown, tickSize, tickUp } from "./tick-size";

describe("tick-size", () => {
  it.each([
    [1_999, 1],
    [2_000, 5],
    [19_990, 10],
    [20_000, 50],
    [199_900, 100],
    [200_000, 500],
    [500_000, 1_000],
  ])("%d원의 호가 단위는 %d원", (price, unit) => {
    expect(tickSize(price)).toBe(unit);
  });

  it("구간 경계를 넘을 때 단위가 바뀐다", () => {
    expect(tickUp(1_999)).toBe(2_000);
    expect(tickUp(2_000)).toBe(2_005);
    expect(tickDown(2_000)).toBe(1_999);
    expect(tickDown(20_000)).toBe(19_990);
  });

  it("호가 단위로 내림한다", () => {
    expect(alignToTick(71_949)).toBe(71_900);
    expect(alignToTick(1_234)).toBe(1_234);
  });
});
