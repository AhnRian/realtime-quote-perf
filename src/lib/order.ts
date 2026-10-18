// 주문 안정성 순수 로직 (spec 5.3). 실제 주문 API는 호출하지 않는다.

/** 마지막 시세 수신 후 이 시간이 지나면 "가격 지연" 경고 */
export const STALE_MS = 3_000;

export function isStale(lastMessageAt: number | null, now: number, staleMs = STALE_MS): boolean {
  return lastMessageAt === null || now - lastMessageAt > staleMs;
}

/** 주문 고유 키 (멱등 키). 같은 키로 두 번 들어온 주문은 서버가 한 번만 처리하는 구조를 전제한다 */
export function createOrderKey(): string {
  return crypto.randomUUID();
}

/**
 * 중복 제출 방지.
 * 버튼 disabled는 리렌더 후에야 반영되므로, 한 프레임 안의 연속 클릭은 둘 다 핸들러에 들어온다.
 * 그래서 렌더와 무관한 동기 플래그로 핸들러 진입 시점에 막는다.
 */
export class SubmitGuard {
  private pending = false;

  tryBegin(): boolean {
    if (this.pending) return false;
    this.pending = true;
    return true;
  }

  end(): void {
    this.pending = false;
  }

  get isPending(): boolean {
    return this.pending;
  }
}

export type PriceCheck = { changed: boolean; diff: number };

/** 확인 단계: 패널을 열 때의 가격과 지금 최신가 비교 */
export function checkPrice(orderPrice: number, latestPrice: number): PriceCheck {
  return { changed: orderPrice !== latestPrice, diff: latestPrice - orderPrice };
}
