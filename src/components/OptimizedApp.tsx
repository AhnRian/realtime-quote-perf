"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { MarketLayout } from "@/components/MarketLayout";
import { OrderBookView } from "@/components/OrderBookView";
import { BuyButton, OrderDialog, type OrderOpen } from "@/components/OrderTicket";
import { StockTableHead } from "@/components/StockTable";
import { changeColor, formatChange, formatInt, formatRate, formatTime } from "@/lib/format";
import { connectMarket, marketSymbols, marketUrl, type ConnectionState } from "@/lib/market-socket";
import { MarketStore, storeKey } from "@/lib/market-store";
import type { SymbolInfo } from "@/lib/mock-generator";
import { countRowRender, recordLatencies } from "@/lib/perf-recorder";
import type { DataSource, MockParams, Tick } from "@/lib/types";

// spec 9장 optimized: batched + 외부 스토어 + useSyncExternalStore 종목별 구독 + React.memo.
// 시세는 React state가 아니라 스토어에 있으므로, 시세가 바뀌어도 부모는 리렌더되지 않고
// 해당 종목을 구독한 행만 다시 그려진다. 깜빡임은 CSS 애니메이션, 체결은 링 버퍼.

function useStoreValue<T>(store: MarketStore, key: string, getSnapshot: () => T): T {
  const subscribe = useCallback((onChange: () => void) => store.subscribe(key, onChange), [store, key]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function OptimizedApp({ source, params }: { source: DataSource; params: MockParams }) {
  const [store] = useState(() => new MarketStore());
  const [symbols] = useState(() => marketSymbols(source, params));
  const [selected, setSelected] = useState(symbols[0]?.code ?? "");
  const [status, setStatus] = useState<ConnectionState>("reconnecting");

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      // 프레임당 1번 반영. 스토어가 바뀐 종목의 구독자에게만 알린다
      store.flush(performance.now());
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const disconnect = connectMarket(marketUrl(source, params), symbols.map((s) => s.code), {
      onStatus: setStatus,
      onEvents: (events) => {
        for (const event of events) store.enqueue(event);
      },
    });
    return () => {
      cancelAnimationFrame(raf);
      disconnect();
    };
  }, [store, source, params, symbols]);

  const selectedName = symbols.find((s) => s.code === selected)?.name ?? selected;

  return (
    <>
      <CommitProbe store={store} />
      <MarketLayout
        mode="optimized"
        source={source}
        rate={source === "mock" ? params.rate : null}
        status={status}
        selectedName={selectedName}
        list={
          // contain: 이 영역의 레이아웃·paint 변경이 바깥으로 번지지 않게 가둔다
          <div style={{ contain: "content" }}>
            {/* table-layout: fixed — 셀 글자가 바뀌어도 열 너비를 다시 계산하지 않는다 */}
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col />
                <col className="w-32" />
                <col className="w-28" />
                <col className="w-24" />
                <col className="w-36" />
              </colgroup>
              <StockTableHead />
              <tbody>
                {symbols.map((s) => (
                  <QuoteRow key={s.code} store={store} symbol={s} selected={s.code === selected} onSelect={setSelected} />
                ))}
              </tbody>
            </table>
          </div>
        }
        orderBook={<SelectedOrderBook store={store} code={selected} />}
        trades={<SelectedTrades store={store} code={selected} />}
        order={<SelectedOrder store={store} code={selected} name={selectedName} />}
      />
    </>
  );
}

// 주문 패널 열림 상태를 이 작은 컴포넌트에만 둔다 → 열어도 시세 표와 호가창은 다시 렌더되지 않는다
const SelectedOrder = memo(function SelectedOrder({ store, code, name }: { store: MarketStore; code: string; name: string }) {
  const [order, setOrder] = useState<OrderOpen>(null);
  const quote = useStoreValue(store, storeKey.quote(code), () => store.getQuote(code));
  return (
    <>
      <BuyButton onOpen={(t0) => setOrder({ t0 })} />
      {order && (
        <OrderDialog
          key={order.t0}
          code={code}
          name={name}
          latestPrice={quote?.tick.price}
          t0={order.t0}
          onClose={() => setOrder(null)}
        />
      )}
    </>
  );
});

type RowProps = {
  store: MarketStore;
  symbol: SymbolInfo;
  selected: boolean;
  onSelect: (code: string) => void;
};

// props가 그대로면(store·symbol·onSelect는 고정, selected는 선택 변경 시만 바뀜) 부모 리렌더에 끌려가지 않는다
const QuoteRow = memo(function QuoteRow({ store, symbol, selected, onSelect }: RowProps) {
  // 렌더 횟수 측정 (spec 10장): naive·batched의 StockRow와 같은 위치에서 센다
  countRowRender();
  const quote = useStoreValue(store, storeKey.quote(symbol.code), () => store.getQuote(symbol.code));
  const tick = quote?.tick;
  const color = changeColor(tick?.change ?? 0);
  const flashBg = quote?.flash === "up" ? "bg-red-500/40" : quote?.flash === "down" ? "bg-blue-500/40" : "";
  return (
    <tr
      onClick={() => onSelect(symbol.code)}
      className={`cursor-pointer border-b border-neutral-900 hover:bg-neutral-900 ${selected ? "bg-neutral-800" : ""}`}
    >
      <td className="truncate py-1">
        {symbol.name} <span className="text-neutral-500 text-xs">{symbol.code}</span>
      </td>
      {/* 깜빡임: 배경색을 켰다 끄기만 한다 (애니메이션 없음 → paint 2회). 만료는 스토어 flush가 처리 */}
      <td className={`py-1 text-right ${color} ${flashBg}`}>{tick ? formatInt(tick.price) : "-"}</td>
      <td className={`py-1 text-right ${color}`}>{tick ? formatChange(tick.change) : "-"}</td>
      <td className={`py-1 text-right ${color}`}>{tick ? formatRate(tick.rate) : "-"}</td>
      <td className="py-1 text-right text-neutral-300">{tick ? formatInt(tick.accVol) : "-"}</td>
    </tr>
  );
});

function SelectedOrderBook({ store, code }: { store: MarketStore; code: string }) {
  const book = useStoreValue(store, storeKey.book(code), () => store.getBook(code));
  const quote = useStoreValue(store, storeKey.quote(code), () => store.getQuote(code));
  return (
    <div style={{ contain: "content" }}>
      <OrderBookView book={book} lastPrice={quote?.tick.price} />
    </div>
  );
}

// naive·batched의 TradeList와 같은 마크업. 차이는 key뿐이다:
// 공용 TradeList는 key에 index가 들어가 새 체결이 올 때마다 50행이 전부 다시 만들어지지만,
// 여기서는 체결 고유 id를 key로 써서 새 행만 추가되고 나머지 행은 memo로 건너뛴다.
function SelectedTrades({ store, code }: { store: MarketStore; code: string }) {
  const items = useStoreValue(store, storeKey.trades(code), () => store.getTrades(code));
  return (
    <table className="w-full border-collapse text-xs" style={{ contain: "content" }}>
      <thead className="text-neutral-400">
        <tr className="border-b border-neutral-800">
          <th className="py-1 text-left font-normal">시간</th>
          <th className="py-1 text-right font-normal">체결가</th>
          <th className="py-1 text-right font-normal">체결량</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <TradeRow key={item.id} tick={item.tick} />
        ))}
      </tbody>
    </table>
  );
}

const TradeRow = memo(function TradeRow({ tick }: { tick: Tick }) {
  return (
    <tr className="border-b border-neutral-900">
      <td className="py-0.5 text-neutral-400">{formatTime(tick.time)}</td>
      <td className={`py-0.5 text-right ${changeColor(tick.change)}`}>{formatInt(tick.price)}</td>
      <td className="py-0.5 text-right">{formatInt(tick.tradeVol)}</td>
    </tr>
  );
});

/** 매 flush 후 커밋 시점에 표시 지연을 기록한다 (naive·batched의 useLayoutEffect와 같은 기준) */
function CommitProbe({ store }: { store: MarketStore }) {
  useStoreValue(store, storeKey.frame, () => store.getFrameVersion());
  useLayoutEffect(() => {
    recordLatencies(store.takePendingSentAt());
  });
  return null;
}
