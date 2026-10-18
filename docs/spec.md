# 실시간 시세 MTS — Spec

## 1. 목적
장 초반처럼 고객과 데이터가 몰리는 순간에도 **화면은 끊기지 않고, FE 서버는 페이지를 그려내며, 실제 시세 연결은 안정적으로 유지되는** MTS를 만든다. 세 관점 모두 **재현 → 감지 → 개선 → 재측정** 순서로 진행하고, 결과는 수치로 남긴다.

| 관점 | 질문 | 부하를 만드는 것 | 측정 |
|---|---|---|---|
| A. 브라우저 | 시세가 쏟아져도 화면과 주문 버튼이 버티는가 | Mock 시세 서버 (rate, burst) | FPS, 주문 반응 시간, 표시 지연, Long Task |
| B. FE 서버 (SSR) | 고객이 몰려도 페이지를 그려내는가, Pod 몇 개가 필요한가 | k6 + API 모킹 | 응답 시간 p95, 에러율, CPU·메모리, Pod당 처리량 |
| C. 실제 연결 | 실제 시세를 받으며, 안 볼 때는 자원을 아끼고 돌아오면 바로 최신으로 맞추는가 | 한투 KIS 실시간 시세 | 재연결 시간, 복귀 후 최신화 시간 |

## 2. 범위
**포함**: 종목 리스트, 10단 호가창, 최근 체결, 매수 버튼(주문 확인 패널까지만), 종목 상세 SSR 페이지, Mock 시세 서버, KIS 중계 서버, 측정 패널, 에러 추적, 지표 대시보드, k6 부하 테스트

**제외**: 실제 주문 API 호출, 잔고·계좌 API, 차트, 로그인

## 2-1. 사용자 시나리오
1. 화면을 열면 종목 30개의 현재가·전일대비·등락률·누적거래량이 실시간으로 갱신된다.
2. 종목을 클릭하면 10단 호가와 최근 체결이 보인다.
3. 가격이 오르면 빨강, 내리면 파랑으로 셀이 잠깐(약 300ms) 깜빡인다.
4. 매수 버튼을 누르면 주문 확인 패널이 열리고, 시세가 늦으면 경고가 보인다.
5. 연결이 끊기면 상태 배지가 바뀌고 자동으로 재연결된다. 3초 이상 데이터가 없으면 "지연"이 표시된다.
6. 탭을 1분 이상 숨겼다 돌아오면 즉시 "갱신 중"이 표시되고 최신 시세로 맞춰진다.
7. 종목 상세 페이지(`/stocks/[code]`)는 서버에서 렌더되어 처음부터 내용이 보인다.

## 2-2. 기능 요구사항
| ID | 내용 | 관점 |
|---|---|---|
| FR-1 | 종목 리스트: 종목명, 현재가, 전일대비, 등락률, 누적거래량 | A |
| FR-2 | 호가창: 매도·매수 10단 가격과 잔량, 잔량 막대 | A |
| FR-3 | 최근 체결 50건 (시간, 가격, 체결량), 초과분은 오래된 것부터 제거 | A |
| FR-4 | 가격 변동 시 상승 빨강·하락 파랑 깜빡임 | A |
| FR-5 | 렌더링 모드 `?mode=naive\|batched\|optimized\|visible` | A |
| FR-6 | 데이터 소스 `?source=mock\|kis\|worker\|replay` (기본 mock) | A·C |
| FR-7 | 측정 패널 + 30초 측정 + JSON 복사 + `?autoclick=1` (주문 반응 시간 정의는 5.4) | A |
| FR-8 | 매수 버튼 → 주문 확인 패널, 지연 경고, 중복 클릭 방지 | A |
| FR-9 | 연결 상태 배지 + 지수 백오프 재연결 + 3초 지연 표시 | C |
| FR-10 | 백그라운드 60초 후 구독 해제·연결 종료, 복귀 시 즉시 재연결 + REST 스냅샷 | C |
| FR-11 | 종목 상세 SSR 페이지 + `API_MOCK` | B |
| FR-12 | `/api/metrics`, `/api/vitals`, Grafana 대시보드 | B |

## 2-3. 비기능 요구사항
- TypeScript strict, `any` 금지
- 파싱·배칭 적용·지표 계산·재연결 상태 전이는 순수 함수로 분리하고 단위 테스트
- 비밀 정보(KIS 키)는 서버 측 `.env.local`에만 존재
- 성능 측정은 프로덕션 빌드에서 수행
- 실시간 KIS 데이터는 장중(평일 09:00~15:30)에만 들어온다. 성능 측정은 Mock으로 한다

## 3. 아키텍처
```
[Mock 시세 서버] ─┐
                  ├─ ws://localhost:8787 (내부 프레임) ─→ [브라우저: 시세 화면]
[KIS 중계 서버] ──┘                                          │ 에러 → Sentry
      │                                                      │ 지표 → /api/vitals
      └─ KIS WebSocket (접속키는 서버에서만)                    │
                                                             ▼
[k6] ── HTTP ──→ [Next.js 서버: SSR 종목 상세] ── /api/metrics ──→ [Prometheus] → [Grafana]
                         │
                         └─ API_MOCK=1 이면 고정 데이터 + 50ms 지연 (백엔드 호출 없음)
```
- 브라우저는 소스(mock / kis / worker)와 상관없이 같은 **내부 프레임**만 받는다.
- 시세(WebSocket)와 주문(REST)은 다른 경로로 분리한다.

## 4. 메시지 형식
### 4.1 내부 프레임 (서버 → 브라우저)
```json
{ "t": 1760500000123, "raw": "0|H0STCNT0|001|005930^093354^71900^..." }
```
- `t`: 서버 전송 시각(ms), 표시 지연 측정용
- `raw`: KIS 실시간 원문

### 4.2 KIS 실시간 원문
- 형식: `암호화여부|TR_ID|데이터건수|필드^필드^...`. 첫 글자 `0` 일반, `1` 암호화(체결통보, 이 프로젝트는 처리 안 함)
- 다건: `^`로 나눈 배열을 레코드당 필드 수 단위로 자른다 (H0STCNT0은 46개)
- 제어 메시지(구독 응답, `PINGPONG`)는 JSON. `PINGPONG`은 받은 그대로 돌려보낸다
- 필드 인덱스는 `src/lib/kis-fields.ts` 상수로 관리 (공식 샘플 기준 확인, 실데이터로 재검증)
  - `H0STCNT0`: 0 종목코드, 1 체결시간, 2 현재가, 3 전일대비부호, 4 전일대비, 5 전일대비율, 12 체결거래량, 13 누적거래량
  - `H0STASP0`: 0 종목코드, 1 영업시간, 2 시간구분코드, 3~12 매도호가 1~10, 13~22 매수호가 1~10, 23~32 매도잔량 1~10, 33~42 매수잔량 1~10, 43 이후 사용 안 함

### 4.3 도메인 타입 (`src/lib/types.ts`)
```ts
type Tick = { code: string; time: string; price: number; change: number;
              rate: number; tradeVol: number; accVol: number; sentAt: number };
type Level = { price: number; qty: number };
type OrderBook = { code: string; asks: Level[]; bids: Level[]; sentAt: number };
type ConnectionState = 'connected' | 'refreshing' | 'reconnecting' | 'disconnected';
```

### 4.4 데이터 소스
| source | 설명 |
|---|---|
| `mock` | 로컬 Mock 시세 서버 (`ws://localhost:8787`) |
| `kis` | KIS 중계 서버 경유 실데이터 |
| `worker` | Mock 생성기를 Web Worker에서 실행 (배포 데모용, 서버 없이 동작) |
| `replay` | 녹화 파일을 원래 간격 / speed로 재생 (⏭) |

## 5. A. 브라우저 부하
### 5.1 Mock 시세 서버 (`server/mock-server.ts`)
- 쿼리: `?rate=200&symbols=30&burst=1&seed=42&mode=broadcast`
  - `rate`: 초당 전체 메시지 수 (체결:호가 = 7:3)
  - `burst=1`: 접속 후 10초간 rate × 5 (장 초반 재현)
  - `seed`: 재현 가능한 랜덤
  - `mode=broadcast`: 생성기 1개가 모든 접속자에게 같은 메시지 전달 (k6 테스트용)
- 가격은 랜덤 워크로 움직이고, 가격대별 호가 단위(틱 사이즈)를 지킨다
- 10ms 틱마다 rate에 맞는 건수를 묶어 전송 (소수점 누적)
- 인기 종목 상위 5개가 메시지의 약 60%
- burst 구간에는 일부 체결을 다건 메시지(데이터건수 2~3)로 전송
- 1초마다 접속 수와 실제 전송 건수 출력
- 생성 로직은 `src/lib/mock-generator.ts` (서버·Worker 공용, 순수 함수)

### 5.2 렌더링 모드 (`?mode=`)
| 모드 | 방식 |
|---|---|
| `naive` | 메시지마다 setState, 전체 시세를 페이지 state 하나로 관리, 깜빡임은 state + setTimeout (비교 기준, 수정 금지) |
| `batched` | ref의 Map에 종목별 최신값만 모으고 requestAnimationFrame마다 한 번 반영 |
| `optimized` | batched + 외부 스토어(useSyncExternalStore 종목별 구독) + React.memo 행 + CSS 깜빡임 + 체결 링 버퍼(50건) |
| `visible` | optimized + Intersection Observer로 화면에 보이는 행만 갱신 (선택) |

공통: 숫자는 `tabular-nums`, `Intl.NumberFormat` 인스턴스 재사용

### 5.3 주문 안정성
- 호가창 옆 매수 버튼 → 주문 확인 패널 (실제 주문 API 호출 없음)
- 시세가 3초 이상 늦으면 주문 패널에 "가격 지연" 경고
- 확인 단계에서 최신가를 다시 보여줌
- 요청 중 버튼 비활성화 (중복 클릭 방지), 주문마다 고유 키 생성
- 주문은 자동 재시도하지 않는다 (응답 없음 → 상태 조회로 확인하는 구조만 표시)

### 5.4 감지
- 측정 패널: FPS, 초당 렌더 수, Long Task 개수/총 시간, 표시 지연 p50/p95, **주문 반응 시간 p50/p95**, 초당 수신 건수
- **주문 반응 시간** = 클릭 시각(T0) → 주문 확인 패널이 그려진 직후(T3)
  - T0: 자동 클릭은 "클릭 예정 시각", 수동 클릭은 `event.timeStamp`
  - T3: 패널 커밋 직후 `requestAnimationFrame` → `setTimeout(0)` 콜백 시각 (다음 paint 직후 근사)
  - 메인 스레드가 시세 처리로 바빠 클릭이 늦게 실행되는 대기 시간까지 포함된다
  - Event Timing API를 쓰지 않는 이유: 실제 사용자 입력(`isTrusted`)만 기록해서 자동 클릭 비교 측정에 쓸 수 없다. 수동 클릭 시에는 Event Timing 값을 참고용으로 함께 기록한다
  - INP와 정의가 다르므로 지표 이름은 `order`를 쓴다 (`inp` 금지)
  - 한계: 자동 클릭에는 실제 입력 처리 경로(터치 → 컴포지터 → 메인 스레드)가 빠져 실제 INP보다 약간 짧게 나온다
- `?autoclick=1`: 측정 중 500ms마다 매수 버튼 자동 클릭 → 패널 닫기 (모드 간 공정 비교)
- "30초 측정" 버튼 → `{ mode, source, rate, fps, fpsMin, renders, messages, longTasks, longTaskMs, p50, p95, orderP50, orderP95 }` JSON 복사
- 렌더 카운터는 행 컴포넌트 렌더 함수 안 전역 카운터 (Profiler는 프로덕션 빌드에서 동작 안 함)
- **Sentry**: 브라우저 에러와 릴리스 버전 기록
- 브라우저 지표(주문 반응 p95, 표시 지연 p95)를 `/api/vitals`로 전송 → Prometheus 지표로 노출

### 5.5 측정 조건
- `pnpm build && pnpm start`, Chrome 시크릿 창, **CPU 20x 쓰로틀링**, 탭은 앞에 띄워 둠
  - 4x에서는 이 기기(M 시리즈 Mac)에서 naive도 rate 2000까지 60fps라 모드 간 차이가 재현되지 않았다 (results.md 사전 탐색 1). 4x 결과는 "차이 없음" 참고값으로 함께 남긴다
  - DevTools에 기기 보정 프리셋(저사양/중급 휴대폰)이 있으면 그 배수를 기록해 근거로 쓴다
- 종목 30개, seed=42, rate 50(평소) / 200(장 초반) / 500(스트레스), 각 30초, 2~3회 중간값
- burst=1 시나리오 별도 측정

## 6. B. FE 서버 부하 (SSR)
### 6.1 SSR 종목 상세 페이지 (`/stocks/[code]`)
- 서버에서 렌더: 종목 정보, 초기 호가 10단, 최근 체결 50건, 관련 뉴스 20건
- 데이터는 `src/server/data/*.ts` 데이터 함수로만 가져온다

### 6.2 API 모킹
- `API_MOCK=1`이면 데이터 함수가 `fixtures/`의 고정 데이터를 반환하고 50ms 지연을 넣는다 (백엔드 응답 시간 흉내)
- 실제 백엔드·KIS는 호출하지 않는다

### 6.3 지표 노출
- `/api/metrics`: Prometheus 형식 (기본 프로세스 지표 + SSR 렌더 시간 히스토그램 + 요청 수 + `/api/vitals`로 받은 브라우저 지표)
- `docker-compose.monitoring.yml`: Prometheus + Grafana, 대시보드 JSON은 `monitoring/grafana/`에 저장
- 대시보드 패널: SSR 응답 p95, 초당 요청 수, 에러율, CPU·메모리, 이벤트 루프 지연, 브라우저 주문 반응 p95

### 6.4 k6
- `load/ssr-load.js`: ramping-arrival-rate로 초당 요청 10 → 50 → 100 → 200
- 기준: p95 < 500ms, 에러율 < 1%
- `load/ws-load.js`: Mock 서버 broadcast 모드에 가상 클라이언트 100 → 500 → 1000, 도착 지연 p95 < 100ms
- 결과는 `docs/results.md`에 기록

### 6.5 Pod 수 산정
- 로컬: Docker로 Next 서버 컨테이너 1개 한계 측정 → 컨테이너 2~3개(로드밸런서 뒤)로 처리량 증가 확인
- (제출 후) GKE: Pod 1개 한계 → HPA 설정 → 필요 Pod 수 = 예상 피크 요청 ÷ Pod당 한계 × 1.5

## 7. C. 실제 시세 연결
### 7.1 KIS 중계 서버 (`server/kis-relay.ts`)
- `.env.local`의 키로 접속키 발급 (`POST /oauth2/Approval`, body `{ grant_type, appkey, secretkey }`), 한 번 발급 후 재사용
- 모의 WebSocket `ws://ops.koreainvestment.com:31000` (실전 21000, `KIS_ENV`로 선택)
- 구독: `{ header: { approval_key, custtype: "P", tr_type: "1", "content-type": "utf-8" }, body: { input: { tr_id, tr_key } } }`, 해제는 `tr_type: "2"`
- 브라우저 쪽 구독 요청을 받아 KIS 구독/해제를 대신 수행
- `--record` 옵션: 원문을 수신 시각과 함께 `recordings/*.tsv`로 저장 (`.gitignore`)
- 키·접속키는 로그에 출력하지 않는다. 시세 조회만 사용 (주문·잔고 API 금지)

### 7.2 백그라운드 / 포그라운드
- 기준은 `document.visibilityState` (포커스 아님. 보이기만 하면 계속 갱신)
- hidden: 즉시 화면 갱신 중지 → 60초 지나면 종목 구독 해제 + 연결 종료
- visible: 즉시 "갱신 중" 표시 → 0~300ms 지터 후 재연결 + REST 현재가 조회로 화면 먼저 맞춤 → 첫 실시간 메시지 도착 시 표시 제거
- 재연결 실패 시 지수 백오프(0.5s → 최대 10s) + 지터
- 연결 상태 배지 (연결됨 / 갱신 중 / 재연결 중 / 끊김), 3초 이상 데이터 없으면 "지연"
- 측정: 복귀 → 최신 시세 표시까지 걸린 시간, 백그라운드 중 수신 메시지 수

### 7.3 확인 필요
- 모의 키의 접속키 발급 REST 도메인(실전 / 모의 중 어느 쪽인지)
- 한 연결에서 구독 가능한 종목 수 제한
- 필드 인덱스는 실데이터 캡처로 재검증 (예제 문서에 체결가·호가 내용이 바뀌어 있다는 지적이 있었음)

## 8. 보안
- KIS 키는 `.env.local`에만, `NEXT_PUBLIC_` 금지, 서버 코드에서만 사용
- Sentry DSN 외 비밀 값은 클라이언트에 두지 않는다
- 부하 테스트는 내가 운영하는 서버(Mock, Next, 중계)에만 한다. KIS 서버에 부하 테스트 금지

## 9. 수용 기준 (전체)
- [ ] A: rate 200·CPU 20x에서 optimized가 naive보다 FPS가 높고 주문 반응 p95(`orderP95`)가 낮다
- [ ] A: 시세 지연 시 주문 패널에 경고가 뜨고, 중복 클릭이 막힌다
- [ ] B: k6로 Next 서버 1개의 한계(기준을 지키는 최대 초당 요청 수)를 찾았다
- [ ] B: Grafana에서 SSR 응답 p95와 브라우저 주문 반응 p95를 볼 수 있다
- [ ] C: 실제 KIS 시세가 화면에 표시되고, 탭을 1분 이상 숨겼다 돌아오면 재연결 후 최신 시세로 맞춰진다
- [ ] 공통: 파서, 배칭 적용, 지표 계산, Mock 생성기, 재연결 상태 전이에 단위 테스트가 있다
- [ ] 공통: KIS 키가 클라이언트 번들과 Git 기록에 없다

## 10. 미결정 사항
- 종목명 매핑 데이터 (Mock은 가상 종목명 사용)
- 배포 데모 범위 (worker 소스만 배포, 배포 환경에는 KIS 키를 넣지 않음)
- GKE Pod 수 산정 시점 (제출 후)
