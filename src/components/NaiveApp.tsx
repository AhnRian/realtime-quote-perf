"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MarketLayout } from "@/components/MarketLayout";
import { OrderBookView } from "@/components/OrderBookView";
import { StockTable } from "@/components/StockTable";
import { TradeList } from "@/components/TradeList";
import { EMPTY_MARKET, applyEvent, flashDirection, type FlashDir } from "@/lib/market-state";
import { connectMarket, marketSymbols, marketUrl, type ConnectionStatus } from "@/lib/market-socket";
import { recordLatencies } from "@/lib/perf-recorder";
import type { DataSource, MockParams } from "@/lib/types";

// ⚠️ 비교 기준 코드. 개선하거나 삭제하지 않는다 (CLAUDE.md).
// spec 9장 naive: 메시지마다 setState, 전체 시세를 이 컴포넌트 하나의 state로 관리,
// 깜빡임은 state + setTimeout.

const FLASH_MS = 300;

export function NaiveApp({ source, params }: { source: DataSource; params: MockParams }) {
  const symbols = useMemo(() => marketSymbols(source, params), [source, params]);
  const [market, setMarket] = useState(EMPTY_MARKET);
  const [flashes, setFlashes] = useState<Record<string, FlashDir | undefined>>({});
  const [selected, setSelected] = useState(symbols[0]?.code ?? "");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const lastPrice = useRef<Record<string, number>>({});
  /** 종목별 깜빡임 순번. 더 최근 깜빡임이 시작됐으면 이전 타이머가 지우지 않도록 한다 */
  const flashSeq = useRef<Record<string, number>>({});
  /** 아직 화면에 반영(커밋)되지 않은 메시지의 sentAt (표시 지연 측정용) */
  const pendingSentAt = useRef<number[]>([]);

  // 커밋 직후: 이번 커밋에 포함된 메시지의 표시 지연 기록 (spec 10장)
  useLayoutEffect(() => {
    recordLatencies(pendingSentAt.current);
    pendingSentAt.current = [];
  });

  useEffect(() => {
    return connectMarket(marketUrl(source, params), {
      onStatus: setStatus,
      onEvents: (events) => {
        for (const event of events) {
          // 메시지마다 setState
          setMarket((prev) => applyEvent(prev, event));
          pendingSentAt.current.push(event.type === "tick" ? event.tick.sentAt : event.book.sentAt);

          if (event.type !== "tick") continue;
          const { code, price } = event.tick;
          const dir = flashDirection(lastPrice.current[code], price);
          lastPrice.current[code] = price;
          if (!dir) continue;
          setFlashes((prev) => ({ ...prev, [code]: dir }));
          const seq = (flashSeq.current[code] ?? 0) + 1;
          flashSeq.current[code] = seq;
          setTimeout(() => {
            if (flashSeq.current[code] !== seq) return;
            setFlashes((prev) => ({ ...prev, [code]: undefined }));
          }, FLASH_MS);
        }
      },
    });
  }, [source, params]);

  const selectedName = symbols.find((s) => s.code === selected)?.name ?? selected;

  return (
    <MarketLayout
      mode="naive"
      source={source}
      rate={source === "mock" ? params.rate : null}
      status={status}
      selectedName={selectedName}
      list={
        <StockTable
          symbols={symbols}
          quotes={market.quotes}
          flashes={flashes}
          selected={selected}
          onSelect={setSelected}
        />
      }
      orderBook={<OrderBookView book={market.books[selected]} lastPrice={market.quotes[selected]?.price} />}
      trades={<TradeList trades={market.trades[selected] ?? []} />}
    />
  );
}
