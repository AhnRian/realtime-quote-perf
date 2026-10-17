// KIS 실시간 원문 필드 인덱스 (spec 7.2)
// 한투 WebSocket 예제 코드 기준. T10에서 실데이터 캡처 후 다시 검증한다.

export const TR_TICK = "H0STCNT0";
export const TR_BOOK = "H0STASP0";

/** H0STCNT0 레코드당 필드 수 */
export const TICK_FIELD_COUNT = 46;

export const TICK_FIELD = {
  CODE: 0,
  TIME: 1,
  PRICE: 2,
  SIGN: 3,
  CHANGE: 4,
  RATE: 5,
  TRADE_VOL: 12,
  ACC_VOL: 13,
} as const;

/** 전일대비부호: 1 상한, 2 상승, 3 보합, 4 하한, 5 하락 */
export const SIGN_DOWN = new Set(["4", "5"]);
export const SIGN_FLAT = "3";

export const BOOK_LEVELS = 10;

export const BOOK_FIELD = {
  CODE: 0,
  TIME: 1,
  ASK_PRICE: 3,
  BID_PRICE: 13,
  ASK_QTY: 23,
  BID_QTY: 33,
} as const;

/**
 * H0STASP0에서 이 프로젝트가 쓰는 필드 수 (0~42).
 * 레코드당 전체 필드 수는 아직 검증 전이라 다건 분리는 지원하지 않는다 (spec 7.2).
 */
export const BOOK_USED_FIELD_COUNT = 43;
