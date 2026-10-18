# 측정 결과

## 조건
- 빌드: 프로덕션 (`pnpm build && pnpm start`)
- 브라우저: Chrome ___ / CPU 20x 쓰로틀링 (spec 5.5)
- 기기: ___
- 종목 30개, seed=42, 각 30초

## 결과표
| 모드 | rate | FPS | 초당 렌더 | Long Task (개/총 ms) | 지연 p50 | 지연 p95 | 관찰 |
|---|---|---|---|---|---|---|---|
| naive | 50 | | | | | | |
| naive | 100 | | | | | | |
| naive | 200 | | | | | | |
| naive | 500 | | | | | | |
| batched | 50 | | | | | | |
| batched | 100 | | | | | | |
| batched | 200 | | | | | | |
| batched | 500 | | | | | | |
| optimized | 50 | | | | | | |
| optimized | 100 | | | | | | |
| optimized | 200 | | | | | | |
| optimized | 500 | | | | | | |

## 장 초반 버스트 (burst=1, rate 200 → 10초간 1000)
| 모드 | 최저 FPS | Long Task | 지연 p95 | 관찰 |
|---|---|---|---|---|
| naive | | | | |
| optimized | | | | |

## 사전 탐색 (참고용, 공식 결과 아님)
2026-10-17, Claude가 Playwright + 헤드리스 Chrome으로 측정. CPU 쓰로틀링은 CDP `Emulation.setCPUThrottlingRate`(DevTools 쓰로틀링과 같은 기능).
헤드리스라 실제 Chrome 창과 수치가 다를 수 있고, 같은 조건 반복 시 FPS 편차가 약 15% 있었다.

### 1. CPU 4x로는 naive도 버벅이지 않는다 (이 Mac 기준)
| 조건 (naive) | FPS | 최저 FPS | Long Task | 지연 p95 |
|---|---|---|---|---|
| rate 200, 4x | 60 | 59 | 0 | 5ms |
| rate 2000, 4x | 59.7 | 54 | 0 | 24ms |
| rate 50, 20x | 56.2 | 32 | 2 | 74ms |
| rate 200, 20x | 43.5 | 24 | 4 | 108ms |
| rate 500, 20x | 18.4 | 8 | 26 (1,597ms) | 225ms |

### 2. 렌더 횟수를 줄여도 FPS가 안 오른 이유: 병목은 브라우저 렌더링 단계
5초 트레이스, 렌더러 메인 스레드 합계 (rate 200, 20x, 최적화 전 optimized = spec 9장 그대로):

| 단계 | naive | batched | optimized(초기) |
|---|---|---|---|
| JS (FunctionCall + rAF + Timer) | 1.91s | 2.04s | 1.98s |
| 스타일 재계산 | 0.21s | 0.19s | 0.45s |
| Layout | 0.76s | 0.82s | 0.75s |
| Paint | 1.50s | 1.80s | 1.71s |

- 세 모드 모두 메인 스레드가 5초 내내 바빴고, 그중 절반가량이 Layout·Paint였다.
- `background-color` CSS 애니메이션 깜빡임 → 애니메이션 중인 셀마다 매 프레임 스타일 재계산·paint (스타일 재계산 2배).
- opacity 오버레이 애니메이션으로 바꾸자 Paint는 0.76s로 줄었지만, 깜빡일 때마다 컴포지터 레이어가 새로 생겨 Layerize가 0.19s → 0.80s로 늘어 FPS는 오히려 하락.
- 공용 `TradeList`의 key(`sentAt-index`) 때문에 새 체결마다 50행 전체가 다시 만들어짐 (naive·batched는 비교 기준이라 그대로 둠).

### 3. 최종 optimized (깜빡임 토글 + table-layout fixed + contain + 체결 고유 key)
| 모드 | rate | FPS | 최저 FPS | 행 렌더/s | Long Task (개/ms) | 지연 p50 | 지연 p95 |
|---|---|---|---|---|---|---|---|
| naive | 200 | 36 / 45.9 | 19 / 27 | 1,147 / 1,550 | 11/798 · 3/185 | 72 / 52 | 148 / 103 |
| batched | 200 | 48.2 / 48.2 | 30 / 27 | 1,424 | 3/194 · 1/56 | 53 | 106 / 105 |
| optimized | 200 | 58 / 54 | 46 / 36 | 168 / 165 | 2/125 · 4/238 | 15 / 19 | 42 / 60 |
| naive | 500 | 20.4 | 11 | 611 | 21/1,314 | 114 | 221 |
| batched | 500 | 26.3 | 21 | 787 | 5/281 | 107 | 162 |
| optimized | 500 | 48.1 | 30 | 318 | 8/457 | 32 | 73 |

(rate 200은 2회 측정, `/`로 구분. CPU 20x)

- naive의 "행 렌더/s ÷ 30"(커밋 수)이 메시지 수보다 적다 → React 18+ 자동 배칭이 일부 setState를 합쳐 준다 (spec 14장).
- batched는 쓰로틀 없는 rate 200에서 지연 p50이 1 → 12ms로 늘었다. 다음 프레임까지 모아서 반영하기 때문 (처리량 ↔ 지연 트레이드오프).

## 막혔던 점 / 배운 점
-
