# Test harness

Shared Vitest + Redis + Postgres + MSW setup for the whole repo.

## Layout

- `vitest.config.ts` — root config. Includes `**/*.test.ts` and `**/tests/**/*.test.ts`.
- `test/globalSetup.ts` — boots `docker-compose.test.yml` once per run, waits for healthchecks, tears down on exit.
- `test/setup.ts` — per-file: starts the MSW server with `onUnhandledRequest: "error"`.
- `test/msw/server.ts` — default handlers stubbing Vapi, TinyFish, Anthropic.
- `test/env.ts` — `REDIS_TEST_URL` (default `redis://localhost:6380`) and `POSTGRES_TEST_URL` (default `postgres://postgres:postgres@localhost:5433/postgres`).
- `test/harness.test.ts` — proves Redis round-trip and MSW stubbing work.
- `docker-compose.test.yml` — `redis:7-alpine` on `:6380`, `postgres:16-alpine` on `:5433`.

## Host prerequisites

- Node (version pinned in `.nvmrc`).
- `pnpm` (version pinned in root `package.json#packageManager`).
- Docker with Compose v2 on the host running `pnpm test:run`. The global setup invokes `docker compose` to bring up Redis and Postgres.

## Commands

```bash
pnpm test              # watch mode; brings the stack up and keeps it up
pnpm test:run          # single run; brings the stack up and tears it down

pnpm test:docker:up    # bring Redis + Postgres up manually
pnpm test:docker:down  # tear Redis + Postgres down
```

## Environment flags

- `SKIP_DOCKER=1` — skip the compose boot entirely. Tests that hit Redis will fail; use for lint/typecheck-only runs.
- `KEEP_DOCKER=1` — leave containers up after the run finishes. Useful when iterating locally.
