import { Counter, Histogram, Registry, collectDefaultMetrics } from "@prometheus-io/client";
import { metricRoute, type VitalsPayload } from "@/lib/vitals";

// Prometheus 지표 (spec 6.3).
// 커스텀 서버(server/next-server.ts)와 Next 번들(/api/metrics, /api/vitals)이 같은 프로세스에서
// 이 모듈을 각자 불러오므로, 저장소를 globalThis에 한 번만 만들어 공유한다.
// (모듈 변수에 두면 번들마다 다른 인스턴스가 생겨 /api/metrics에 값이 비어 보인다)

type Metrics = {
  registry: Registry;
  httpDuration: Histogram<"route" | "method" | "status">;
  browserOrder: Histogram<"mode">;
  browserLatency: Histogram<"mode">;
  vitalsReports: Counter<"mode">;
};

const holder = globalThis as typeof globalThis & { __kisMetrics?: Metrics };

export function getMetrics(): Metrics {
  holder.__kisMetrics ??= createMetrics();
  return holder.__kisMetrics;
}

function createMetrics(): Metrics {
  const registry = new Registry();
  // CPU·메모리·이벤트 루프 지연·GC 등 Node 프로세스 기본 지표
  collectDefaultMetrics({ register: registry });

  return {
    registry,
    httpDuration: new Histogram({
      name: "http_request_duration_seconds",
      help: "요청 시작부터 응답 종료까지 걸린 시간 (SSR 렌더 포함)",
      labelNames: ["route", "method", "status"],
      buckets: [0.025, 0.05, 0.075, 0.1, 0.15, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    browserOrder: new Histogram({
      name: "browser_order_response_ms",
      help: "브라우저 주문 반응 시간 (클릭 → 주문 패널 표시, spec 5.4)",
      labelNames: ["mode"],
      buckets: [16, 33, 50, 100, 200, 300, 500, 1000, 2000],
      registers: [registry],
    }),
    browserLatency: new Histogram({
      name: "browser_display_latency_ms",
      help: "시세 표시 지연 (서버 전송 → 화면 반영)",
      labelNames: ["mode"],
      buckets: [5, 10, 25, 50, 100, 200, 500, 1000, 2000],
      registers: [registry],
    }),
    vitalsReports: new Counter({
      name: "browser_vitals_reports_total",
      help: "브라우저가 보낸 지표 묶음 수",
      labelNames: ["mode"],
      registers: [registry],
    }),
  };
}

/** 커스텀 서버에서 요청이 끝날 때 호출 */
export function observeRequest(path: string, method: string, status: number, seconds: number): void {
  getMetrics().httpDuration.observe({ route: metricRoute(path), method, status: String(status) }, seconds);
}

/** /api/vitals로 받은 브라우저 샘플 기록 */
export function observeVitals(payload: VitalsPayload): void {
  const m = getMetrics();
  for (const v of payload.order) m.browserOrder.observe({ mode: payload.mode }, v);
  for (const v of payload.latency) m.browserLatency.observe({ mode: payload.mode }, v);
  m.vitalsReports.inc({ mode: payload.mode });
}
