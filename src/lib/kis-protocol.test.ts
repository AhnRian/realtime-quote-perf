import { describe, expect, it } from "vitest";
import {
  buildSubscribeMessage,
  classifyKisMessage,
  extractApprovalKey,
  parseKisEnv,
  parseRestQuote,
  rawCode,
  restQuoteToRaw,
} from "./kis-protocol";
import { parseRaw } from "./parser";

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

  it("원문에서 종목코드를 꺼낸다", () => {
    expect(rawCode("0|H0STCNT0|001|005930^093354^71900")).toBe("005930");
    expect(rawCode("0|H0STCNT0|001|")).toBeNull();
    expect(rawCode("garbage")).toBeNull();
  });

  it("REST 현재가를 H0STCNT0 원문으로 바꾸면 파서가 그대로 읽는다", () => {
    const quote = parseRestQuote({
      rt_cd: "0",
      msg1: "정상처리 되었습니다.",
      output: { stck_prpr: "71900", prdy_vrss: "-500", prdy_vrss_sign: "5", prdy_ctrt: "-0.69", acml_vol: "1234567" },
    });
    expect(quote).not.toBeNull();
    const raw = restQuoteToRaw("005930", quote!, "101500");
    const [event] = parseRaw(raw, 1) ?? [];
    expect(event).toEqual({
      type: "tick",
      tick: { code: "005930", time: "101500", price: 71900, change: -500, rate: -0.69, tradeVol: 0, accVol: 1234567, sentAt: 1 },
    });
  });

  it("REST 오류 응답이나 깨진 필드는 null", () => {
    expect(parseRestQuote({ rt_cd: "1", msg1: "초당 거래건수를 초과하였습니다." })).toBeNull();
    expect(parseRestQuote({ rt_cd: "0", output: { stck_prpr: "abc" } })).toBeNull();
  });

  it("KIS_ENV 기본값은 모의투자", () => {
    expect(parseKisEnv(undefined)).toBe("paper");
    expect(parseKisEnv("real")).toBe("real");
  });
});
