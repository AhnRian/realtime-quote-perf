import { describe, expect, it } from "vitest";
import { VITALS_MAX_SAMPLES, metricRoute, parseVitalsPayload } from "./vitals";

describe("parseVitalsPayload", () => {
  it("올바른 묶음을 받아들인다", () => {
    expect(parseVitalsPayload({ mode: "optimized", order: [12, 30.5], latency: [] })).toEqual({
      mode: "optimized",
      order: [12, 30.5],
      latency: [],
    });
  });

  it.each([
    ["객체가 아님", "x"],
    ["모르는 모드", { mode: "fast", order: [], latency: [] }],
    ["숫자가 아닌 샘플", { mode: "naive", order: ["1"], latency: [] }],
    ["음수", { mode: "naive", order: [-1], latency: [] }],
    ["배열 누락", { mode: "naive", order: [] }],
    ["샘플 과다", { mode: "naive", order: Array(VITALS_MAX_SAMPLES + 1).fill(1), latency: [] }],
  ])("%s이면 null", (_, body) => {
    expect(parseVitalsPayload(body)).toBeNull();
  });
});

describe("metricRoute", () => {
  it("종목 코드별 경로를 하나로 묶는다 (라벨 카디널리티 제한)", () => {
    expect(metricRoute("/stocks/005930")).toBe("/stocks/[code]");
    expect(metricRoute("/stocks/900001?x=1")).toBe("/stocks/[code]");
    expect(metricRoute("/?mode=naive")).toBe("/");
    expect(metricRoute("/_next/static/chunks/a.js")).toBe("/_next/*");
    expect(metricRoute("/api/metrics")).toBe("/api/metrics");
    expect(metricRoute("/favicon.ico")).toBe("other");
  });
});
