# Tasks

우선순위: ⭐ 필수 (자소서 흐름 완성) / ○ 여유 있으면
진행 규칙: 한 번에 하나씩, 위에서부터. 완료 시 체크하고 결과 요약.

---

## Day 1 — 기본 화면 + 비교 기준 + 측정 도구

### T0. 사전 준비 (사람이 직접) ⭐
- [x] KIS Developers 모의투자 앱키 발급
- [x] `.env.local` 생성, `.gitignore`에 포함 확인
- [x] `.claude/settings.json`에 `.env` 읽기 차단 설정 (docs/guide.md 5장)

### T1. 프로젝트 세팅 ⭐
- 목표: Next.js + TS + Tailwind + Vitest + tsx + ws 개발 환경
- 산출물: `package.json` 스크립트(`dev`, `build`, `start`, `mock`, `test`, `typecheck`, `lint`), 기본 레이아웃 페이지
- 수용 기준
  - [x] `pnpm dev`로 빈 페이지가 뜬다
  - [x] `pnpm test`가 샘플 테스트 1개로 통과한다
  - [x] `pnpm typecheck` 통과

### T2. 타입 · 파서 · KIS 필드 상수 ⭐
- 목표: 내부 프레임 → `Tick` / `OrderBook` 변환
- 산출물: `src/lib/types.ts`, `src/lib/kis-fields.ts`, `src/lib/parser.ts`, `parser.test.ts`
- 수용 기준
  - [x] `H0STCNT0` 1건, 다건(데이터건수 3) 파싱 테스트 통과
  - [x] `H0STASP0` 10단 호가 파싱 테스트 통과
  - [x] 알 수 없는 TR이나 깨진 문자열은 예외 없이 `null` 반환

### T3. Mock 생성기 + Mock 서버 ⭐
- 의존: T2
- 산출물: `src/lib/mock-generator.ts`(순수 함수, 시드 랜덤), `server/mock-server.ts`
- 수용 기준
  - [x] 같은 `seed`면 같은 메시지 순서가 나온다 (테스트)
  - [x] 생성된 `raw`를 T2 파서가 그대로 파싱한다 (테스트)
  - [x] `rate`, `symbols`, `burst`, `seed` 쿼리가 동작한다
  - [x] 1초마다 콘솔에 실제 전송 건수를 출력한다

### T10. KIS 실시간 시세 중계 ⭐ (범위 복귀: 월요일 장중 실데이터 확인)
- 의존: T0, T2
- 산출물: `server/kis-relay.ts`, `pnpm relay`, `?source=kis`
- 수용 기준
  - [x] 접속키 발급과 KIS 연결은 서버에서만 수행, 브라우저 번들에 키 없음
  - [x] 웹소켓 접속키는 한 번 발급 후 재사용 (재연결마다 발급하지 않음)
  - [x] 주말에도 확인 가능: 접속키 발급 성공, 구독 응답(SUBSCRIBE SUCCESS) 수신, PINGPONG 응답
  - [ ] (월요일 장중) 실데이터로 화면 동작 확인 (스크린샷)
  - [ ] (월요일 장중) 실데이터 원문을 `fixtures/kis-raw.txt`로 캡처하고 parser 테스트에 사용
  - [ ] (월요일 장중) `kis-fields.ts` 인덱스를 실데이터 기준으로 검증·수정

### T4. 화면 구현 (`naive` 모드) ⭐
- 의존: T3
- 산출물: 종목 리스트, 호가창, 체결 리스트, 깜빡임, `?mode` 쿼리 처리
- 수용 기준
  - [x] spec FR-1 ~ FR-5 충족 (batched·optimized는 T7·T8 전까지 naive로 대체)
  - [x] `naive`는 spec 9장 방식 그대로 (메시지마다 setState)

### T5. 측정 패널 ⭐
- 의존: T4
- 산출물: `src/lib/metrics.ts`(p50/p95 등 계산, 테스트 포함), 오버레이 패널, "30초 측정" 버튼
- 수용 기준
  - [x] FPS, 초당 렌더 수, Long Task 개수/총 시간, 지연 p50/p95 표시
  - [x] 30초 측정 후 `{ mode, source, rate, fps, fpsMin, renders, messages, longTasks, longTaskMs, p50, p95 }` JSON 복사 (spec 10장)
  - [x] 프로덕션 빌드에서도 동작

### T6. Baseline 측정 (사람 + Claude) ⭐
- 의존: T5
- 산출물: `docs/results.md`의 `naive` 행 4개
- 수용 기준
  - [ ] spec 10장 조건으로 rate 50/100/200/500 측정 완료
  - [ ] 체감 관찰(끊김, 깜빡임 밀림 등) 한 줄씩 기록

---

## Day 2 — 단계별 개선 + 정리

### T7. `batched` 모드 ⭐
- 의존: T6
- 산출물: rAF 배칭 훅, `src/lib/apply-batch.ts`(테스트 포함)
- 수용 기준
  - [x] 초당 상태 반영 횟수가 FPS 이하
  - [x] 같은 종목 여러 메시지가 한 프레임에 오면 최신값만 반영 (테스트)
  - [ ] 측정 후 `docs/results.md`에 기록

### T8. `optimized` 모드 ⭐
- 의존: T7
- 산출물: 외부 스토어(`useSyncExternalStore` 종목별 구독), `React.memo` 행, CSS 깜빡임, 체결 링 버퍼
- 수용 기준
  - [x] 한 종목만 바뀌면 그 행만 렌더된다 (렌더 카운터로 확인: rate 5에서 행 렌더 3.5회/s = 체결 메시지 수)
  - [x] 체결 리스트가 50건을 넘지 않는다 (테스트)
  - [ ] 측정 후 `docs/results.md`에 기록, spec 11장 성능 기준 충족

---

## 제출 후

제출 범위는 T1~T8 + T10으로 정했다. 아래 태스크는 제출 이후에 진행한다.

### T9. 연결 안정성 ○
- 산출물: 지수 백오프 재연결(0.5s → 최대 10s, 지터), 상태 배지, 3초 지연 표시
- 수용 기준
  - [ ] Mock 서버를 껐다 켜면 자동 재연결된다
  - [ ] spec FR-8, FR-9 충족

### T11. 배포용 Worker 모드 + README ⭐
- 산출물: `?source=worker` (Mock 생성기를 Web Worker에서 실행), Vercel 배포, `README.md`
- 수용 기준
  - [ ] 배포 링크에서 Worker 모드로 동작
  - [ ] README: 문제 상황 → 측정 방법 → 모드별 개선 → 결과표 → 배운 점
  - [ ] 개선 전후 비교 GIF 1개
