---
status: in_progress
branch: feat/foundations
started: 2026-04-24
---

# 04 — Foundations

> **Scope clarification (2026-04-24):** foundations = monorepo setup only. All Wave 1 `feat(...)` commits reverted in `af56112`. App services (`apps/graph`, `apps/vapi-webhook`, `apps/worker`, `apps/web`) and the `@ship2prod/integrations` + `@ship2prod/sdk` packages are out of scope.

## Mandate
do the Foundations so that we can start developing in parallel

## Tracks

### Wave 0 — completed

Dispatched 2026-04-24 T+0. Disjoint file ownership across five tracks.

| Track | Owner | Commit(s) | Notes |
|-------|-------|-----------|-------|
| W0-A repo scaffolding | swe-01 | `9fc1285`, `babf11c` | pnpm workspace, tsconfig, eslint, prettier (singleQuote / no-semi / printWidth-100), no-console rule |
| W0-B `@ship2prod/schema` | swe-02 | `d816067` | branded ids + briefing/source/jobs/redis/insforge types + Zod schemas; 53 tests |
| W0-C `@ship2prod/errors` | swe-03 | `7f47c1b`, `d8efe42`, `f284e61` | single-shape AppError union + Result<T,E> + withRetry + isTransient per architect v2 §6.2 + .claude/skills/errors/SKILL.md; follow-up extends upstream.service for notion/gcal/openai; 16 tests |
| W0-D test harness | swe-04 | `c4581b9` | vitest + globalSetup + MSW + docker-compose.test.yml; 87/88 tests (1 docker-gated) |
| W0-E SQL + seeds + Docker + compose | swe-05 | `b7239c1` | infra/seed/* (InsForge schema + fixture briefing UUID 11111111-2222-3333-4444-555555555555), docker/* (Chainguard base), docker-compose.yml |

**Wave 0 sealed 2026-04-24 by engineering-manager-01.** All five tracks landed.

### Wave 1 — reverted

All Wave 1 `feat(...)` commits reverted in a single combined revert after user scope clarification.

| Reverted SHA | Subject |
|--------------|---------|
| `02f1c85` | feat(vapi-webhook): scaffold Hono webhook with stub middleware |
| `d26eff4` | feat(web): scaffold Next.js app with fixture briefing viewer |
| `92ece0c` | feat(graph): scaffold Hono + yoga subgraph with getBriefing fixture |
| `cc15ef8` | feat(worker): scaffold BLMOVE loop + pipeline stubs |
| `1697d24` | feat(sdk): scaffold @ship2prod/sdk with PrecallClient |
| `2200071` | feat(integrations): scaffold client interfaces and factories |

Revert commit: `af56112` revert: Wave 1 out-of-scope packages and apps.

### Wave 2 — cancelled

User directive bounded scope to monorepo setup; CI + submission stubs deferred.

## Decisions

Captured during Wave 0:

- Error taxonomy: `.claude/skills/errors/SKILL.md` is authoritative (single-shape AppError union + Result). Architect v2 §6.2 is the binding reference. Master §4 TransientError/PermanentError/UserInputError classes are NOT shipped.
- `AppError.upstream.service` literal: `vapi | tinyfish | insforge | wundergraph | notion | gcal | openai` (NOT `redis` — Redis errors are `internal` per the skill).
- Package scope: `@ship2prod/*`. Architect v2 will be revised from `@precall/*`.
- `research_jobs` Postgres table dropped per simplification banner; `research_jobs:pending` and `:processing` Redis LISTs kept (master §4 Redis inventory is canonical).
- Subgraph runs as Hono wrapping graphql-yoga (not bare yoga) per architect v2 + spec 03 §6.
- Simplification banners in specs 01/02/03 supersede body-text residue. Master §4 is canonical.

## Outcome

Foundations branch delivers the monorepo setup:

- pnpm workspace + TS strict + lint + format (W0-A)
- Shared packages: `@ship2prod/schema`, `@ship2prod/errors`
- Test harness: vitest + globalSetup + MSW + docker-compose.test.yml with Redis + Postgres
- SQL migration + Sarah/Ramp fixture briefing (UUID 11111111-2222-3333-4444-555555555555)
- Chainguard base image + healthcheck + docker-compose.yml

## Quality gates

Post-revert verification at HEAD `af56112` (2026-04-24):

- `pnpm install` — ok, lockfile clean, no delta to commit
- `pnpm lint` — green
- `pnpm typecheck` — green

## PR

- #1 — https://github.com/agusalvarez6/ship2prod-hackathon/pull/1 (draft, opened 2026-04-24)
