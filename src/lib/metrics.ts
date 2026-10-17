import type { DataSource, MeasureResult, RenderMode } from "./types";

// 측정 지표 계산 (순수 함수, spec 10장)

/** nearest-rank 백분위수. 빈 배열이면 0 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? 0;
}

export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 경과 시간 동안의 초당 비율 */
export function perSecond(count: number, elapsedMs: number): number {
  return elapsedMs > 0 ? (count * 1000) / elapsedMs : 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type MeasureInput = {
  mode: RenderMode;
  source: DataSource;
  rate: number | null;
  elapsedMs: number;
  /** 1초 구간별 FPS */
  fpsSamples: readonly number[];
  frames: number;
  rowRenders: number;
  messages: number;
  longTasks: number;
  longTaskMs: number;
  latencies: readonly number[];
};

export function buildResult(input: MeasureInput): MeasureResult {
  return {
    mode: input.mode,
    source: input.source,
    rate: input.rate,
    fps: round1(perSecond(input.frames, input.elapsedMs)),
    fpsMin: round1(input.fpsSamples.length > 0 ? Math.min(...input.fpsSamples) : 0),
    renders: round1(perSecond(input.rowRenders, input.elapsedMs)),
    messages: round1(perSecond(input.messages, input.elapsedMs)),
    longTasks: input.longTasks,
    longTaskMs: Math.round(input.longTaskMs),
    p50: Math.round(percentile(input.latencies, 50)),
    p95: Math.round(percentile(input.latencies, 95)),
  };
}
