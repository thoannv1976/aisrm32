# Image API (monorepo pnpm). Dùng cho cả bản Online (Cloud Run: gcloud run deploy --source .) và bản Local (Docker Compose).
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@aisrm/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
# dist: máy chủ API; dist-cli: công cụ khởi tạo bản Local (init / demo / status)
RUN pnpm --filter @aisrm/shared build && pnpm --filter @aisrm/api build \
 && cd apps/api && npx tsc -p tsconfig.cli.json && cp -r scripts/data dist-cli/scripts/ && cd /app \
 && pnpm --filter @aisrm/api deploy --prod --legacy /out

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /out ./
RUN mkdir -p /data/files && chown -R node:node /data
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
