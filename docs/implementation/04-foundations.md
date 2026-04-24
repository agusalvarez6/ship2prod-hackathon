---
status: in_progress
branch: feat/foundations
started: 2026-04-24
---

# 04 — Foundations

## Mandate
do the Foundations so that we can start developing in parallel

## Tracks
_Populated by engineering-manager-01 as SWEs complete their work._

## Wave 0 (in flight)

Four tracks, disjoint file ownership, dispatched 2026-04-24 T+0.

| Track | Owner | Files | Status |
|-------|-------|-------|--------|
| W0-A repo scaffolding | swe-01 | package.json, pnpm-workspace.yaml, tsconfig.base.json, tsconfig.json, eslint config, prettier config, .nvmrc, .gitignore, .editorconfig, README.md skeleton, vitest.config.ts stub | pending |
| W0-B packages/schema | swe-02 | packages/schema/** — ids, briefing, source, jobs, redis, insforge row types + Zod schemas | pending, blocked by W0-A |
| W0-C packages/errors | swe-03 | packages/errors/** — AppError discriminated union + Result<T,E> + ok/err + withRetry + isTransient (per .claude/skills/errors/SKILL.md) | pending, blocked by W0-A |
| W0-D SQL + seeds | swe-04 | infra/seed/migrations/001_init.sql + seed SQL + briefings.seed.json fixture (UUID 11111111-2222-3333-4444-555555555555) | pending, blocked by W0-A |

**Decisions bound into prompts:**
- Error taxonomy: `.claude/skills/errors/SKILL.md` is authoritative; the master §4 TransientError/PermanentError/UserInputError shape is superseded.
- Simplification banners in specs 01/02/03 win over body-text residue. Master §4 is canonical.

**Planned waves:**
- Wave 1 (blocked by Wave 0): `packages/integrations`, subgraph skeleton + operations + Cosmo router config, vapi-webhook skeleton, worker skeleton, Next.js scaffold.
- Wave 2 (blocked by Wave 1): Chainguard base Dockerfile + healthcheck, docker-compose.yml with test profile, .env.example, CI workflow, SKILL.md/README.md submission stubs.

## Quality gates
_Populated as inspectors run._

## PR
- #1 — https://github.com/agusalvarez6/ship2prod-hackathon/pull/1 (draft, opened 2026-04-24)
