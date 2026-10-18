import { getMetrics } from "@/server/metrics";

// Prometheus가 수집해 가는 지표 (spec 6.3)
export const dynamic = "force-dynamic";

export async function GET() {
  const { registry } = getMetrics();
  return new Response(await registry.metrics(), {
    headers: { "content-type": registry.contentType },
  });
}
