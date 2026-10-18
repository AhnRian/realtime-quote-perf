import { describe, expect, it } from "vitest";
import { Reservoir } from "./perf-recorder";

describe("Reservoir", () => {
  it("상한보다 적게 들어오면 전부 남긴다", () => {
    const r = new Reservoir(5);
    [1, 2, 3].forEach((v) => r.add(v));
    expect(r.take()).toEqual([1, 2, 3]);
  });

  it("많이 들어와도 상한을 넘지 않고, 앞부분만이 아니라 전체에서 고르게 뽑는다", () => {
    const r = new Reservoir(1_000);
    for (let i = 0; i < 100_000; i++) r.add(i);
    const taken = r.take();
    expect(taken).toHaveLength(1_000);
    // 앞쪽 1,000개만 남았다면 평균이 500 근처, 고르게 뽑혔다면 50,000 근처
    const avg = taken.reduce((a, b) => a + b, 0) / taken.length;
    expect(avg).toBeGreaterThan(40_000);
    expect(avg).toBeLessThan(60_000);
  });

  it("take 후에는 비어 있다", () => {
    const r = new Reservoir(3);
    r.add(1);
    r.take();
    expect(r.take()).toEqual([]);
  });
});
