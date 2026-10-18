"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getLastMessageAt, type ConnectionState } from "@/lib/market-socket";
import { STALE_MS, isStale } from "@/lib/order";
import type { DataSource, RenderMode } from "@/lib/types";

// 모드와 상관없이 같은 화면 틀을 쓰도록 레이아웃을 분리한다

const STATUS_STYLE: Record<ConnectionState, { label: string; className: string }> = {
  connected: { label: "연결됨", className: "bg-green-900" },
  refreshing: { label: "갱신 중", className: "bg-blue-900" },
  reconnecting: { label: "재연결 중", className: "bg-yellow-900" },
  disconnected: { label: "끊김", className: "bg-red-900" },
};

type Props = {
  mode: RenderMode;
  source: DataSource;
  rate: number | null;
  status: ConnectionState;
  selectedName: string;
  list: ReactNode;
  orderBook: ReactNode;
  trades: ReactNode;
  /** 매수 버튼 (+ 열렸을 때 주문 확인 패널) */
  order: ReactNode;
};

export function MarketLayout({ mode, source, rate, status, selectedName, list, orderBook, trades, order }: Props) {
  const style = STATUS_STYLE[status];
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <h1 className="font-semibold">실시간 시세</h1>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">mode={mode}</span>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">source={source}</span>
        {rate !== null && <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">rate={rate}</span>}
        <span data-connection-state={status} className={`rounded px-2 py-0.5 text-xs ${style.className}`}>
          {style.label}
        </span>
        {status === "connected" && <DelayBadge />}
      </header>
      <div className="flex min-h-0 flex-1">
        <section className="flex-1 overflow-auto px-4">{list}</section>
        <aside className="flex w-96 flex-col border-l border-neutral-800">
          <div className="flex items-center justify-between px-3 pt-2">
            <h2 className="text-xs text-neutral-400">{selectedName} 호가</h2>
            {order}
          </div>
          <div className="px-3">{orderBook}</div>
          <h2 className="px-3 pt-3 text-xs text-neutral-400">최근 체결</h2>
          <div className="min-h-0 flex-1 overflow-auto px-3">{trades}</div>
        </aside>
      </div>
    </div>
  );
}

/** 연결은 살아 있는데 3초 이상 데이터가 없으면 "지연" (spec 7.2). 자기 state만 0.5초마다 갱신한다 */
function DelayBadge() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setStale(isStale(getLastMessageAt(), Date.now())), 500);
    return () => clearInterval(id);
  }, []);
  if (!stale) return null;
  return (
    <span className="rounded bg-orange-900 px-2 py-0.5 text-xs" title={`${STALE_MS / 1000}초 이상 시세 없음`}>
      지연
    </span>
  );
}
