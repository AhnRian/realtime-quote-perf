import { parseVitalsPayload } from "@/lib/vitals";
import { observeVitals } from "@/server/metrics";

// 브라우저가 주기적으로 보내는 주문 반응·표시 지연 샘플을 Prometheus 히스토그램에 기록 (spec 5.4, 6.3)
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const payload = parseVitalsPayload(body);
  if (!payload) return new Response("bad payload", { status: 400 });
  observeVitals(payload);
  return new Response(null, { status: 204 });
}
