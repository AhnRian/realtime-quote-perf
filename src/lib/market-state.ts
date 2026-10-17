import type { MarketEvent, OrderBook, Tick } from "./types";

// 시세 상태와 이벤트 적용 (불변 업데이트). naive·batched 모드가 같이 쓴다.

export const TRADE_LIMIT = 50;

export type MarketState = {
  /** 종목별 최신 체결 */
  quotes: Record<string, Tick>;
  books: Record<string, OrderBook>;
  /** 종목별 최근 체결, 최신이 앞 (최대 TRADE_LIMIT건) */
  trades: Record<string, Tick[]>;
};

export const EMPTY_MARKET: MarketState = { quotes: {}, books: {}, trades: {} };

export function applyEvent(state: MarketState, event: MarketEvent): MarketState {
  if (event.type === "book") {
    return { ...state, books: { ...state.books, [event.book.code]: event.book } };
  }
  const { tick } = event;
  const prevTrades = state.trades[tick.code] ?? [];
  return {
    ...state,
    quotes: { ...state.quotes, [tick.code]: tick },
    trades: { ...state.trades, [tick.code]: [tick, ...prevTrades].slice(0, TRADE_LIMIT) },
  };
}

export type FlashDir = "up" | "down";

/** 이전 가격 대비 깜빡임 방향. 처음이거나 같으면 null */
export function flashDirection(prev: number | undefined, next: number): FlashDir | null {
  if (prev === undefined || prev === next) return null;
  return next > prev ? "up" : "down";
}
