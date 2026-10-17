// KRX 호가가격단위 (2023-01-25 이후 코스피·코스닥 공통)
const TABLE: ReadonlyArray<readonly [limit: number, unit: number]> = [
  [2_000, 1],
  [5_000, 5],
  [20_000, 10],
  [50_000, 50],
  [200_000, 100],
  [500_000, 500],
];

/** 해당 가격에서의 호가 단위 */
export function tickSize(price: number): number {
  for (const [limit, unit] of TABLE) {
    if (price < limit) return unit;
  }
  return 1_000;
}

/** 한 호가 위 가격 */
export function tickUp(price: number): number {
  return price + tickSize(price);
}

/** 한 호가 아래 가격. 경계(예: 2,000 → 1,999)에서는 아래 구간의 단위를 쓴다 */
export function tickDown(price: number): number {
  return price - tickSize(price - 1);
}

/** 호가 단위에 맞춰 내림 */
export function alignToTick(price: number): number {
  const unit = tickSize(price);
  return Math.floor(price / unit) * unit;
}
