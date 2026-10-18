import { TRADE_LIMIT, flashDirection, isTrade, type FlashDir, type MarketState } from "./market-state";
import type { MarketEvent, OrderBook, Tick } from "./types";

// batched 모드: 메시지를 버퍼에 쌓았다가 프레임마다 한 번에 반영한다 (spec 9장).
// 시세·호가는 종목별 최신값만 남기고, 체결은 사이에 들어온 것까지 모두 남긴다.

export type Batch = {
  /** 종목별 마지막 체결 (같은 프레임 안의 이전 체결은 덮어씀) */
  quotes: Map<string, Tick>;
  books: Map<string, OrderBook>;
  /** 프레임 사이에 들어온 모든 체결 (도착 순) */
  trades: Tick[];
};

export function createBatch(): Batch {
  return { quotes: new Map(), books: new Map(), trades: [] };
}

export function isBatchEmpty(batch: Batch): boolean {
  return batch.quotes.size === 0 && batch.trades.length === 0 && batch.books.size === 0;
}

/** 버퍼에 이벤트 추가 (버퍼는 ref에 있는 가변 객체라 직접 수정한다) */
export function addToBatch(batch: Batch, event: MarketEvent): void {
  if (event.type === "book") {
    batch.books.set(event.book.code, event.book);
    return;
  }
  batch.quotes.set(event.tick.code, event.tick);
  if (isTrade(event.tick)) batch.trades.push(event.tick);
}

/** 화면에 실제로 반영되는 메시지의 sentAt (표시 지연 측정용). 덮어써진 호가는 제외 */
export function batchSentAts(batch: Batch): number[] {
  // 체결 리스트에 들어가지 않는 시세(REST 스냅샷)는 최신값만 센다
  const snapshotQuotes = [...batch.quotes.values()].filter((t) => !isTrade(t));
  return [
    ...batch.trades.map((t) => t.sentAt),
    ...snapshotQuotes.map((t) => t.sentAt),
    ...[...batch.books.values()].map((b) => b.sentAt),
  ];
}

/** 버퍼 전체를 한 번의 불변 업데이트로 반영 */
export function applyBatch(state: MarketState, batch: Batch): MarketState {
  if (isBatchEmpty(batch)) return state;

  const quotes = { ...state.quotes };
  for (const [code, tick] of batch.quotes) quotes[code] = tick;

  const books = batch.books.size > 0 ? { ...state.books } : state.books;
  for (const [code, book] of batch.books) books[code] = book;

  let trades = state.trades;
  if (batch.trades.length > 0) {
    // 종목별로 묶어서 최신이 앞에 오도록 붙인다
    const byCode = new Map<string, Tick[]>();
    for (const tick of batch.trades) {
      const list = byCode.get(tick.code) ?? [];
      list.push(tick);
      byCode.set(tick.code, list);
    }
    trades = { ...state.trades };
    for (const [code, list] of byCode) {
      trades[code] = [...list.reverse(), ...(state.trades[code] ?? [])].slice(0, TRADE_LIMIT);
    }
  }
  return { quotes, books, trades };
}

export type Flash = { dir: FlashDir; until: number };

/**
 * 깜빡임 갱신: 가격이 바뀐 종목은 새로 깜빡이고, 만료된 깜빡임은 지운다.
 * 바뀐 게 없으면 같은 객체를 돌려줘서 setState를 건너뛸 수 있게 한다.
 */
export function updateFlashes(
  flashes: Record<string, Flash>,
  prevQuotes: Record<string, Tick>,
  batch: Batch,
  now: number,
  durationMs: number,
): Record<string, Flash> {
  let next: Record<string, Flash> | null = null;
  const edit = () => (next ??= { ...flashes });

  for (const [code, flash] of Object.entries(flashes)) {
    if (flash.until <= now) delete edit()[code];
  }
  for (const [code, tick] of batch.quotes) {
    const dir = flashDirection(prevQuotes[code]?.price, tick.price);
    if (dir) edit()[code] = { dir, until: now + durationMs };
  }
  return next ?? flashes;
}
