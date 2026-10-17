// KIS 웹소켓 프로토콜 처리 (중계 서버용 순수 함수, spec 12장)

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
