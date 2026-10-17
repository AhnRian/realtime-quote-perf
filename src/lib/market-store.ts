import { addToBatch, batchSentAts, createBatch, isBatchEmpty } from "./apply-batch";
import { TRADE_LIMIT, flashDirection, type FlashDir } from "./market-state";
import { RingBuffer } from "./ring-buffer";
import type { MarketEvent, OrderBook, Tick } from "./types";

// optimized 모드용 외부 스토어 (spec 9장).
// React state 밖에 시세를 두고, 프레임마다 flush하면서 "바뀐 종목의 구독자"에게만 알린다.
// useSyncExternalStore의 getSnapshot은 변경이 없으면 같은 참조를 돌려줘야 하므로 스냅샷을 캐시한다.

export type QuoteView = {
  tick: Tick;
  /** 깜빡이는 중이면 방향, 아니면 null. 만료는 flush에서 처리한다 */
  flash: FlashDir | null;
};

export const FLASH_MS = 300;

/** 체결 + 고유 id. 리스트 key로 써서 새 체결이 들어와도 기존 행이 다시 만들어지지 않게 한다 */
export type TradeItem = { id: number; tick: Tick };

type TradeSlot = { buffer: RingBuffer<TradeItem>; snapshot: TradeItem[] | null };

const EMPTY_TRADES: TradeItem[] = [];

export const storeKey = {
  quote: (code: string) => `q:${code}`,
  book: (code: string) => `b:${code}`,
  trades: (code: string) => `t:${code}`,
  /** 매 flush마다 알림 (커밋 시점 측정용) */
  frame: "frame",
};

export class MarketStore {
  private batch = createBatch();
  private readonly quotes = new Map<string, QuoteView>();
  private readonly books = new Map<string, OrderBook>();
  private readonly trades = new Map<string, TradeSlot>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private frameVersion = 0;
  private tradeSeq = 0;
  private pendingSentAt: number[] = [];
  /** 깜빡임 중인 종목 → 만료 시각 */
  private readonly flashUntil = new Map<string, number>();

  /** 웹소켓 수신 시: 버퍼에 쌓기만 한다 */
  enqueue(event: MarketEvent): void {
    addToBatch(this.batch, event);
  }

  /**
   * 프레임마다 호출: 버퍼를 반영하고 바뀐 키의 구독자에게만 알린다.
   * 깜빡임 만료도 여기서 처리해서 타이머 없이 프레임 단위로만 갱신한다. 바뀐 게 없으면 false
   */
  flush(now: number): boolean {
    const batch = this.batch;
    const changed = new Set<string>();

    for (const [code, until] of this.flashUntil) {
      if (until > now || batch.quotes.has(code)) continue;
      this.flashUntil.delete(code);
      const prev = this.quotes.get(code);
      if (prev) this.quotes.set(code, { ...prev, flash: null });
      changed.add(storeKey.quote(code));
    }
    if (isBatchEmpty(batch) && changed.size === 0) return false;
    this.batch = createBatch();

    for (const [code, tick] of batch.quotes) {
      const prev = this.quotes.get(code);
      const dir = flashDirection(prev?.tick.price, tick.price);
      if (dir) this.flashUntil.set(code, now + FLASH_MS);
      const active = dir ?? ((this.flashUntil.get(code) ?? 0) > now ? (prev?.flash ?? null) : null);
      if (!active) this.flashUntil.delete(code);
      this.quotes.set(code, { tick, flash: active });
      changed.add(storeKey.quote(code));
    }
    for (const [code, book] of batch.books) {
      this.books.set(code, book);
      changed.add(storeKey.book(code));
    }
    for (const tick of batch.trades) {
      let slot = this.trades.get(tick.code);
      if (!slot) {
        slot = { buffer: new RingBuffer<TradeItem>(TRADE_LIMIT), snapshot: null };
        this.trades.set(tick.code, slot);
      }
      slot.buffer.push({ id: ++this.tradeSeq, tick });
      slot.snapshot = null;
      changed.add(storeKey.trades(tick.code));
    }

    if (!isBatchEmpty(batch)) this.pendingSentAt.push(...batchSentAts(batch));
    this.frameVersion++;
    changed.add(storeKey.frame);
    for (const key of changed) {
      for (const listener of this.listeners.get(key) ?? []) listener();
    }
    return true;
  }

  subscribe(key: string, listener: () => void): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  getQuote(code: string): QuoteView | undefined {
    return this.quotes.get(code);
  }

  getBook(code: string): OrderBook | undefined {
    return this.books.get(code);
  }

  /** 같은 프레임 안에서는 같은 배열 참조를 돌려준다 */
  getTrades(code: string): TradeItem[] {
    const slot = this.trades.get(code);
    if (!slot) return EMPTY_TRADES;
    slot.snapshot ??= slot.buffer.toArrayNewestFirst();
    return slot.snapshot;
  }

  getFrameVersion(): number {
    return this.frameVersion;
  }

  /** 마지막 커밋 이후 반영된 메시지의 sentAt을 꺼낸다 (표시 지연 측정용) */
  takePendingSentAt(): number[] {
    const taken = this.pendingSentAt;
    this.pendingSentAt = [];
    return taken;
  }
}
