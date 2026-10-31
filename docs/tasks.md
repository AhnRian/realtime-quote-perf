# Tasks

진행 규칙: 한 번에 하나씩 위에서부터. 끝나면 수용 기준 확인 → typecheck·test 통과 → 체크 → 커밋.
우선순위: ⭐ 제출 전 필수 / ○ 시간 되면 / ⏭ 제출 후

이미 진행한 이전 태스크가 있으면 아래 번호에 맞춰 체크만 옮긴다 (이전 T1~T3 → S1~S3, T4~T8 → A1~A5).

---

## 0. 공통 준비

### S0. 사전 준비 (사람) ⭐
- [x] KIS 모의투자 앱키 발급
- [x] `.env.local` 작성, `.gitignore`에 `.env*.local` 확인 (`.env.*` 패턴으로 포함)
- [x] `.claude/settings.json`으로 `.env` 읽기 차단

### S1. 프로젝트 세팅 ⭐
- Next.js(App Router) + TS strict + Tailwind + Vitest + tsx + ws
- [x] `pnpm dev / build / start / mock / test / typecheck / lint` 동작

### S2. 타입 · 파서 · KIS 필드 상수 ⭐
- [x] H0STCNT0 단건·다건, H0STASP0 파싱 테스트
- [x] 제어 메시지(JSON), 알 수 없는 TR, 깨진 문자열은 예외 없이 처리

### S3. Mock 생성기 + Mock 서버 ⭐ (spec 5.1)
- [x] seed 재현성, 생성 원문을 파서가 파싱 (테스트)
- [x] rate / burst / 인기 종목 쏠림 / 다건 메시지 / broadcast 모드
- [x] 1초마다 접속 수·전송 건수 출력

---

## A. 브라우저 부하

### A1. 화면 (naive) ⭐
- [x] 종목 리스트, 10단 호가, 최근 체결, 깜빡임, `?mode` 처리
- [x] 매수 버튼 → 주문 확인 패널 (API 호출 없음)

### A2. 측정 패널 ⭐ (spec 5.4)
- [x] FPS, 렌더 수, Long Task, 표시 지연 p50/p95, 주문 반응 p50/p95, 수신 건수
- [x] `?autoclick=1`, 30초 측정 → JSON 복사
- [x] 프로덕션 빌드에서 동작

### A3. naive 측정 (사람 + Claude) ⭐
- [x] rate 50 / 200 / 500 + burst, `docs/results.md` 기록

### A4. batched ⭐
- [x] rAF 배칭, 같은 종목은 최신값만 (테스트)
- [x] 측정 후 기록

### A5. optimized ⭐
- [x] 종목별 구독 + memo + CSS 깜빡임 + 링 버퍼 + tabular-nums (깜빡임은 측정 결과에 따라 CSS 애니메이션 대신 클래스 토글, results.md 사전 탐색 2·3 참고)
- [x] 한 종목만 바뀌면 그 행만 렌더 (카운터로 확인)
- [x] 측정 후 기록, spec 9 A 기준 충족 (rate 200·20x: FPS 9.4~12.9 > 6.3, 주문 반응 p95 375~542 < 1,222~4,611ms)

### A6. 주문 안정성 ⭐ (spec 5.3)
- [x] 시세 3초 지연 시 경고, 확인 단계 최신가, 중복 클릭 방지, 주문 고유 키
- [x] Mock 서버를 멈췄을 때 경고가 뜨는 것 확인 (스크린샷 `docs/images/a6-stale-warning.png`)

### A7. Sentry 연동 ⭐
- [ ] 브라우저 에러 + 릴리스 버전 기록, 테스트 에러 1건 발생시켜 대시보드에서 확인 (스크린샷)
  - 연동·테스트 에러는 완료: 테스트 에러 이슈 수신, release(git 커밋 해시) 태그 확인 (Sentry API로 확인). 남은 것: 대시보드 스크린샷 (사람)

### A8. visible 모드 ○
- [ ] Intersection Observer로 보이는 행만 갱신, 종목 100개로 optimized와 비교

---

## B. FE 서버 부하 (SSR)

### B1. SSR 종목 상세 + API 모킹 ⭐ (spec 6.1, 6.2)
- [x] `/stocks/[code]` 서버 렌더
- [x] `API_MOCK=1`이면 fixtures + 50ms 지연, 백엔드 호출 없음 (테스트)

### B2. 지표 노출 + 모니터링 ⭐ (spec 6.3)
- [x] `/api/metrics` (SSR 렌더 시간 히스토그램, 요청 수, 프로세스 지표)
- [x] `/api/vitals`로 브라우저 주문 반응·표시 지연 수집 (주문 반응 샘플은 A2에서 연결)
- [x] `docker-compose.monitoring.yml`로 Prometheus + Grafana 실행, 대시보드 JSON 저장
- [x] 대시보드 스크린샷 (`docs/images/b3-grafana-process-ramp.png`)

### B3. k6 SSR 부하 테스트 ⭐ (spec 6.4)
- [x] `load/ssr-load.js`, 기준 p95 < 500ms, 에러율 < 1%
- [x] 컨테이너 1개 한계 찾기, Grafana로 같이 관찰, `results.md` 기록 (호스트 프로세스 ~400, CPU 1 컨테이너 ~150 req/s)

### B4. 컨테이너 수 늘려 비교 ○
- [ ] Docker로 Next 서버 2~3개 + 로드밸런서, 같은 부하에서 처리량 비교

### B5. k6 WebSocket 부하 ○
- [ ] `load/ws-load.js`, broadcast 모드, 도착 지연 p95 < 100ms

### B6. GKE Pod 수 산정 ⏭
- [ ] Pod 1개 한계 → HPA → 필요 Pod 수 계산

---

## C. 실제 시세 연결 (장중: 평일 09:00~15:30)

### C1. KIS 중계 서버 ⭐ (spec 7.1)
- [x] 접속키 발급(재사용), 구독/해제 대행, PINGPONG 응답, 내부 프레임 전달
- [x] 키·접속키가 로그와 번들에 없음
- [ ] 장중에 `?source=kis`로 실데이터 표시 (스크린샷)

### C2. 백그라운드 / 포그라운드 재연결 ⭐ (spec 7.2)
- [x] 재연결 상태 전이를 순수 함수로 분리하고 테스트 (hidden → 60s → 종료, visible → 재연결 + 스냅샷)
- [x] REST 현재가 조회로 복귀 즉시 화면 맞춤, 상태 배지 (캐시 즉시 + 오래된 종목만 REST, spec 7.2 구현 메모)
- [ ] 복귀 → 최신 시세 표시까지 시간 측정, `results.md` 기록 (Mock은 완료, KIS 장중 측정 남음)

### C3. 실데이터 녹화 → fixture ○
- [ ] `--record`로 원문 저장, 파서 테스트에 실데이터 사용, Mock과 필드 수 일치 검사

### C4. 리플레이 ⏭
- [ ] Mock 서버 `source=replay&speed=N`

---

## 마무리

### Z1. README ⭐
- [ ] 세 관점별 문제 → 측정 방법 → 개선 → 결과표 → 배운 점, 스크린샷·GIF
