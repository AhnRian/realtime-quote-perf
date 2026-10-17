"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MarketLayout } from "@/components/MarketLayout";
import { OrderBookView } from "@/components/OrderBookView";
import { StockTable } from "@/components/StockTable";
import { TradeList } from "@/components/TradeList";
import {
  addToBatch,
  applyBatch,
  batchSentAts,
  createBatch,
  isBatchEmpty,
  updateFlashes,
  type Flash,
} from "@/lib/apply-batch";
import { EMPTY_MARKET, type FlashDir, type MarketState } from "@/lib/market-state";
import { connectMarket, marketSymbols, marketUrl, type ConnectionStatus } from "@/lib/market-socket";
import { recordLatencies } from "@/lib/perf-recorder";
import type { DataSource, MockParams } from "@/lib/types";

// spec 9장 batched: 메시지는 ref 버퍼에 쌓고 requestAnimationFrame마다 한 번만 setState.
// 화면 컴포넌트는 naive와 같은 것을 쓴다 (렌더 범위는 그대로, 렌더 횟수만 줄이는 단계).

const FLASH_MS = 300;

type View = { market: MarketState; flashes: Record<string, Flash> };
const EMPTY_VIEW: View = { market: EMPTY_MARKET, flashes: {} };

export function BatchedApp({ source, params }: { source: DataSource; params: MockParams }) {
  const symbols = useMemo(() => marketSymbols(source, params), [source, params]);
  const [view, setView] = useState(EMPTY_VIEW);
  const [selected, setSelected] = useState(symbols[0]?.code ?? "");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const pendingSentAt = useRef<number[]>([]);

  useLayoutEffect(() => {
    recordLatencies(pendingSentAt.current);
    pendingSentAt.current = [];
  });

  useEffect(() => {
    let batch = createBatch();
    // 최신 화면 상태를 ref로도 들고 있어서, rAF 안에서 setState 없이 변경 여부를 판단한다
    let current = EMPTY_VIEW;
    let raf = 0;

    const frame = () => {
      const now = performance.now();
      const flashes = updateFlashes(current.flashes, current.market.quotes, batch, now, FLASH_MS);
      if (!isBatchEmpty(batch) || flashes !== current.flashes) {
        current = { market: applyBatch(current.market, batch), flashes };
        pendingSentAt.current.push(...batchSentAts(batch));
        batch = createBatch();
        // 프레임당 setState 최대 1번
        setView(current);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const disconnect = connectMarket(marketUrl(source, params), {
      onStatus: setStatus,
      onEvents: (events) => {
        for (const event of events) addToBatch(batch, event);
      },
    });
    return () => {
      cancelAnimationFrame(raf);
      disconnect();
    };
  }, [source, params]);

  const flashDirs = useMemo(() => {
    const dirs: Record<string, FlashDir> = {};
    for (const [code, flash] of Object.entries(view.flashes)) dirs[code] = flash.dir;
    return dirs;
  }, [view.flashes]);

  const { market } = view;
  const selectedName = symbols.find((s) => s.code === selected)?.name ?? selected;

  return (
    <MarketLayout
      mode="batched"
      source={source}
      rate={source === "mock" ? params.rate : null}
      status={status}
      selectedName={selectedName}
      list={
        <StockTable
          symbols={symbols}
          quotes={market.quotes}
          flashes={flashDirs}
          selected={selected}
          onSelect={setSelected}
        />
      }
      orderBook={<OrderBookView book={market.books[selected]} lastPrice={market.quotes[selected]?.price} />}
      trades={<TradeList trades={market.trades[selected] ?? []} />}
    />
  );
}
