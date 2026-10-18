import * as Sentry from "@sentry/nextjs";

// 브라우저 에러 추적 (spec 5.4, A7). 앱이 상호작용 가능해지기 전에 실행된다.
// DSN은 브라우저에 공개되는 값이라 비밀이 아니다 (spec 8). 다른 값으로 바꾸려면 NEXT_PUBLIC_SENTRY_DSN.
const DEFAULT_DSN = "";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? DEFAULT_DSN,
  // 빌드 시 git 커밋 해시 (next.config.ts). 어느 버전에서 난 에러인지 추적
  release: process.env.NEXT_PUBLIC_APP_RELEASE,
  environment: process.env.NODE_ENV,
  // 렌더링 성능 측정에 섞이지 않도록 에러만 보낸다 (성능 추적·리플레이 끔)
  tracesSampleRate: 0,
});
