import { describe, expect, it } from "vitest";
import { buildSubscribeMessage, classifyKisMessage, extractApprovalKey, parseKisEnv } from "./kis-protocol";

describe("kis-protocol", () => {
  it("구독 요청 메시지를 만든다", () => {
    expect(JSON.parse(buildSubscribeMessage("KEY", "H0STCNT0", "005930"))).toEqual({
      header: { approval_key: "KEY", custtype: "P", tr_type: "1", "content-type": "utf-8" },
      body: { input: { tr_id: "H0STCNT0", tr_key: "005930" } },
    });
    expect(JSON.parse(buildSubscribeMessage("KEY", "H0STCNT0", "005930", false)).header.tr_type).toBe("2");
  });

  it("실시간 데이터는 원문 그대로 분류한다", () => {
    expect(classifyKisMessage("0|H0STCNT0|001|005930^...")).toEqual({
      kind: "data",
      raw: "0|H0STCNT0|001|005930^...",
    });
  });

  it("PINGPONG을 구분한다", () => {
    const text = JSON.stringify({ header: { tr_id: "PINGPONG", datetime: "20261019090000" } });
    expect(classifyKisMessage(text)).toEqual({ kind: "pingpong" });
  });

  it("구독 응답에서 성공 여부와 메시지를 꺼낸다", () => {
    const text = JSON.stringify({
      header: { tr_id: "H0STCNT0", tr_key: "005930", encrypt: "N" },
      body: { rt_cd: "0", msg_cd: "OPSP0000", msg1: "SUBSCRIBE SUCCESS", output: { iv: "x", key: "y" } },
    });
    expect(classifyKisMessage(text)).toEqual({
      kind: "control",
      trId: "H0STCNT0",
      trKey: "005930",
      ok: true,
      message: "SUBSCRIBE SUCCESS",
    });
  });

  it("알 수 없는 문자열은 unknown", () => {
    expect(classifyKisMessage("hello")).toEqual({ kind: "unknown" });
    expect(classifyKisMessage("{}")).toEqual({ kind: "unknown" });
  });

  it("접속키 발급 응답을 검증한다", () => {
    expect(extractApprovalKey({ approval_key: "abc" })).toBe("abc");
    expect(extractApprovalKey({ error_code: "EGW" })).toBeNull();
    expect(extractApprovalKey(null)).toBeNull();
  });

  it("KIS_ENV 기본값은 모의투자", () => {
    expect(parseKisEnv(undefined)).toBe("paper");
    expect(parseKisEnv("real")).toBe("real");
  });
});
