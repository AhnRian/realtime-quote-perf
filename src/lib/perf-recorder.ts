import { buildResult, percentile, perSecond } from "./metrics";
import type { DataSource, MeasureResult, RenderMode } from "./types";
import { VITALS_MAX_SAMPLES, type VitalsPayload } from "./vitals";

// 브라우저 성능 수집기 (모듈 싱글턴).
// 렌더·메시지 카운터는 렌더 경로에서 호출되므로 숫자 증가만 하고, 계산은 1초마다 한 번 한다.
// React Profiler는 프로덕션 빌드에서 동작하지 않아 쓰지 않는다 (spec 10장).

const MEASURE_MS = 30_000;
/** 실시간 표시용 지연 샘플 상한 (1초 분량만 유지) */
const LIVE_LATENCY_LIMIT = 5_000;

const totals = { frames: 0, rowRenders: 0, messages: 0, longTasks: 0, longTaskMs: 0 };
let liveLatencies: number[] = [];
let measureLatencies: number[] | null = null;

/** 종목 리스트 행 렌더 함수 안에서 호출 */
export function countRowRender(): void {
  totals.rowRenders++;
}

/** 웹소켓 메시지 수신 시 호출 */
export function countMessage(): void {
  totals.messages++;
}

/** 커밋 직후 호출: 이번 커밋에 반영된 메시지들의 sentAt */
export function recordLatencies(sentAts: readonly number[]): void {
  if (sentAts.length === 0) return;
  const now = Date.now();
  for (const sentAt of sentAts) {
    const latency = now - sentAt;
    if (liveLatencies.length < LIVE_LATENCY_LIMIT) liveLatencies.push(latency);
    measureLatencies?.push(latency);
    vitalsLatency.add(latency);
  }
}

// ── /api/vitals 전송 (spec 5.4, 6.3) ──
// 5초 동안 모은 샘플을 서버로 보내 Prometheus 히스토그램에 쌓는다.
// rate 500이면 5초에 지연 샘플이 수천 개라, 저수지 샘플링으로 상한 안에서 고르게 뽑는다.

const VITALS_INTERVAL_MS = 5_000;

/** 저수지 샘플링: 몇 개가 들어오든 최대 limit개를 고르게 남긴다 */
export class Reservoir {
  private items: number[] = [];
  private seen = 0;

  constructor(private readonly limit: number) {}

  add(value: number): void {
    this.seen++;
    if (this.items.length < this.limit) {
      this.items.push(value);
      return;
    }
    const j = Math.floor(Math.random() * this.seen);
    if (j < this.limit) this.items[j] = value;
  }

  take(): number[] {
    const taken = this.items;
    this.items = [];
    this.seen = 0;
    return taken;
  }
}

const vitalsLatency = new Reservoir(VITALS_MAX_SAMPLES);
const vitalsOrder = new Reservoir(VITALS_MAX_SAMPLES);
let vitalsTimer: ReturnType<typeof setInterval> | null = null;

/** 주문 반응 시간 기록 (A2에서 호출) */
export function recordOrderResponse(ms: number): void {
  vitalsOrder.add(ms);
}

export function startVitalsReporting(mode: RenderMode): void {
  if (vitalsTimer) return;
  vitalsTimer = setInterval(() => {
    const payload: VitalsPayload = { mode, order: vitalsOrder.take(), latency: vitalsLatency.take() };
    if (payload.order.length === 0 && payload.latency.length === 0) return;
    void fetch("/api/vitals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // 지표 전송 실패는 화면 동작에 영향을 주지 않도록 무시한다
    });
  }, VITALS_INTERVAL_MS);
}

export type LiveStats = {
  fps: number;
  renders: number;
  messages: number;
  longTasks: number;
  longTaskMs: number;
  p50: number;
  p95: number;
};

export type MeasureState =
  | { status: "idle" }
  | { status: "running"; remainingSec: number }
  | { status: "done"; result: MeasureResult };

type Listener = (live: LiveStats, measure: MeasureState) => void;

let started = false;
const listeners = new Set<Listener>();
let measureState: MeasureState = { status: "idle" };
let measureCtx: {
  mode: RenderMode;
  source: DataSource;
  rate: number | null;
  startedAt: number;
  base: typeof totals;
  fpsSamples: number[];
} | null = null;

function start() {
  if (started) return;
  started = true;

  const loop = () => {
    totals.frames++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        totals.longTasks++;
        totals.longTaskMs += entry.duration;
      }
    }).observe({ type: "longtask" });
  }

  let prev = { ...totals };
  let prevAt = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = now - prevAt;
    const live: LiveStats = {
      fps: Math.round(perSecond(totals.frames - prev.frames, dt)),
      renders: Math.round(perSecond(totals.rowRenders - prev.rowRenders, dt)),
      messages: Math.round(perSecond(totals.messages - prev.messages, dt)),
      longTasks: totals.longTasks - prev.longTasks,
      longTaskMs: Math.round(totals.longTaskMs - prev.longTaskMs),
      p50: Math.round(percentile(liveLatencies, 50)),
      p95: Math.round(percentile(liveLatencies, 95)),
    };
    liveLatencies = [];
    prev = { ...totals };
    prevAt = now;

    if (measureCtx) {
      measureCtx.fpsSamples.push(live.fps);
      const elapsed = now - measureCtx.startedAt;
      measureState =
        elapsed >= MEASURE_MS
          ? { status: "done", result: finishMeasure(elapsed) }
          : { status: "running", remainingSec: Math.ceil((MEASURE_MS - elapsed) / 1000) };
    }
    for (const listener of listeners) listener(live, measureState);
  }, 1000);
}

function finishMeasure(elapsedMs: number): MeasureResult {
  const ctx = measureCtx;
  if (!ctx) throw new Error("측정 중이 아님");
  const result = buildResult({
    mode: ctx.mode,
    source: ctx.source,
    rate: ctx.rate,
    elapsedMs,
    fpsSamples: ctx.fpsSamples,
    frames: totals.frames - ctx.base.frames,
    rowRenders: totals.rowRenders - ctx.base.rowRenders,
    messages: totals.messages - ctx.base.messages,
    longTasks: totals.longTasks - ctx.base.longTasks,
    longTaskMs: totals.longTaskMs - ctx.base.longTaskMs,
    latencies: measureLatencies ?? [],
  });
  measureCtx = null;
  measureLatencies = null;
  return result;
}

export function subscribePerf(listener: Listener): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 30초 측정 시작. 결과는 subscribePerf 리스너로 전달된다 */
export function startMeasure(mode: RenderMode, source: DataSource, rate: number | null): void {
  start();
  measureCtx = { mode, source, rate, startedAt: performance.now(), base: { ...totals }, fpsSamples: [] };
  measureLatencies = [];
  measureState = { status: "running", remainingSec: MEASURE_MS / 1000 };
}
