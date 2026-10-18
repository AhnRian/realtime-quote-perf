import { recordOrderResponse } from "./perf-recorder";

// 주문 반응 시간 측정 (spec 5.4)
// = 클릭 시각(T0) → 주문 패널이 그려진 직후(T3)
// Event Timing API는 실제 사용자 입력(isTrusted)만 기록해서 자동 클릭 비교에 쓸 수 없으므로 직접 잰다.

/** 자동 클릭이 "원래 실행됐어야 하는 시각" (performance.now 기준) */
let pendingAutoClickAt: number | null = null;

/** 자동 클릭 직전에 호출: 타이머가 늦게 불린 시간(메인 스레드 대기)까지 반응 시간에 포함시키기 위해 */
export function markAutoClick(scheduledAt: number): void {
  pendingAutoClickAt = scheduledAt;
}

/** 클릭 이벤트에서 T0를 정한다. 실제 클릭은 입력 시각(event.timeStamp), 자동 클릭은 예정 시각 */
export function clickStart(event: { isTrusted: boolean; timeStamp: number }): number {
  if (!event.isTrusted && pendingAutoClickAt !== null) {
    const at = pendingAutoClickAt;
    pendingAutoClickAt = null;
    return at;
  }
  return event.timeStamp;
}

/**
 * 패널 커밋 직후(useLayoutEffect) 호출. 다음 paint가 끝난 직후를 T3로 근사한다:
 * rAF 콜백은 paint 직전에 실행되고, 그 안에서 건 setTimeout은 paint가 끝난 뒤 실행된다.
 */
export function measureOrderOpened(t0: number): void {
  requestAnimationFrame(() => {
    setTimeout(() => recordOrderResponse(performance.now() - t0), 0);
  });
}
