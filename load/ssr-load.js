// k6 SSR 부하 테스트 (spec 6.4)
// 서버: API_MOCK=1 pnpm build && API_MOCK=1 pnpm start
//
// 1) 단계 상승 (Grafana로 관찰): k6 run load/ssr-load.js
//    초당 요청 10 → 50 → 100 → 200, 단계마다 30초 유지
//    한계 너머까지 보려면: k6 run -e RAMP=10,100,200,300,400,500 load/ssr-load.js
// 2) 고정 rate (한계 찾기):       k6 run -e RATE=150 load/ssr-load.js
//    초당 RATE건을 DURATION(기본 30s) 동안 보내고, 결과를 load/results/ssr-<RATE>.json에 저장
//
// 기준: p95 < 500ms, 에러율 < 1%
import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const RATE = __ENV.RATE ? Number(__ENV.RATE) : null;
const DURATION = __ENV.DURATION || "30s";

// Mock 30종목 + KIS 20종목 (fixtures/stock-details.json과 같음)
const CODES = [
  ...Array.from({ length: 30 }, (_, i) => `9${String(i + 1).padStart(5, "0")}`),
  "005930", "000660", "373220", "207940", "005380", "000270", "068270", "005490", "035420", "035720",
  "051910", "006400", "105560", "055550", "012330", "028260", "066570", "003550", "034730", "015760",
];

const RAMP = (__ENV.RAMP || "10,50,100,200").split(",").map(Number);

const scenario = RATE
  ? {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(20, RATE),
      maxVUs: RATE * 10,
    }
  : {
      executor: "ramping-arrival-rate",
      startRate: RAMP[0],
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 2000,
      // 단계마다 10초에 걸쳐 올리고 30초 유지
      stages: RAMP.flatMap((target, i) =>
        i === 0
          ? [{ target, duration: "30s" }]
          : [
              { target, duration: "10s" },
              { target, duration: "30s" },
            ],
      ),
    };

export const options = {
  scenarios: { ssr: scenario },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
  // 서버가 못 버티면 응답이 오래 걸리므로 타임아웃을 짧게 잡아 실패로 센다
  httpTimeout: "5s",
};

export default function () {
  const code = CODES[Math.floor(Math.random() * CODES.length)];
  const res = http.get(`${BASE_URL}/stocks/${code}`, { tags: { name: "/stocks/[code]" }, timeout: "5s" });
  check(res, { "200 OK": (r) => r.status === 200 });
}

export function handleSummary(data) {
  const m = data.metrics;
  const result = {
    rate: RATE ?? "ramp",
    requests: m.http_reqs.values.count,
    achievedRps: Math.round(m.http_reqs.values.rate * 10) / 10,
    p50: Math.round(m.http_req_duration.values.med),
    p95: Math.round(m.http_req_duration.values["p(95)"]),
    errorRate: Math.round(m.http_req_failed.values.rate * 10_000) / 100,
    droppedIterations: m.dropped_iterations ? m.dropped_iterations.values.count : 0,
    pass: m.http_req_duration.values["p(95)"] < 500 && m.http_req_failed.values.rate < 0.01,
  };
  const line = JSON.stringify(result);
  const out = { stdout: `${line}\n` };
  if (RATE) out[`load/results/ssr-${RATE}.json`] = `${line}\n`;
  return out;
}
