import { TICK_FIELD, TICK_FIELD_COUNT, TR_TICK } from "./kis-fields";

// KIS 웹소켓 프로토콜 처리 (중계 서버용 순수 함수, spec 7.1)

export type KisEnv = "paper" | "real";

export const KIS_ENDPOINTS: Record<KisEnv, { rest: string; ws: string }> = {
  paper: { rest: "https://openapivts.koreainvestment.com:29443", ws: "ws://ops.koreainvestment.com:31000" },
  real: { rest: "https://openapi.koreainvestment.com:9443", ws: "ws://ops.koreainvestment.com:21000" },
};

export function parseKisEnv(value: string | undefined): KisEnv {
  return value === "real" ? "real" : "paper";
}

/** 실시간 구독(tr_type 1) / 해제(tr_type 2) 요청 */
export function buildSubscribeMessage(approvalKey: string, trId: string, code: string, subscribe = true): string {
  return JSON.stringify({
    header: { approval_key: approvalKey, custtype: "P", tr_type: subscribe ? "1" : "2", "content-type": "utf-8" },
    body: { input: { tr_id: trId, tr_key: code } },
  });
}

export type KisMessage =
  /** 실시간 데이터 (원문 그대로 브라우저로 전달) */
  | { kind: "data"; raw: string }
  /** 받은 문자열 그대로 돌려보내야 연결이 유지된다 */
  | { kind: "pingpong" }
  /** 구독 응답 등 제어 메시지 */
  | { kind: "control"; trId: string; trKey: string; ok: boolean; message: string }
  | { kind: "unknown" };

export function classifyKisMessage(text: string): KisMessage {
  // 실시간 데이터는 "0|" 또는 "1|"로 시작하는 파이프 구분 문자열
  if (text.startsWith("0|") || text.startsWith("1|")) return { kind: "data", raw: text };

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "unknown" };
  }
  const header = field(json, "header");
  const body = field(json, "body");
  const trId = str(field(header, "tr_id"));
  if (trId === "PINGPONG") return { kind: "pingpong" };
  if (!trId) return { kind: "unknown" };
  return {
    kind: "control",
    trId,
    trKey: str(field(header, "tr_key")),
    ok: str(field(body, "rt_cd")) === "0",
    message: str(field(body, "msg1")),
  };
}

/** 실시간 원문에서 종목코드 추출 (구독한 브라우저에게만 보내기 위해) */
export function rawCode(raw: string): string | null {
  const body = raw.split("|")[3];
  const code = body?.split("^", 1)[0];
  return code && /^[0-9A-Z]{6}$/.test(code) ? code : null;
}

/** REST 현재가 조회 (FHKST01010100) 응답에서 쓰는 필드 */
export type RestQuote = {
  stck_prpr: string; // 현재가
  prdy_vrss: string; // 전일대비
  prdy_vrss_sign: string; // 전일대비부호
  prdy_ctrt: string; // 전일대비율
  acml_vol: string; // 누적거래량
};

export function parseRestQuote(json: unknown): RestQuote | null {
  const output = field(json, "output");
  if (str(field(json, "rt_cd")) !== "0" || typeof output !== "object" || output === null) return null;
  const keys = ["stck_prpr", "prdy_vrss", "prdy_vrss_sign", "prdy_ctrt", "acml_vol"] as const;
  const values = keys.map((k) => str(field(output, k)));
  if (values.some((v) => v === "" || (v !== values[2] && !Number.isFinite(Number(v))))) return null;
  const [stck_prpr, prdy_vrss, prdy_vrss_sign, prdy_ctrt, acml_vol] = values as [string, string, string, string, string];
  return { stck_prpr, prdy_vrss, prdy_vrss_sign, prdy_ctrt, acml_vol };
}

/**
 * REST 현재가를 H0STCNT0 원문 1건으로 바꾼다.
 * 브라우저는 소스와 상관없이 같은 내부 프레임만 받으므로, 스냅샷도 실시간 원문 형식으로 맞춘다.
 * 체결량은 알 수 없으므로 0.
 */
export function restQuoteToRaw(code: string, quote: RestQuote, hhmmss: string): string {
  const f = Array<string>(TICK_FIELD_COUNT).fill("0");
  f[TICK_FIELD.CODE] = code;
  f[TICK_FIELD.TIME] = hhmmss;
  f[TICK_FIELD.PRICE] = String(Math.abs(Number(quote.stck_prpr)));
  f[TICK_FIELD.SIGN] = quote.prdy_vrss_sign;
  f[TICK_FIELD.CHANGE] = quote.prdy_vrss;
  f[TICK_FIELD.RATE] = quote.prdy_ctrt;
  f[TICK_FIELD.TRADE_VOL] = "0";
  f[TICK_FIELD.ACC_VOL] = quote.acml_vol;
  return `0|${TR_TICK}|001|${f.join("^")}`;
}

/** 접속키 발급 응답에서 approval_key 추출 */
export function extractApprovalKey(json: unknown): string | null {
  const key = field(json, "approval_key");
  return typeof key === "string" && key.length > 0 ? key : null;
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
