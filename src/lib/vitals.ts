import { parseMode } from "./query";
import type { RenderMode } from "./types";

// 브라우저 → /api/vitals 지표 전송 형식과 검증 (순수 함수)

/** 한 번에 받는 샘플 수 상한 (악의적·비정상 요청 방어) */
export const VITALS_MAX_SAMPLES = 1_000;

export type VitalsPayload = {
  mode: RenderMode;
  /** 주문 반응 시간 샘플 (ms) */
  order: number[];
  /** 표시 지연 샘플 (ms) */
  latency: number[];
};

export function parseVitalsPayload(body: unknown): VitalsPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.mode !== "string" || parseMode(b.mode) !== b.mode) return null;
  const order = samples(b.order);
  const latency = samples(b.latency);
  if (!order || !latency) return null;
  return { mode: parseMode(b.mode), order, latency };
}

function samples(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > VITALS_MAX_SAMPLES) return null;
  const out: number[] = [];
  for (const v of value) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 600_000) return null;
    out.push(v);
  }
  return out;
}

/**
 * 지표 라벨용 경로 정규화. 종목 코드처럼 값마다 다른 경로를 그대로 라벨로 쓰면
 * 시계열이 무한히 늘어나므로(카디널리티 폭발) 패턴으로 묶는다.
 */
export function metricRoute(path: string): string {
  const pathname = path.split("?")[0] ?? "/";
  if (pathname === "/") return "/";
  if (pathname.startsWith("/stocks/")) return "/stocks/[code]";
  if (pathname.startsWith("/_next/")) return "/_next/*";
  if (pathname.startsWith("/api/")) return pathname;
  return "other";
}
