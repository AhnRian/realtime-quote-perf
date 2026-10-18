# Next 서버 컨테이너 (spec 6.5: 컨테이너 1개 한계 측정용)
# 빌드: docker build -t kis-mts-web .
# 실행: docker run -d --name web1 --cpus=1 --memory=1g -p 3100:3000 kis-mts-web
# 커스텀 서버(server/next-server.ts)를 쓰므로 standalone 출력 대신 전체 node_modules를 담는다.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    API_MOCK=1 \
    PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server/next-server.ts"]
