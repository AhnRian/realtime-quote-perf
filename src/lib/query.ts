import type { DataSource, MockParams, RenderMode } from "./types";

// URL 쿼리 → 설정값. 브라우저 페이지와 Mock 서버가 같은 규칙을 쓰도록 한 곳에 둔다.

export const DEFAULT_MOCK_PARAMS: MockParams = { rate: 200, symbols: 30, burst: false, seed: 42 };

const MODES: readonly RenderMode[] = ["naive", "batched", "optimized"];

export function parseMode(value: string | null | undefined): RenderMode {
  return MODES.find((m) => m === value) ?? "naive";
}

export function parseSource(value: string | null | undefined): DataSource {
  return value === "kis" ? "kis" : "mock";
}

export function parseMockParams(query: URLSearchParams): MockParams {
  return {
    rate: intInRange(query.get("rate"), 1, 5_000, DEFAULT_MOCK_PARAMS.rate),
    symbols: intInRange(query.get("symbols"), 1, 100, DEFAULT_MOCK_PARAMS.symbols),
    burst: query.get("burst") === "1",
    seed: intInRange(query.get("seed"), 0, 2 ** 31 - 1, DEFAULT_MOCK_PARAMS.seed),
  };
}

/** Mock 서버 접속용 쿼리 문자열 */
export function toMockQuery(params: MockParams): string {
  return new URLSearchParams({
    rate: String(params.rate),
    symbols: String(params.symbols),
    burst: params.burst ? "1" : "0",
    seed: String(params.seed),
  }).toString();
}

/** Next.js searchParams 객체 → URLSearchParams (배열 값은 첫 번째만 사용) */
export function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) query.set(key, first);
  }
  return query;
}

function intInRange(text: string | null, min: number, max: number, fallback: number): number {
  if (text === null || text.trim() === "") return fallback;
  const n = Number(text);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
