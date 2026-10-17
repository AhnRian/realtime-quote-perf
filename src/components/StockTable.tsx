import { changeColor, formatChange, formatInt, formatRate } from "@/lib/format";
import type { FlashDir } from "@/lib/market-state";
import type { SymbolInfo } from "@/lib/mock-generator";
import { countRowRender } from "@/lib/perf-recorder";
import type { Tick } from "@/lib/types";

// naive·batched 공용 종목 리스트. props만 받는 단순 컴포넌트 (memo 없음)

type Props = {
  symbols: SymbolInfo[];
  quotes: Record<string, Tick>;
  flashes: Record<string, FlashDir | undefined>;
  selected: string;
  onSelect: (code: string) => void;
};

export function StockTable({ symbols, quotes, flashes, selected, onSelect }: Props) {
  return (
    <table className="w-full border-collapse">
      <StockTableHead />
      <tbody>
        {symbols.map((s) => (
          <StockRow
            key={s.code}
            symbol={s}
            quote={quotes[s.code]}
            flash={flashes[s.code]}
            selected={s.code === selected}
            onSelect={onSelect}
          />
        ))}
      </tbody>
    </table>
  );
}

export function StockTableHead() {
  return (
    <thead className="text-neutral-400 text-xs">
      <tr className="border-b border-neutral-800">
        <th className="py-1 text-left font-normal">종목</th>
        <th className="py-1 text-right font-normal">현재가</th>
        <th className="py-1 text-right font-normal">전일대비</th>
        <th className="py-1 text-right font-normal">등락률</th>
        <th className="py-1 text-right font-normal">누적거래량</th>
      </tr>
    </thead>
  );
}

type RowProps = {
  symbol: SymbolInfo;
  quote: Tick | undefined;
  flash: FlashDir | undefined;
  selected: boolean;
  onSelect: (code: string) => void;
};

function StockRow({ symbol, quote, flash, selected, onSelect }: RowProps) {
  // 렌더 횟수 측정 (spec 10장): 모드와 무관하게 종목 행 렌더 함수에서 센다
  countRowRender();
  const color = changeColor(quote?.change ?? 0);
  const flashBg = flash === "up" ? "bg-red-500/40" : flash === "down" ? "bg-blue-500/40" : "";
  return (
    <tr
      onClick={() => onSelect(symbol.code)}
      className={`cursor-pointer border-b border-neutral-900 hover:bg-neutral-900 ${selected ? "bg-neutral-800" : ""}`}
    >
      <td className="py-1">
        {symbol.name} <span className="text-neutral-500 text-xs">{symbol.code}</span>
      </td>
      <td className={`py-1 text-right ${color} ${flashBg}`}>{quote ? formatInt(quote.price) : "-"}</td>
      <td className={`py-1 text-right ${color}`}>{quote ? formatChange(quote.change) : "-"}</td>
      <td className={`py-1 text-right ${color}`}>{quote ? formatRate(quote.rate) : "-"}</td>
      <td className="py-1 text-right text-neutral-300">{quote ? formatInt(quote.accVol) : "-"}</td>
    </tr>
  );
}
