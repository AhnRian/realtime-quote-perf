import { createServer } from "node:http";
import next from "next";
import { observeRequest } from "../src/server/metrics";

// Next.js 커스텀 서버 (spec 6.3).
// App Router에는 요청별 응답 시간을 재는 공식 훅이 없어서, Next 핸들러를 감싸 요청 시작~응답 종료를 잰다.
// 이 값이 Grafana의 "SSR 응답 p95"가 된다.

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

createServer((req, res) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    observeRequest(req.url ?? "/", req.method ?? "GET", res.statusCode, seconds);
  });
  void handle(req, res);
}).listen(port, () => {
  console.log(`> http://localhost:${port} (${dev ? "dev" : "production"}, API_MOCK=${process.env.API_MOCK ?? "0"})`);
});
