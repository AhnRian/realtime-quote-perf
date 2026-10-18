import { writeFileSync } from "node:fs";

// Grafana 대시보드 JSON 생성 (spec 6.3). 실행: pnpm dashboard
// 결과: monitoring/grafana/dashboards/kis-mts.json (Grafana가 시작할 때 자동 등록)

type Target = { expr: string; legend: string };
type Panel = { title: string; unit: string; targets: Target[]; threshold?: number; description?: string };

const RATE = "[$__rate_interval]";
const SSR = `route="/stocks/[code]"`;
// 지표 수집 요청과 정적 파일은 부하 지표에서 뺀다
const APP_ROUTES = `route!~"/api/metrics|/_next/.*"`;

const panels: Panel[] = [
  {
    title: "SSR 응답 시간 (/stocks/[code])",
    unit: "ms",
    threshold: 500,
    description: "기준: p95 < 500ms (spec 6.4). 요청 시작 → 응답 종료, 커스텀 서버에서 측정",
    targets: [
      { expr: `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{${SSR}}${RATE}))) * 1000`, legend: "p95" },
      { expr: `histogram_quantile(0.5, sum by (le) (rate(http_request_duration_seconds_bucket{${SSR}}${RATE}))) * 1000`, legend: "p50" },
    ],
  },
  {
    title: "초당 요청 수",
    unit: "reqps",
    targets: [{ expr: `sum by (route) (rate(http_request_duration_seconds_count{${APP_ROUTES}}${RATE}))`, legend: "{{route}}" }],
  },
  {
    title: "에러율 (5xx)",
    unit: "percent",
    threshold: 1,
    description: "기준: 에러율 < 1% (spec 6.4)",
    targets: [
      {
        // 5xx가 한 건도 없으면 분자가 빈 결과가 되므로 or vector(0)으로 0을 채운다
        expr: `100 * (sum(rate(http_request_duration_seconds_count{${APP_ROUTES},status=~"5.."}${RATE})) or vector(0)) / clamp_min(sum(rate(http_request_duration_seconds_count{${APP_ROUTES}}${RATE})), 1e-9)`,
        legend: "5xx %",
      },
    ],
  },
  {
    title: "CPU 사용률 (코어 1개 = 100%)",
    unit: "percent",
    description: "Node는 JS를 코어 하나에서 실행하므로 100% 근처면 한계",
    targets: [{ expr: `100 * rate(process_cpu_seconds_total${RATE})`, legend: "CPU" }],
  },
  {
    title: "메모리",
    unit: "bytes",
    targets: [
      { expr: "process_resident_memory_bytes", legend: "RSS" },
      { expr: "nodejs_heap_size_used_bytes", legend: "heap used" },
    ],
  },
  {
    title: "이벤트 루프 지연",
    unit: "ms",
    description: "메인 스레드가 막혀 다른 요청을 못 받는 시간. SSR 렌더가 몰리면 커진다",
    targets: [
      { expr: "nodejs_eventloop_lag_p99_seconds * 1000", legend: "p99" },
      { expr: "nodejs_eventloop_lag_mean_seconds * 1000", legend: "mean" },
    ],
  },
  {
    title: "브라우저 주문 반응 p95 (모드별)",
    unit: "ms",
    description: "클릭 → 주문 패널 표시 (spec 5.4). 브라우저가 /api/vitals로 5초마다 전송",
    targets: [
      { expr: "histogram_quantile(0.95, sum by (le, mode) (rate(browser_order_response_ms_bucket[1m])))", legend: "{{mode}}" },
    ],
  },
  {
    title: "브라우저 표시 지연 p95 (모드별)",
    unit: "ms",
    targets: [
      { expr: "histogram_quantile(0.95, sum by (le, mode) (rate(browser_display_latency_ms_bucket[1m])))", legend: "{{mode}}" },
    ],
  },
];

const dashboard = {
  uid: "kis-mts",
  title: "실시간 시세 MTS",
  schemaVersion: 39,
  time: { from: "now-15m", to: "now" },
  refresh: "5s",
  panels: panels.map((p, i) => ({
    id: i + 1,
    type: "timeseries",
    title: p.title,
    description: p.description ?? "",
    gridPos: { x: (i % 2) * 12, y: Math.floor(i / 2) * 8, w: 12, h: 8 },
    datasource: { type: "prometheus", uid: "prometheus" },
    targets: p.targets.map((t, j) => ({
      refId: String.fromCharCode(65 + j),
      datasource: { type: "prometheus", uid: "prometheus" },
      expr: t.expr,
      legendFormat: t.legend,
    })),
    fieldConfig: {
      defaults: {
        unit: p.unit,
        min: 0,
        custom: p.threshold !== undefined ? { thresholdsStyle: { mode: "line" } } : {},
        thresholds: {
          mode: "absolute",
          steps: [
            { color: "green", value: null },
            ...(p.threshold !== undefined ? [{ color: "red", value: p.threshold }] : []),
          ],
        },
      },
      overrides: [],
    },
    options: { legend: { displayMode: "list", placement: "bottom" }, tooltip: { mode: "multi" } },
  })),
};

writeFileSync("monitoring/grafana/dashboards/kis-mts.json", `${JSON.stringify(dashboard, null, 2)}\n`);
console.log(`대시보드 패널 ${panels.length}개 생성`);
