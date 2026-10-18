import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/** Sentry 릴리스 버전: 빌드 시점의 git 커밋 해시 (git이 없으면 dev) */
function gitRelease(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_RELEASE: `kis-mts@${gitRelease()}`,
  },
};

export default nextConfig;
