import type { ReactNode } from "react";
import type { ConnectionStatus } from "@/lib/market-socket";
import type { DataSource, RenderMode } from "@/lib/types";

// 모드와 상관없이 같은 화면 틀을 쓰도록 레이아웃을 분리한다

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "연결 중",
  open: "연결됨",
  closed: "끊김",
};

type Props = {
  mode: RenderMode;
  source: DataSource;
  rate: number | null;
  status: ConnectionStatus;
  selectedName: string;
  list: ReactNode;
  orderBook: ReactNode;
  trades: ReactNode;
};

export function MarketLayout({ mode, source, rate, status, selectedName, list, orderBook, trades }: Props) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <h1 className="font-semibold">실시간 시세</h1>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">mode={mode}</span>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">source={source}</span>
        {rate !== null && <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">rate={rate}</span>}
        <span
          className={`rounded px-2 py-0.5 text-xs ${status === "open" ? "bg-green-900" : status === "closed" ? "bg-red-900" : "bg-yellow-900"}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        <section className="flex-1 overflow-auto px-4">{list}</section>
        <aside className="flex w-96 flex-col border-l border-neutral-800">
          <h2 className="px-3 pt-2 text-xs text-neutral-400">{selectedName} 호가</h2>
          <div className="px-3">{orderBook}</div>
          <h2 className="px-3 pt-3 text-xs text-neutral-400">최근 체결</h2>
          <div className="min-h-0 flex-1 overflow-auto px-3">{trades}</div>
        </aside>
      </div>
    </div>
  );
}
