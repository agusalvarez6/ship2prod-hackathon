# syntax=docker/dockerfile:1.7

FROM cgr.dev/chainguard/node:latest-dev AS builder

USER root
WORKDIR /repo

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @ship2prod/graph build

RUN cp apps/graph/src/schema.graphql apps/graph/dist/schema.graphql

RUN pnpm --filter @ship2prod/graph --prod deploy --legacy /out


FROM cgr.dev/chainguard/node:latest AS runtime

WORKDIR /app

COPY --from=builder --chown=65532:65532 /out ./
COPY --chown=65532:65532 infra/seed/briefings.seed.json /infra/seed/briefings.seed.json
COPY --chown=65532:65532 docker/healthcheck.js ./healthcheck.js

USER 65532

ENV NODE_ENV=production
ENV PORT=4001

EXPOSE 4001

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD ["node", "healthcheck.js"]

CMD ["node", "dist/index.js"]
