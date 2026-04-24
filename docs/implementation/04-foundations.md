---
status: in_progress
branch: feat/foundations
started: 2026-04-24
---

# 04 — Foundations

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

**Wave 0 sealed 2026-04-24 by engineering-manager-01.** All five tracks landed; Wave 1 dispatch cleared.

### Wave 1 — partial (halted)

Halted 2026-04-24 per user scope clarification: mandate bounded to monorepo setup, not app services. W1-F and W1-G landed before halt; W1-H / W1-I / W1-J / W1-K were in flight and discarded uncommitted.

| Track | Owner | Commit | Notes |
|-------|-------|--------|-------|
| W1-F `@ship2prod/integrations` | swe-02-w1 | `2200071` | 4 client interfaces (LLM / TinyFish / Notion / GCal) + not-implemented factories; 12 tests |
| W1-G `@ship2prod/sdk` | swe-03-w1 | `1697d24` | PrecallClient with 9 methods; MSW happy-path test |
| W1-H `apps/graph` | swe-04-w1 | HALTED | uncommitted; discarded per user scope clarification |
| W1-I `apps/vapi-webhook` | swe-05-w1 | HALTED | uncommitted; discarded |
| W1-J `apps/worker` | swe-06 | HALTED | uncommitted; discarded |
| W1-K `apps/web` | swe-07 | HALTED | uncommitted; discarded |

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

Foundations branch delivers the complete monorepo:

- pnpm workspace + TS strict + lint + format (W0-A)
- Shared packages: `@ship2prod/schema`, `@ship2prod/errors`, `@ship2prod/integrations` (interfaces + not-implemented factories), `@ship2prod/sdk` (PrecallClient stub)
- Test harness: vitest + globalSetup + MSW + docker-compose.test.yml with Redis + Postgres
- SQL migration + Sarah/Ramp fixture briefing (UUID 11111111-2222-3333-4444-555555555555)
- Chainguard base image + healthcheck + docker-compose.yml

App services (`apps/graph`, `apps/vapi-webhook`, `apps/worker`, `apps/web`) are out of scope per user.

## Quality gates
_Populated as inspectors run._

## PR

- #1 — https://github.com/agusalvarez6/ship2prod-hackathon/pull/1 (draft, opened 2026-04-24)
- Wave 1 halted 2026-04-24. Awaiting team-lead + user ruling on whether to revert `2200071` + `1697d24` (the two Wave 1 package commits that landed before stop) or keep them.
