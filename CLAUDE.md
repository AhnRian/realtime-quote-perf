# CLAUDE.md

## 프로젝트
MTS 스타일의 실시간 시세·호가 화면을 만들고, 시세가 몰리는 상황(장 초반)에서 렌더링 성능을 **측정 → 개선 → 재측정**하는 프로젝트.

- 명세: `docs/spec.md`
- 작업 목록: `docs/tasks.md`
- 측정 결과: `docs/results.md`

## 작업 규칙
- 작업을 시작하기 전에 `docs/spec.md`와 `docs/tasks.md`를 읽는다.
- 한 번에 `docs/tasks.md`의 태스크 하나만 진행한다. 범위 밖 변경은 하지 않고 제안만 한다.
- 구현 전에 변경할 파일과 접근 방법을 짧게 설명하고 확인을 받는다.
- 태스크 완료 시:
  1. 수용 기준을 하나씩 확인한다.
  2. `pnpm typecheck && pnpm test`를 통과시킨다.
  3. `docs/tasks.md`의 체크박스를 체크한다.
  4. 무엇을 왜 바꿨는지 3~5줄로 요약한다.
- 스펙과 다르게 구현해야 하면 먼저 알리고, 합의되면 `docs/spec.md`도 함께 수정한다.
- `naive` 모드 코드는 비교 기준이므로 삭제하거나 개선하지 않는다.
- 설명할 때는 내가 면접에서 직접 설명할 수 있도록 "왜 이렇게 했는지"를 함께 알려준다.

## 기술 스택
Next.js (App Router) · TypeScript (strict) · Tailwind CSS · Vitest · ws · tsx
패키지 매니저: pnpm

## 명령어
- `pnpm dev` — Next.js 개발 서버
- `pnpm build && pnpm start` — 프로덕션 빌드 (성능 측정은 반드시 이걸로)
- `pnpm mock` — Mock 시세 서버 (기본 `ws://localhost:8787`)
- `pnpm relay` — KIS 중계 서버 (T10 이후)
- `pnpm test` / `pnpm typecheck` / `pnpm lint`

## 코드 컨벤션
- 시세 관련 순수 로직(파싱, 배칭 적용, 지표 계산)은 `src/lib`에 두고 UI와 분리하며, 단위 테스트를 작성한다.
- `any` 금지. 메시지와 도메인 타입은 `src/lib/types.ts`에 정의한다.
- 주석과 커밋 메시지는 한국어로 쓴다.

## 보안
- KIS 앱키·앱시크릿·계좌번호는 `.env.local`에만 둔다. 코드, 로그, 커밋, 클라이언트 번들에 절대 포함하지 않는다.
- 브라우저는 KIS에 직접 연결하지 않는다. 로컬 중계 서버만 KIS와 통신한다.
