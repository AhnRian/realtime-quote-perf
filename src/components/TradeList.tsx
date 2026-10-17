import { changeColor, formatInt, formatTime } from "@/lib/format";
import type { Tick } from "@/lib/types";

// 최근 체결 리스트 (최신이 위)

export function TradeList({ trades }: { trades: readonly Tick[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="text-neutral-400">
        <tr className="border-b border-neutral-800">
          <th className="py-1 text-left font-normal">시간</th>
          <th className="py-1 text-right font-normal">체결가</th>
          <th className="py-1 text-right font-normal">체결량</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t, i) => (
          <tr key={`${t.sentAt}-${i}`} className="border-b border-neutral-900">
            <td className="py-0.5 text-neutral-400">{formatTime(t.time)}</td>
            <td className={`py-0.5 text-right ${changeColor(t.change)}`}>{formatInt(t.price)}</td>
            <td className="py-0.5 text-right">{formatInt(t.tradeVol)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
