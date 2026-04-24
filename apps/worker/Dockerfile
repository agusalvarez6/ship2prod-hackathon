FROM cgr.dev/chainguard/node:latest-dev AS build

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm -F @ship2prod/worker typecheck

FROM cgr.dev/chainguard/node:latest

WORKDIR /app

COPY --from=build /app /app

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "/app/apps/worker/healthcheck.js"]

CMD ["/app/apps/worker/src/index.ts"]
