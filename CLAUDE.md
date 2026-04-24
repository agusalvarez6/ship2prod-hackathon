# s2p-hackathon — CLAUDE.md

Voice-first meeting-prep agent (PreCall) built on Vapi + TinyFish + Redis + InsForge + WunderGraph + Chainguard. Full concept in `IDEA.md`. Sponsor notes in `SPONSORS.md`, judging criteria in `CRITERIA.md`.

## Critical Path

Everything you build should serve one of three flows:

1. **Briefing generation**: contact in, structured briefing out (TinyFish research → InsForge storage).
2. **Voice Q&A**: Vapi call answers questions against the briefing.
3. **Meeting prep**: user sees the briefing before a meeting.

Anything outside this path is scope creep unless the Issue explicitly scopes it in. See `spec-inspector-parsimonious`.

## Artifact Layout

| Artifact | Location |
|----------|----------|
| Issue (statement of work) | `docs/issues/NN-title.md` |
| Spec (implementation plan) | `docs/specs/NN-title.md` |
| Implementation log | `docs/implementation/NN-title.md` |

Zero-padded `NN` matches across the three. Cross-link with relative markdown (`../issues/04-briefing-api.md`).

## Workflow

Use `/emperor` for any non-trivial task. The Emperor runs the four-phase cycle:

1. **Investigation** → produces `docs/issues/NN-title.md`
2. **Specification** → produces `docs/specs/NN-title.md`
3. **Implementation** → produces a git feature branch + draft PR + `docs/implementation/NN-title.md`
4. **Review** → quality gates + approval

For small direct tasks, invoke the relevant agent directly (`common-principal-bug-fixer`, `common-principal-swe`, etc.).

## Agent Spawning: Single Most Important Rule

**Every `Agent` / `SpawnTeammate` call MUST include `mode: "bypassPermissions"`.**

```typescript
Agent({
  description: "...",
  subagent_type: "common-principal-swe",
  prompt: "...",
  mode: "bypassPermissions"    // REQUIRED
})
```

Why: this repo's project-level settings have `defaultMode: "bypassPermissions"` for the main session, but that does NOT propagate to subagents by default. Spawned agents without the flag hit permission denials on the first `Write` or `Bash` call against `.claude/`, `/tmp/`, or any project path. The agent then stalls and asks the user to approve — exactly what full-auto is supposed to prevent.

This rule applies to:
- Direct `Agent` tool calls from the main session.
- `SpawnTeammate` calls (e.g., in the `emperor` and `good-orchestration` skills).
- Agent spawns in skills: `address-review`, `cron`, `good-orchestration`, `emperor`, `review-pr`.
- Agent spawns documented inside agents: `common-principal-engineering-manager`, `issue-principal-writer`.

If a spawned agent reports "Write denied" or "Bash denied" on a normal path, the fix is in the spawn flag, not in your settings.

## Stack

- **Vapi** — voice platform. Webhooks signed with HMAC-SHA256, 5-minute replay window.
- **TinyFish** — web extraction for public sources (company sites, LinkedIn, news, filings). Use the `use-tinyfish` skill.
- **Redis** — job queue and idempotency cache. `briefing:jobs` list, `idem:*` keys with TTL.
- **InsForge** — storage for briefings, contacts, research jobs.
- **WunderGraph** — operation layer between services.
- **Chainguard** — distroless Docker base images. `common-inspector-smoke` validates the image builds.

## Domain Vocabulary

Use consistently across specs, endpoints, and schemas:

- **briefing** — the output document for a meeting
- **research job** — async task to gather sources for a briefing
- **source** — a single piece of research (LinkedIn profile, company site, news article, filing)
- **contact** — the person the meeting is with
- **company** — the organization the contact belongs to

## Final Roster

**Agents** (`.claude/agents/`):

- Principals: `common-principal-clerk`, `common-principal-scout`, `common-principal-architecture`, `common-principal-engineering-manager`, `common-principal-swe`, `common-principal-bug-fixer`
- Common inspectors: `common-inspector-completion-review`, `common-inspector-smoke`
- Issue lifecycle: `issue-principal-writer`, `issue-inspector-clarity`, `issue-inspector-risk`
- Spec lifecycle: `spec-principal-writer`, `spec-inspector-formatting`, `spec-inspector-naming`, `spec-inspector-parsimonious`
- Dev inspectors: `dev-inspector-api`, `dev-inspector-tests`

**Skills** (`.claude/skills/`):

- Workflow: `emperor`, `good-orchestration`, `cron`
- Authoring: `spec`, `api`, `errors`, `tests`, `audit-tests`
- VCS and review: `good-vcs`, `review-pr`, `address-review`
- Style: `good-prose`, `good-docs`, `good-instructions`, `good-prompts`, `good-design`, `good-debugging`
- Tools: `use-tinyfish`

## Commands

```bash
# Testing
pnpm test                     # all tests
pnpm test path/to/file.test.ts  # one test file
pnpm test -- --run            # Vitest, no watch mode

# Lint + typecheck
pnpm lint
pnpm typecheck

# Docker
docker build -t s2p-api .
docker compose -f docker-compose.test.yml up -d

# Git + PR (see good-vcs)
git checkout -b feat/<issue-slug>
git push -u origin feat/<issue-slug>
gh pr create --draft --body-file /tmp/pr_body.md
gh pr ready [N]
```

## Style

Follow `good-prose` for any text you write (PRs, Issues, Specs, implementation logs). Short declarative sentences. No em dashes. No "it's not X, it's Y" reversals. No filler transitions.

Tests: see `tests`. Integration over unit. Real Redis, stub only third-party APIs. No `.skip`, no `.todo`.

Errors: see `errors`. Classify transient / permanent / user-input. Retry transient with backoff + jitter. Fail fast on permanent. Webhook endpoints return 200 on idempotent replay.
