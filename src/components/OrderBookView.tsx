import { formatInt } from "@/lib/format";
import type { Level, OrderBook } from "@/lib/types";

// 10단 호가창: 매도 10→1 (위), 매수 1→10 (아래), 잔량 막대

export function OrderBookView({ book, lastPrice }: { book: OrderBook | undefined; lastPrice: number | undefined }) {
  if (!book) return <div className="p-2 text-neutral-500">호가 대기 중</div>;
  const maxQty = Math.max(1, ...book.asks.map((l) => l.qty), ...book.bids.map((l) => l.qty));
  return (
    <table className="w-full border-collapse text-xs">
      <tbody>
        {[...book.asks].reverse().map((l, i) => (
          <LevelRow key={`a${i}`} level={l} side="ask" maxQty={maxQty} current={l.price === lastPrice} />
        ))}
        {book.bids.map((l, i) => (
          <LevelRow key={`b${i}`} level={l} side="bid" maxQty={maxQty} current={l.price === lastPrice} />
        ))}
      </tbody>
    </table>
  );
}

function LevelRow({ level, side, maxQty, current }: { level: Level; side: "ask" | "bid"; maxQty: number; current: boolean }) {
  const width = `${(level.qty / maxQty) * 100}%`;
  const bar = side === "ask" ? "bg-blue-500/30" : "bg-red-500/30";
  const qtyCell = (
    <td className="relative w-2/5 py-0.5">
      <div className={`absolute inset-y-0.5 ${side === "ask" ? "right-0" : "left-0"} ${bar}`} style={{ width }} />
      <span className={`relative block px-1 ${side === "ask" ? "text-right" : "text-left"}`}>{formatInt(level.qty)}</span>
    </td>
  );
  return (
    <tr className={side === "ask" ? "bg-blue-950/30" : "bg-red-950/30"}>
      {side === "ask" ? qtyCell : <td className="w-2/5" />}
      <td className={`w-1/5 py-0.5 text-center ${current ? "outline outline-1 outline-yellow-400" : ""}`}>
        {formatInt(level.price)}
      </td>
      {side === "bid" ? qtyCell : <td className="w-2/5" />}
    </tr>
  );
}
