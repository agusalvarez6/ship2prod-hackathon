# PreCall Implementation Plan

## What we are building

- App that researches a meeting before it happens.
- Point it at a meeting on your calendar. It pulls public info on the attendees. It writes you a briefing.
- Before the meeting, press a button. Talk to a voice AI. It answers questions about the briefing.

## The tools (one line each)

- **Vapi** - runs the voice AI phone calls.
- **TinyFish** - reads public web pages for us.
- **OpenAI / Anthropic** - writes the briefing from raw info.
- **Redis** - fast queue for research jobs.
- **InsForge / Postgres** - database.
- **Cosmo router + GraphQL** - single API the frontend talks to.
- **Chainguard** - secure container base images.
- **Next.js** - the frontend.

## Done

- [x] Monorepo (pnpm + TypeScript strict).
- [x] Lint, format, Vitest test runner.
- [x] `@ship2prod/schema` (domain types).
- [x] `@ship2prod/errors` (typed errors + retry).
- [x] `@ship2prod/integrations` (contracts only, stubs throw).
- [x] `@ship2prod/sdk` (PR #4, ready to merge).
- [x] DB schema + Sarah fixture.
- [x] Docker base + compose (Postgres, Redis, InsForge).
- [x] Six empty app stubs.

## Merge first

- [ ] **PR #4** - the SDK. One click. Blocks nothing heavy, but unblocks all frontend and webhook work.

## How this works

- Work is split into small **blocks**. Each block = one PR = one dev.
- Every block owns files no other block touches. No merge conflicts.
- Some blocks are **ready now**. Others wait for a block to land before they unlock.
- A dev picks any ready block, ships it, then picks another. Pull model.
- 8-10 devs can work at once on ready blocks.

## Ready now (no waiting)

Any of these can start immediately. No dependencies beyond what's already on main.

- [ ] **P1 - Graph shell.** Boots the GraphQL subgraph at port 4001. Files: `apps/graph/src/{index.ts, schema.graphql, context.ts}`, `apps/graph/Dockerfile`, `apps/graph/router/*`. Unblocks G1, G2, G3, A1, A2.
- [ ] **P2 - Web shell.** Next.js app boots, renders a placeholder at `/`. Files: `apps/web/{next.config.mjs, tailwind.config.ts, postcss.config.mjs}`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/lib/client.ts`. Unblocks F1, F2, F3, F4.
- [ ] **P3 - CI.** GitHub Action runs lint + typecheck + tests + docker build on every push. Files: `.github/workflows/ci.yml`. Standalone.
- [ ] **P4 - Compose wiring.** Adds Cosmo router + app services to `docker-compose.yml`. Standalone.
- [ ] **P5 - Env sweep.** Fills `.env.example` with every variable the apps reference. Standalone.
- [ ] **V1 - Webhook scaffold.** Hono on port 8787 with stub HMAC and idempotency middleware, returns 200. Files: `apps/vapi-webhook/**`. Unblocks V2, V3, V4.
- [ ] **W1 - Worker scaffold.** BLMOVE loop + stub pipeline. Files: `apps/worker/**`. Unblocks W2, W3, W4.
- [ ] **I1 - Real TinyFish.** HTTP client against the TinyFish API. Files: `packages/integrations/src/tinyfish.ts`. Unblocks W3.
- [ ] **I2 - Real LLM.** HTTP client against OpenAI or Anthropic. Files: `packages/integrations/src/llm.ts`. Unblocks W3.
- [ ] **I3 - Real GCal.** HTTP client against Google Calendar. Files: `packages/integrations/src/gcal.ts`. Unblocks G2, A1.
- [ ] **I4 - Real Notion.** HTTP client against Notion. Files: `packages/integrations/src/notion.ts`. Unblocks G2, A2.

That is **11 blocks available right now**. You can throw 11 devs at this phase and nobody collides.

## Unlocks after P1 (graph shell) lands

- [ ] **G1 - Voice resolvers.** `answerFromBriefing`, `saveCallTranscript`. Files: `apps/graph/src/resolvers/voice.ts`. Unblocks V4.
- [ ] **G2 - Meeting resolvers.** `listUpcomingMeetings`, `searchNotionContext`. Files: `apps/graph/src/resolvers/meeting.ts`. Also needs I3 and I4. Unblocks F1.
- [ ] **G3 - Briefing resolvers.** `createBriefingFromMeeting`, `getBriefing`, `getBriefingProgress`, `listBriefings`, `draftFollowUpEmail`. Files: `apps/graph/src/resolvers/briefing.ts`. Unblocks F2, F3.
- [ ] **A1 - Google OAuth callback.** Files: `apps/graph/src/auth/google.ts`. Also needs I3.
- [ ] **A2 - Notion OAuth callback.** Files: `apps/graph/src/auth/notion.ts`. Also needs I4.

## Unlocks after P2 (web shell) lands

- [ ] **F1 - Dashboard.** Lists upcoming meetings. Files: `apps/web/src/app/page.tsx`. Also needs G2.
- [ ] **F2 - Composer.** Pick a meeting, click generate. Files: `apps/web/src/app/meetings/[meetingId]/brief/page.tsx`. Also needs G3.
- [ ] **F3 - Viewer.** Reads the briefing, shows progress. Files: `apps/web/src/app/briefings/[briefingId]/page.tsx`. Also needs G3.
- [ ] **F4 - Call button.** Opens a Vapi session. Files: `apps/web/src/components/CallButton.tsx`. Also needs V5.

## Unlocks after W1 (worker scaffold) lands

- [ ] **W2 - Planner.** Turns a job into a list of research tasks. Files: `apps/worker/src/planner.ts`.
- [ ] **W3 - Pipeline.** Runs the tasks, hands text to the LLM, saves the briefing. Files: `apps/worker/src/pipeline.ts`. Also needs I1 + I2.
- [ ] **W4 - Persist.** Writes briefing + sources to Postgres. Files: `apps/worker/src/persist.ts`.

## Unlocks after V1 (webhook scaffold) lands

- [ ] **V2 - Real HMAC.** Verifies Vapi's signature. Files: `apps/vapi-webhook/src/middleware/hmac.ts`.
- [ ] **V3 - Real idempotency.** Drops duplicate events via Redis `SET NX`. Files: `apps/vapi-webhook/src/middleware/idem.ts`.
- [ ] **V4 - Tool handlers.** `answerFromBriefing`, `saveCallTranscript`. Files: `apps/vapi-webhook/src/tools.ts`, `apps/vapi-webhook/src/routes/webhook.ts`. Also needs G1.
- [ ] **V5 - Vapi assistant config.** Set up in the Vapi dashboard, not in the repo. Defines the tools and the system prompt. Can happen any time once V4 is deployed somewhere Vapi can reach.

## Polish (do last)

- [ ] **D1 - Demo seeds.** Three more realistic briefings + meetings in `infra/seed/seed/`. Makes the demo less lonely.
- [ ] **UI polish pass.** Typography, loading states, error messages. After F1-F4 land.

## Dependency map at a glance

```
READY NOW (11):
  P1  P2  P3  P4  P5   V1  W1   I1  I2  I3  I4

AFTER P1:
  G1          unblocks V4
  G2 (+I3+I4) unblocks F1
  G3          unblocks F2, F3
  A1 (+I3)
  A2 (+I4)

AFTER P2:
  F1 (+G2)
  F2 (+G3)
  F3 (+G3)
  F4 (+V5)

AFTER W1:
  W2
  W3 (+I1+I2)
  W4

AFTER V1:
  V2
  V3
  V4 (+G1)
  V5  (external Vapi dashboard)

POLISH:
  D1, UI polish
```

## How a dev picks their next block

1. Pull latest main.
2. Look at the "ready now" list. Pick any unchecked block whose dependencies are all checked.
3. Branch `feat/<block-id>` off main. Example: `feat/P1-graph-shell`.
4. Work only on that block's files.
5. Draft PR when green (`pnpm lint && pnpm typecheck && pnpm test --run`).
6. Mark the block checked when merged.
7. Pick the next available block.

## Rough time estimate

- Ready-now batch (11 blocks): 30-90 min each. With 8 devs: ~1 hour wall clock.
- Second wave (after P1, P2, V1, W1, I1-I4 land): 30-90 min each. With 8 devs: ~1 hour.
- Third wave (resolvers → frontend pages, integrations → worker pipeline): ~2 hours.
- Polish + integration test: ~1 hour.

Total wall clock with 8 devs: **~5 hours to a working demo**.

## Recommended first moves

1. Merge PR #4.
2. Spawn up to 8 agents in parallel on `P1, P2, P3, V1, W1, I1, I2, I3`. (Hold P4, P5, I4 for the second wave if you only have 8.)
3. As each lands, the next wave auto-unlocks.

## Safety

- Every block is one PR. If it breaks, revert it. Nothing else breaks.
- Nothing ships to prod. All local.
- No block depends on a secret you don't have yet. API keys can be added to `.env` as the real clients land.
