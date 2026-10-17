import { describe, expect, it } from "vitest";
import { average, buildResult, percentile, perSecond } from "./metrics";

describe("percentile", () => {
  it("nearest-rank 방식으로 계산한다", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 100)).toBe(100);
  });

  it("정렬되지 않은 입력도 처리하고 원본을 바꾸지 않는다", () => {
    const values = [30, 10, 20];
    expect(percentile(values, 50)).toBe(20);
    expect(values).toEqual([30, 10, 20]);
  });

  it("빈 배열이면 0, 1개면 그 값", () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
  });
});

describe("average / perSecond", () => {
  it("평균과 초당 비율", () => {
    expect(average([1, 2, 3])).toBe(2);
    expect(average([])).toBe(0);
    expect(perSecond(300, 30_000)).toBe(10);
    expect(perSecond(5, 0)).toBe(0);
  });
});

describe("buildResult", () => {
  it("30초 측정값을 spec 10장 JSON 형식으로 만든다", () => {
    const result = buildResult({
      mode: "naive",
      source: "mock",
      rate: 200,
      elapsedMs: 30_000,
      fpsSamples: [60, 58, 31.24, 59],
      frames: 1_650,
      rowRenders: 90_000,
      messages: 6_000,
      longTasks: 12,
      longTaskMs: 1_234.6,
      latencies: [5, 10, 15, 20, 100],
    });
    expect(result).toEqual({
      mode: "naive",
      source: "mock",
      rate: 200,
      fps: 55,
      fpsMin: 31.2,
      renders: 3_000,
      messages: 200,
      longTasks: 12,
      longTaskMs: 1_235,
      p50: 15,
      p95: 100,
    });
  });

  it("지연 샘플이 없으면 p50·p95는 0", () => {
    const result = buildResult({
      mode: "optimized",
      source: "kis",
      rate: null,
      elapsedMs: 30_000,
      fpsSamples: [],
      frames: 0,
      rowRenders: 0,
      messages: 0,
      longTasks: 0,
      longTaskMs: 0,
      latencies: [],
    });
    expect(result.p50).toBe(0);
    expect(result.p95).toBe(0);
    expect(result.fpsMin).toBe(0);
  });
});
