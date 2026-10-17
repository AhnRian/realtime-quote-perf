const intFormat = new Intl.NumberFormat("ko-KR");

export function formatInt(n: number): string {
  return intFormat.format(n);
}

/** 등락률 (+1.23%) */
export function formatRate(rate: number): string {
  return `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;
}

/** 전일대비 (▲500 / ▼500) */
export function formatChange(change: number): string {
  if (change === 0) return "0";
  return `${change > 0 ? "▲" : "▼"}${intFormat.format(Math.abs(change))}`;
}

/** HHMMSS → HH:MM:SS */
export function formatTime(time: string): string {
  return `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
}

/** 상승 빨강, 하락 파랑 */
export function changeColor(change: number): string {
  return change > 0 ? "text-red-400" : change < 0 ? "text-blue-400" : "text-neutral-300";
}
