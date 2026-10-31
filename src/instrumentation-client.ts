import * as Sentry from "@sentry/nextjs";

// 브라우저 에러 추적 (spec 5.4, A7). 앱이 상호작용 가능해지기 전에 실행된다.
// DSN은 .env.local의 NEXT_PUBLIC_SENTRY_DSN으로만 받는다.
// 브라우저에 공개되는 값이라 비밀은 아니지만, 공개 저장소에 두면 누구나 이 프로젝트로 이벤트를 보낼 수 있어 코드에서 뺐다.
// 값이 없으면 Sentry는 아무것도 보내지 않는다.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // 빌드 시 git 커밋 해시 (next.config.ts). 어느 버전에서 난 에러인지 추적
  release: process.env.NEXT_PUBLIC_APP_RELEASE,
  environment: process.env.NODE_ENV,
  // 렌더링 성능 측정에 섞이지 않도록 에러만 보낸다 (성능 추적·리플레이 끔)
  tracesSampleRate: 0,
});
