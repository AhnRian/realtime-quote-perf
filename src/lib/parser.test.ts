import { describe, expect, it } from "vitest";
import { TICK_FIELD_COUNT } from "./kis-fields";
import { parseClientMessage, parseFrame, parseFrameWithMeta, parseRaw } from "./parser";

/** 46개 필드짜리 체결 레코드. 쓰지 않는 필드는 0으로 채운다 */
function tickRecord(code: string, price: number, sign: string, change: string, rate: string, vol: number, acc: number) {
  const f = Array<string>(TICK_FIELD_COUNT).fill("0");
  f[0] = code;
  f[1] = "093354";
  f[2] = String(price);
  f[3] = sign;
  f[4] = change;
  f[5] = rate;
  f[12] = String(vol);
  f[13] = String(acc);
  return f;
}

function bookRecord(code: string) {
  const f = ["005930", "093354", "0"];
  f[0] = code;
  for (let i = 0; i < 10; i++) f.push(String(72000 + i * 100)); // 매도호가 1~10
  for (let i = 0; i < 10; i++) f.push(String(71900 - i * 100)); // 매수호가 1~10
  for (let i = 0; i < 10; i++) f.push(String(1000 + i)); // 매도잔량
  for (let i = 0; i < 10; i++) f.push(String(2000 + i)); // 매수잔량
  f.push("99999", "88888"); // 43번 이후 (사용 안 함)
  return f;
}

describe("parseRaw - H0STCNT0", () => {
  it("체결 1건을 파싱한다", () => {
    const raw = `0|H0STCNT0|001|${tickRecord("005930", 71900, "2", "500", "0.70", 12, 3456789).join("^")}`;
    expect(parseRaw(raw, 123)).toEqual([
      {
        type: "tick",
        tick: {
          code: "005930",
          time: "093354",
          price: 71900,
          change: 500,
          rate: 0.7,
          tradeVol: 12,
          accVol: 3456789,
          sentAt: 123,
        },
      },
    ]);
  });

  it("데이터건수 3인 다건을 46개 필드 단위로 잘라 파싱한다", () => {
    const body = [
      ...tickRecord("005930", 71900, "2", "500", "0.70", 1, 10),
      ...tickRecord("000660", 180000, "5", "-1000", "-0.55", 2, 20),
      ...tickRecord("035420", 200000, "3", "0", "0.00", 3, 30),
    ].join("^");
    const events = parseRaw(`0|H0STCNT0|003|${body}`, 1);
    expect(events).toHaveLength(3);
    const ticks = events!.map((e) => (e.type === "tick" ? e.tick : null));
    expect(ticks.map((t) => t?.code)).toEqual(["005930", "000660", "035420"]);
    expect(ticks.map((t) => t?.tradeVol)).toEqual([1, 2, 3]);
  });

  it("전일대비부호가 하락이면 숫자에 부호가 없어도 음수로 만든다", () => {
    const raw = `0|H0STCNT0|001|${tickRecord("000660", 180000, "5", "1000", "0.55", 1, 1).join("^")}`;
    const [event] = parseRaw(raw, 0)!;
    expect(event?.type === "tick" && event.tick.change).toBe(-1000);
    expect(event?.type === "tick" && event.tick.rate).toBe(-0.55);
  });

  it("보합이면 전일대비를 0으로 만든다", () => {
    const raw = `0|H0STCNT0|001|${tickRecord("000660", 180000, "3", "0", "0.00", 1, 1).join("^")}`;
    const [event] = parseRaw(raw, 0)!;
    expect(event?.type === "tick" && event.tick.change).toBe(0);
  });
});

describe("parseRaw - H0STASP0", () => {
  it("매도·매수 10단 호가와 잔량을 파싱한다", () => {
    const events = parseRaw(`0|H0STASP0|001|${bookRecord("005930").join("^")}`, 7);
    expect(events).toHaveLength(1);
    const event = events![0]!;
    if (event.type !== "book") throw new Error("호가 이벤트가 아님");
    const { book } = event;
    expect(book.code).toBe("005930");
    expect(book.sentAt).toBe(7);
    expect(book.asks).toHaveLength(10);
    expect(book.bids).toHaveLength(10);
    expect(book.asks[0]).toEqual({ price: 72000, qty: 1000 });
    expect(book.asks[9]).toEqual({ price: 72900, qty: 1009 });
    expect(book.bids[0]).toEqual({ price: 71900, qty: 2000 });
    expect(book.bids[9]).toEqual({ price: 71000, qty: 2009 });
  });
});

describe("parseRaw - 비정상 입력은 예외 없이 null", () => {
  const good = tickRecord("005930", 71900, "2", "500", "0.70", 1, 1).join("^");
  it.each([
    ["알 수 없는 TR", `0|H0STXXX0|001|${good}`],
    ["암호화 데이터", `1|H0STCNT0|001|${good}`],
    ["구분자 부족", `0|H0STCNT0|${good}`],
    ["빈 문자열", ""],
    ["데이터건수가 숫자가 아님", `0|H0STCNT0|abc|${good}`],
    ["데이터건수보다 필드가 적음", `0|H0STCNT0|002|${good}`],
    ["숫자 필드가 깨짐", `0|H0STCNT0|001|${good.replace("71900", "7l900")}`],
    ["호가 필드 부족", `0|H0STASP0|001|005930^093354^0^72000`],
    ["제어 메시지(JSON)", `{"header":{"tr_id":"PINGPONG"}}`],
  ])("%s", (_, raw) => {
    expect(() => parseRaw(raw, 0)).not.toThrow();
    expect(parseRaw(raw, 0)).toBeNull();
  });
});

describe("parseFrameWithMeta", () => {
  const raw = () => `0|H0STCNT0|001|${tickRecord("005930", 71900, "2", "500", "0.70", 1, 1).join("^")}`;

  it("s=1이면 스냅샷으로 표시한다", () => {
    expect(parseFrameWithMeta(JSON.stringify({ t: 1, raw: raw(), s: 1 }))?.snapshot).toBe(true);
    expect(parseFrameWithMeta(JSON.stringify({ t: 1, raw: raw() }))?.snapshot).toBe(false);
  });
});

describe("parseClientMessage", () => {
  it("구독·해제·스냅샷 요청을 받아들인다", () => {
    expect(parseClientMessage('{"type":"subscribe","codes":["005930","900001"]}')).toEqual({
      type: "subscribe",
      codes: ["005930", "900001"],
    });
    expect(parseClientMessage('{"type":"snapshot","codes":[]}')).toEqual({ type: "snapshot", codes: [] });
  });

  it.each([
    ["JSON 아님", "x"],
    ["모르는 type", '{"type":"order","codes":[]}'],
    ["코드 형식 오류", '{"type":"subscribe","codes":["5930"]}'],
    ["codes 누락", '{"type":"subscribe"}'],
  ])("%s이면 null", (_, text) => {
    expect(parseClientMessage(text)).toBeNull();
  });
});

describe("parseFrame", () => {
  it("내부 프레임 JSON의 t를 sentAt으로 쓴다", () => {
    const raw = `0|H0STCNT0|001|${tickRecord("005930", 71900, "2", "500", "0.70", 1, 1).join("^")}`;
    const events = parseFrame(JSON.stringify({ t: 1760500000123, raw }));
    expect(events?.[0]?.type === "tick" && events[0].tick.sentAt).toBe(1760500000123);
  });

  it.each([
    ["JSON이 아님", "not json"],
    ["raw 누락", JSON.stringify({ t: 1 })],
    ["t 타입 오류", JSON.stringify({ t: "1", raw: "0|H0STCNT0|001|x" })],
    ["null", "null"],
  ])("%s이면 null", (_, data) => {
    expect(parseFrame(data)).toBeNull();
  });
});
