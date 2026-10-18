import { describe, expect, it } from "vitest";
import { STALE_MS, SubmitGuard, checkPrice, createOrderKey, isStale } from "./order";

describe("isStale", () => {
  it("마지막 수신 후 3초가 넘으면 지연", () => {
    expect(isStale(1_000, 1_000 + STALE_MS)).toBe(false);
    expect(isStale(1_000, 1_001 + STALE_MS)).toBe(true);
  });

  it("한 번도 받은 적이 없으면 지연", () => {
    expect(isStale(null, 0)).toBe(true);
  });
});

describe("SubmitGuard", () => {
  it("처리 중에는 두 번째 제출을 막고, 끝나면 다시 받는다", () => {
    const guard = new SubmitGuard();
    expect(guard.tryBegin()).toBe(true);
    expect(guard.tryBegin()).toBe(false);
    expect(guard.isPending).toBe(true);
    guard.end();
    expect(guard.tryBegin()).toBe(true);
  });
});

describe("createOrderKey", () => {
  it("주문마다 다른 키를 만든다", () => {
    const keys = new Set(Array.from({ length: 100 }, createOrderKey));
    expect(keys.size).toBe(100);
  });
});

describe("checkPrice", () => {
  it("열 때 가격과 최신가의 차이를 알려준다", () => {
    expect(checkPrice(71_900, 71_900)).toEqual({ changed: false, diff: 0 });
    expect(checkPrice(71_900, 72_000)).toEqual({ changed: true, diff: 100 });
  });
});
