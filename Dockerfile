# Image Cloud Run cho apps/api (monorepo pnpm). Build: gcloud run deploy --source .
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@aisrm/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @aisrm/shared build && pnpm --filter @aisrm/api build \
 && pnpm --filter @aisrm/api deploy --prod --legacy /out

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /out ./
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
