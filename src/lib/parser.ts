import {
  BOOK_FIELD,
  BOOK_LEVELS,
  BOOK_USED_FIELD_COUNT,
  SIGN_DOWN,
  SIGN_FLAT,
  TICK_FIELD,
  TICK_FIELD_COUNT,
  TR_BOOK,
  TR_TICK,
} from "./kis-fields";
import type { ClientMessage, Frame, Level, MarketEvent, OrderBook, Tick } from "./types";

// 파싱 실패는 예외 대신 null로 돌려준다.
// 실시간 스트림에서 깨진 메시지 하나 때문에 수신 루프 전체가 멈추면 안 되기 때문이다.

/** 웹소켓으로 받은 문자열(내부 프레임 JSON)을 이벤트 목록으로 변환 */
export function parseFrame(data: string): MarketEvent[] | null {
  return parseFrameWithMeta(data)?.events ?? null;
}

/** 이벤트와 함께 스냅샷 여부도 돌려준다 (연결 관리자용) */
export function parseFrameWithMeta(data: string): { events: MarketEvent[]; snapshot: boolean } | null {
  let frame: unknown;
  try {
    frame = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isFrame(frame)) return null;
  const events = parseRaw(frame.raw, frame.t);
  return events ? { events, snapshot: frame.s === 1 } : null;
}

function isFrame(value: unknown): value is Frame {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.t === "number" && typeof v.raw === "string";
}

/** 서버 쪽: 브라우저가 보낸 구독·해제·스냅샷 요청 검증 */
export function parseClientMessage(text: string): ClientMessage | null {
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.type !== "subscribe" && m.type !== "unsubscribe" && m.type !== "snapshot") return null;
  if (!Array.isArray(m.codes) || m.codes.length > 100) return null;
  const codes = m.codes.filter((c): c is string => typeof c === "string" && /^[0-9A-Z]{6}$/.test(c));
  if (codes.length !== m.codes.length) return null;
  return { type: m.type, codes };
}

/** KIS 원문 `암호화여부|TR_ID|데이터건수|필드^필드...` 파싱 */
export function parseRaw(raw: string, sentAt: number): MarketEvent[] | null {
  const parts = raw.split("|");
  if (parts.length !== 4) return null;
  const [encrypted, trId, countText, body] = parts as [string, string, string, string];
  // 1은 암호화된 체결통보라 처리하지 않는다
  if (encrypted !== "0") return null;

  const count = toInt(countText);
  if (count === null || count < 1) return null;
  const fields = body.split("^");

  if (trId === TR_TICK) return parseTicks(fields, count, sentAt);
  if (trId === TR_BOOK) return parseBook(fields, count, sentAt);
  return null;
}

function parseTicks(fields: string[], count: number, sentAt: number): MarketEvent[] | null {
  if (fields.length < count * TICK_FIELD_COUNT) return null;
  const events: MarketEvent[] = [];
  // 다건이면 레코드가 ^로 이어 붙어 오므로 46개 단위로 자른다
  for (let i = 0; i < count; i++) {
    const tick = parseTick(fields.slice(i * TICK_FIELD_COUNT, (i + 1) * TICK_FIELD_COUNT), sentAt);
    if (!tick) return null;
    events.push({ type: "tick", tick });
  }
  return events;
}

function parseTick(f: string[], sentAt: number): Tick | null {
  const code = f[TICK_FIELD.CODE];
  const time = f[TICK_FIELD.TIME];
  const sign = f[TICK_FIELD.SIGN];
  const price = toNum(f[TICK_FIELD.PRICE]);
  const change = toNum(f[TICK_FIELD.CHANGE]);
  const rate = toNum(f[TICK_FIELD.RATE]);
  const tradeVol = toNum(f[TICK_FIELD.TRADE_VOL]);
  const accVol = toNum(f[TICK_FIELD.ACC_VOL]);
  if (!code || !time || sign === undefined) return null;
  if (price === null || change === null || rate === null || tradeVol === null || accVol === null) {
    return null;
  }
  // 원문 숫자에 부호가 붙어 오는지와 무관하게 전일대비부호 필드를 기준으로 부호를 정한다
  const dir = sign === SIGN_FLAT ? 0 : SIGN_DOWN.has(sign) ? -1 : 1;
  return {
    code,
    time,
    price,
    change: Math.abs(change) * dir,
    rate: Math.abs(rate) * dir,
    tradeVol,
    accVol,
    sentAt,
  };
}

function parseBook(fields: string[], count: number, sentAt: number): MarketEvent[] | null {
  if (count !== 1 || fields.length < BOOK_USED_FIELD_COUNT) return null;
  const code = fields[BOOK_FIELD.CODE];
  if (!code) return null;
  const asks = parseLevels(fields, BOOK_FIELD.ASK_PRICE, BOOK_FIELD.ASK_QTY);
  const bids = parseLevels(fields, BOOK_FIELD.BID_PRICE, BOOK_FIELD.BID_QTY);
  if (!asks || !bids) return null;
  const book: OrderBook = { code, asks, bids, sentAt };
  return [{ type: "book", book }];
}

function parseLevels(fields: string[], priceStart: number, qtyStart: number): Level[] | null {
  const levels: Level[] = [];
  for (let i = 0; i < BOOK_LEVELS; i++) {
    const price = toNum(fields[priceStart + i]);
    const qty = toNum(fields[qtyStart + i]);
    if (price === null || qty === null) return null;
    levels.push({ price, qty });
  }
  return levels;
}

function toNum(text: string | undefined): number | null {
  if (text === undefined || text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function toInt(text: string): number | null {
  const n = toNum(text);
  return n !== null && Number.isInteger(n) ? n : null;
}
