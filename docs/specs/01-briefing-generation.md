**Created At**: 2026-04-24
**Author**: spec-principal-writer-01
**Approved By**: [leave blank]

> **Preamble**. Slice owner: Dev B. Depends on Phase 0 (see master §8.2). Does not depend on Dev C or Dev D.
>
> **Cross-references**: [../../IDEA.md](../../IDEA.md) · [../../CLAUDE.md](../../CLAUDE.md) · [00-master.md](./00-master.md) (cross-cutting architecture, data model, Redis inventory, Phase 0 contracts).
>
> **Simplification pass (2026-04-24)** — authoritative DDL + Redis inventory live in [00-master.md](./00-master.md). Any reference below to the following concepts is superseded:
>
> - **`research_jobs` table is removed.** State folds onto `briefings`: `research_started_at`, `research_finished_at`, `research_error` (JSONB). `INSERT research_jobs (status='queued')` becomes a no-op — only `INSERT briefings (status='pending')`. `UPDATE research_jobs SET status='running'` becomes `UPDATE briefings SET status='researching', research_started_at=now()`. `UPDATE research_jobs SET status='done', finished_at=now()` folds into the same transaction that writes `sections + summary_60s + sources_count + status='ready' + research_finished_at=now()`.
> - **`contacts` and `companies` tables are removed.** `briefings.contact_id` / `briefings.company_id` FKs are replaced by denormalized columns: `briefings.contact_name`, `contact_email`, `contact_role`, `company_name`, `company_domain`, `company_summary`. Subgraph writes these on initial INSERT (inferred from meeting attendees). Worker refines `company_summary` during synthesis.
> - **`research_jobs:dlq` is removed.** A permanent failure just sets `briefings.status='failed'` + `briefings.research_error`. No DLQ list.
> - **`sources.tinyfish_tool` and `sources.tinyfish_run_id` columns are removed.** That metadata folds into `sources.raw` JSONB.
> - **Watchdog requeue logic is removed.** Concurrency is controlled exclusively via the Redis claim token `job:{briefingId}:claim` (SETNX + 600s TTL). A crashed worker means the claim expires, the job is retried manually by requeuing.
> - **Packages consolidation**: `packages/{llm,tinyfish,notion,gcal}` fold into `packages/integrations/src/{llm,tinyfish,notion,gcal}.ts`.

---

## 1. Problem

**Casual**: When a user clicks "Brief me" on a meeting, they want a tactical, source-backed briefing within about a minute — showing what the company does, what is in their Notion notes, recent public context, and tactical conversation angles. Today none of this is assembled anywhere.

**Formal**:

1. No async pipeline picks up a meeting + selected Notion pages and produces a structured briefing.
2. No worker isolates untrusted web extractions (TinyFish) from user credentials.
3. No LLM synthesis step turns heterogeneous research into the 11-section briefing defined in [IDEA.md](../../IDEA.md) §"What the generated briefing should look like".
4. No progress surface shows the user what the agent is doing in real time.
5. No persistence captures the briefing, its sources, and its research job for post-hoc inspection.

**Out of Scope**:

- **User edits to briefings**: one-shot artifact. Regenerate produces a new briefing row.
- **Background briefings**: no cron, no auto-generation. User clicks "Brief me".
- **LinkedIn person lookup**: TinyFish cannot solve LinkedIn CAPTCHAs reliably. Person facts come from company team/about pages.
- **Multi-briefing batch**: one briefing at a time. Head-of-line blocking accepted per master §9 Q11.
- **Briefing templates or tone selection**: one 11-section format, always.
- **TinyFish Agent runs**: Fetch + Search only for MVP. Agent runs deferred to post-MVP (cost + complexity).

## 2. Solution

The main parts:

1. **Trigger**: `createBriefingFromMeeting` GraphQL mutation creates `briefings` + `research_jobs` rows and `LPUSH`es `research_jobs:pending`.
2. **Research Worker** (`apps/worker`): `BLMOVE`s jobs, runs the pipeline, writes final rows.
3. **Research Planner**: meeting facts → ordered `ResearchTask[]` (Notion reads, web fetches, web searches).
4. **TinyFish Client**: wrapper over Fetch + Search APIs with retry and timeout.
5. **Source Normalizer**: TinyFish output → `Source` rows with block-string validation.
6. **`synthesizeBriefing`**: structured JSON output matching `BriefingSections`.
7. **Progress bus**: Redis Stream `job:{briefingId}:progress`, `XADD` after each step, replayable via `XREAD BLOCK id=0`.

### Trade-off: TinyFish extraction strategy

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| Agent runs per source | Structured JSON per target | ~19 credits each, 2-concurrent cap, captcha risk | Rejected for MVP |
| Fetch batch of up to 10 URLs | ~2 s for whole batch, cheap | Returns markdown, not structured | **Chosen for MVP** |

MVP is one Fetch batch + one Search, no Agent runs.

## 3. Architecture

```mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant CR as Cosmo Router
    participant SG as Subgraph
    participant IF as InsForge
    participant R as Redis
    participant W as Research Worker
    participant N as Notion API
    participant TF as TinyFish
    participant L as LLM

    FE->>CR: createBriefingFromMeeting
    CR->>SG: resolve
    SG->>R: SETNX idem:briefings:create:{userId}:{meetingId} EX 3600
    SG->>IF: INSERT briefings (pending) + research_jobs (queued)
    SG->>R: LPUSH research_jobs:pending {ResearchJobPayload}
    SG-->>FE: { briefingId, jobId, deduped: false }

    W->>R: BLMOVE research_jobs:pending research_jobs:processing RIGHT LEFT 5
    W->>R: SETNX job:{briefingId}:claim {workerId} EX 600
    W->>IF: UPDATE research_jobs SET status='running', started_at=now()
    W->>R: XADD progress * step "searching_notion" pct 10

    par Notion read (selected pages)
        W->>N: GET /pages/{id} for each id
        N-->>W: page content
    and TinyFish batch
        W->>R: XADD progress * step "researching_company" pct 30
        W->>TF: POST fetch { urls[], format: "markdown" }
        TF-->>W: markdown per URL
        W->>R: XADD progress * step "reading_pages" pct 50
    end

    W->>R: XADD progress * step "synthesizing" pct 70
    W->>L: synthesizeBriefing(notion, sources, meeting)
    L-->>W: BriefingSections JSON
    W->>IF: UPDATE briefings SET sections, summary_60s, sources_count, status='ready' (single txn)
    W->>IF: INSERT sources (N rows; failed statuses kept)
    W->>IF: UPDATE research_jobs SET status='done', finished_at=now()
    W->>R: XADD progress * step "ready" pct 100
    W->>R: LREM research_jobs:processing 1 <payload>
```

Owned services:

- **Subgraph** (`apps/graph`) — owns `createBriefingFromMeeting` resolver.
- **Research Worker** (`apps/worker`) — owns the pipeline, Chainguard distroless.

## 4. Components

+++ #### `createBriefingFromMeeting` resolver

`apps/graph/src/resolvers/briefing.ts` (PR #6).

```typescript
interface CreateBriefingInput {
  userId: UserId;
  meetingId: MeetingId;
  notionPageIds: NotionPageId[];
}
interface CreateBriefingResult {
  briefingId: BriefingId;
  jobId: JobId;
  deduped: boolean;
}

function createBriefingFromMeeting(
  input: CreateBriefingInput,
  ctx: GraphContext
): Promise<CreateBriefingResult>;
```

Behavior:

1. `SETNX idem:briefings:create:{userId}:{meetingId} EX 3600`. If present, return existing `briefingId` with `deduped: true`.
2. Infer `company` + `contact` from `meetings.attendees` (email domain → domain; display name → contact name). Upsert into `companies` + `contacts`.
3. `INSERT briefings` with `status='pending'`, `contact_id`, `company_id`, `meeting_id`, nulls elsewhere.
4. `INSERT research_jobs` with `status='queued'`, `briefing_id=<new>`.
5. `LPUSH research_jobs:pending` with `ResearchJobPayload` JSON.
6. Return `{ briefingId, jobId, deduped: false }`.

+++

+++ #### Research Worker entry (`apps/worker/src/index.ts`, PR #1)

```typescript
interface WorkerLoop {
  run(): Promise<void>;
  shutdown(): Promise<void>;
}
```

BLMOVE loop:

```typescript
while (!shuttingDown) {
  const raw = await redis.blMove(
    REDIS_KEYS.jobs.pending,
    REDIS_KEYS.jobs.processing,
    "RIGHT",
    "LEFT",
    5
  );
  if (!raw) continue;
  const job = JSON.parse(raw) as ResearchJobPayload;
  try {
    await runPipeline(job, ctx);
    await redis.lRem(REDIS_KEYS.jobs.processing, 1, raw);
  } catch (err) {
    if (isTransient(err)) {
      await redis.lMove(
        REDIS_KEYS.jobs.processing,
        REDIS_KEYS.jobs.pending,
        "LEFT",
        "RIGHT"
      );
    } else {
      await redis.lMove(
        REDIS_KEYS.jobs.processing,
        REDIS_KEYS.jobs.dlq,
        "LEFT",
        "RIGHT"
      );
      await markBriefingFailed(job, err, ctx);
    }
  }
}
```

+++

+++ #### `runPipeline` (`apps/worker/src/pipeline.ts`, PR #5)

```typescript
interface PipelineContext {
  redis: RedisClientType;
  insforge: InsForgeClient;
  notion: NotionClient;
  tinyfish: TinyFishClient;
  llm: LLMClient;
  workerId: string;
}

interface Pipeline {
  runPipeline(job: ResearchJobPayload, ctx: PipelineContext): Promise<void>;
}
```

Steps (each emits `emitProgress`):

1. `claim(job)` — `SETNX job:{briefingId}:claim {workerId} EX 600`.
2. `markRunning(job)` — `UPDATE research_jobs SET status='running', started_at=now()`.
3. `plan(meeting)` → `ResearchTask[]` via `ResearchPlanner`.
4. `parallel(notionRead + tinyfishFetch)`.
5. `normalize(results)` → `Source[]` with `status` enum.
6. `synthesizeBriefing(input)` → `BriefingSections`.
7. `persistBriefing(briefing, sources)` — single transaction.
8. `markDone(job)` + final `XADD` + `LREM processing`.

+++

+++ #### `ResearchPlanner` (`apps/worker/src/planner.ts`, PR #1)

```typescript
type ResearchTask =
  | { type: "notion_page"; pageId: NotionPageId }
  | { type: "web_fetch"; url: string; kind: SourceKind }
  | { type: "web_search"; query: string; purpose: "news" | "person" };

interface ResearchPlanInput {
  meeting: MeetingRow;
  contact: ContactRow | null;
  company: CompanyRow | null;
  notionPageIds: NotionPageId[];
}

interface ResearchPlanner {
  plan(input: ResearchPlanInput): ResearchTask[];
}
```

Default plan (MVP):

1. One `notion_page` task per selected page.
2. One `web_fetch` batch with `urls = [company.com, company.com/about, company.com/product, company.com/pricing, company.com/blog]`. Per-URL 200/404 tolerance is handled by TinyFish's per-URL `error` field; failed URLs → `sources.status='dead'`.
3. One `web_search` with `query="${companyName} news"` scoped to last 90 days.

+++

+++ #### `TinyFishClient` (`apps/worker/src/tinyfish/client.ts`, PR #2)

```typescript
interface TinyFishFetchResult {
  url: string;
  final_url: string;
  title?: string;
  description?: string;
  text?: string;
  latency_ms: number;
  error?: string;
}

interface TinyFishSearchResult {
  position: number;
  site_name: string;
  title: string;
  url: string;
  snippet: string;
}

interface TinyFishClient {
  fetch(input: { urls: string[]; format: "markdown" | "html" }): Promise<TinyFishFetchResult[]>;
  search(input: { query: string; location?: string; language?: string }): Promise<TinyFishSearchResult[]>;
}
```

Config:

- Auth: `X-API-Key: ${process.env.TINYFISH_API_KEY}`.
- Timeout: 120 s per call.
- Retry: 429 and 5xx with exponential backoff + jitter (1 s, 2 s, 4 s, max 3 tries).

+++

+++ #### Source Normalizer (`apps/worker/src/tinyfish/normalizer.ts`, PR #3)

```typescript
interface NormalizerInput {
  briefingId: BriefingId;
  webFetchResults: TinyFishFetchResult[];
  webSearchResults: TinyFishSearchResult[];
  notionPages: NotionPageRead[];
}

interface Normalizer {
  normalize(input: NormalizerInput): Source[];
}
```

Block-string validation — **invariant** per scout-02 finding:

```typescript
const BLOCK_STRINGS = ["captcha", "blocked", "access denied", "cloudflare ray", "are you a human"];
function isBlocked(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCK_STRINGS.some((s) => lower.includes(s));
}
```

Source kinds (match `sources.kind` CHECK constraint in master §4 DDL):

```typescript
type SourceKind =
  | "notion_page"
  | "company_site"
  | "product_page"
  | "pricing_page"
  | "blog_post"
  | "news"
  | "linkedin"
  | "filing"
  | "other";
```

Rank ordering used by `synthesizeBriefing`:
`notion_page > company_site > product_page > pricing_page > blog_post > news > linkedin > filing > other`.

+++

+++ #### `synthesizeBriefing` (`apps/worker/src/llm/synthesize.ts`, PR #4)

```typescript
interface SynthesizerInput {
  meeting: MeetingRow;
  contact: ContactRow | null;
  company: CompanyRow | null;
  notionContext: NotionPageRead[];
  sources: Source[];
}

function synthesizeBriefing(input: SynthesizerInput, ctx: { llm: LLMClient }): Promise<BriefingSections>;
```

Model: `gpt-4o` via `OPENAI_API_KEY`. `response_format: { type: "json_object" }`. Temperature 0.3. Max tokens 2000.

System prompt lives at `apps/worker/src/llm/prompts/synthesize.md` (Phase 0 artifact).

`BriefingSections` shape is the canonical one from master §4 (`packages/schema/src/briefing.ts`). Key rule: `questionsToAsk` is a tuple of exactly 5; `citedSources` references `Source.id` values from the input.

+++

+++ #### `persistBriefing` (`apps/worker/src/persist.ts`, PR #5)

```typescript
interface PersistBriefingInput {
  briefingId: BriefingId;
  sections: BriefingSections;
  sources: Source[];
}

function persistBriefing(input: PersistBriefingInput, ctx: PipelineContext): Promise<void>;
```

Invariant: the `UPDATE briefings` and `INSERT sources` execute in a single transaction. `briefings.status` never reads as `'ready'` while `sections` is null.

```sql
BEGIN;
UPDATE briefings
  SET sections = $1,
      summary_60s = $2,
      sources_count = $3,
      status = 'ready',
      updated_at = now()
  WHERE id = $4;
INSERT INTO sources (briefing_id, kind, url, ..., status) VALUES (...) /* per source */;
COMMIT;
```

+++

+++ #### `emitProgress` (`apps/worker/src/progress.ts`, PR #5)

```typescript
function emitProgress(
  briefingId: BriefingId,
  event: ProgressEvent,
  ctx: { redis: RedisClientType }
): Promise<void>;
```

Emission:

```typescript
await redis.xAdd(
  `job:${briefingId}:progress`,
  "*",
  { step: event.step, pct: String(event.pct), detail: event.detail ?? "", at: String(event.at) },
  { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 100 } }
);
await redis.expire(`job:${briefingId}:progress`, 3600);
```

`ProgressEvent`, `ProgressStep`, `ProgressSnapshot` types are canonical in `packages/schema/src/jobs.ts` (master §4, Phase 0 artifact 4).

+++

## 5. Data Flow

1. **Enqueue** — `SETNX idem:briefings:create:{userId}:{meetingId} EX 3600` → `INSERT briefings` + `INSERT research_jobs` → `LPUSH research_jobs:pending`.
2. **Dequeue** — Worker `BLMOVE research_jobs:pending research_jobs:processing RIGHT LEFT 5` → `SETNX job:{briefingId}:claim {workerId} EX 600` → `UPDATE research_jobs SET status='running'`.
3. **Progress** — `XADD job:{briefingId}:progress * step X pct Y MAXLEN ~ 100` after every stage. `XREAD BLOCK id=0` by frontend via Subgraph.
4. **Extract** — Notion `readPage` (cached 1 h) and TinyFish `fetch` batch (cached 24 h) run in parallel.
5. **Normalize** — `Source[]` with `status` enum. Failed extractions persist as rows, not exceptions.
6. **Synthesize** — single LLM call returning `BriefingSections` JSON.
7. **Persist** — single transaction: `UPDATE briefings SET sections, summary_60s, sources_count, status='ready'` + `INSERT sources`.
8. **Finalize** — `UPDATE research_jobs SET status='done', finished_at=now()` + final `XADD step='ready' pct=100` + `LREM research_jobs:processing 1 <payload>`.

**Failure paths**:

- **TinyFish block / captcha / timeout / dead** → persist `sources.status=<value>`, continue pipeline.
- **Notion 403** → `sources.kind='notion_page' status='skipped'`, continue.
- **LLM failure** (transient): retry once with backoff. If still failing → permanent.
- **LLM failure** (permanent) → `UPDATE briefings SET status='failed', error_message=<msg>` + `UPDATE research_jobs SET status='failed'` + `LMOVE` to `research_jobs:dlq`.
- **Worker crash mid-job** → `research_jobs.status='running'` with no claim key → watchdog requeues after 10 min.
- **Duplicate enqueue** → idem key returns existing `briefingId`; no second row.

**Idempotency keys** (maps to master §4 Redis inventory):

| Key | TTL | Purpose |
|---|---|---|
| `idem:briefings:create:{userId}:{meetingId}` | 3600 s | Double-click dedupe; stores existing `briefingId` |
| `job:{briefingId}:claim` | 600 s | Claim token preventing double-processing |

## 6. API Contracts

+++ #### `createBriefingFromMeeting` (Cosmo operation)

`apps/graph/operations/createBriefingFromMeeting.graphql`

```graphql
mutation CreateBriefingFromMeeting($input: CreateBriefingInput!) {
  createBriefingFromMeeting(input: $input) {
    briefingId
    jobId
    deduped
  }
}
```

Status semantics: always 200 at the GraphQL layer; errors surface in the GraphQL `errors` array.

+++

+++ #### TinyFish Fetch

| Method | URL | Auth | Request | Response |
|---|---|---|---|---|
| POST | `https://api.fetch.tinyfish.ai` | `X-API-Key` | `{ urls: string[]; format: "markdown" \| "html" }` | `TinyFishFetchResult[]` |

Error model (per `errors` skill):

- `429 RATE_LIMIT_EXCEEDED` → transient; retry with backoff.
- `5xx INTERNAL_ERROR` → transient.
- `401 UNAUTHORIZED`, `403 FORBIDDEN`, `400 INVALID_INPUT`, `404 NOT_FOUND` → permanent.

+++

+++ #### TinyFish Search

| Method | URL | Auth | Query | Response |
|---|---|---|---|---|
| GET | `https://api.search.tinyfish.ai` | `X-API-Key` | `?query=&location=&language=` | `TinyFishSearchResult[]` |

+++

+++ #### Notion (read-only)

```typescript
interface NotionSearchRequest {
  query: string;
  filter: { property: "object"; value: "page" };
  page_size: 10;
}

interface NotionPage {
  id: NotionPageId;
  title: string;
  snippet: string;
  url: string;
}

interface NotionPageRead {
  id: NotionPageId;
  title: string;
  content: string; // plain text blocks joined
  lastEditedAt: string; // ISO-8601
}
```

| Method | URL | Auth | Request | Response |
|---|---|---|---|---|
| POST | `https://api.notion.com/v1/search` | `Bearer <notion_token>` + `Notion-Version: 2022-06-28` | `NotionSearchRequest` | Notion search response → mapped to `NotionPage[]` |
| GET | `https://api.notion.com/v1/pages/{id}` | `Bearer <notion_token>` | — | Page object → `NotionPageRead` |
| GET | `https://api.notion.com/v1/blocks/{id}/children` | `Bearer <notion_token>` | `page_size=100` | Block children appended to `NotionPageRead.content` |

+++

+++ #### LLM synthesis

| Method | URL | Auth | Request | Response |
|---|---|---|---|---|
| POST | `https://api.openai.com/v1/chat/completions` | `Bearer OPENAI_API_KEY` | `{ model: "gpt-4o", messages, response_format: { type: "json_object" }, temperature: 0.3, max_tokens: 2000 }` | OpenAI standard |

System prompt at `apps/worker/src/llm/prompts/synthesize.md`. Produces `BriefingSections` JSON (master §4 `packages/schema/src/briefing.ts`).

+++

## 7. Test Plan

| Component | Test type | Deps (real/stub) | Observable assertion | Speed |
|---|---|---|---|---|
| `createBriefingFromMeeting` resolver | Integration | Real Postgres + Redis | Row in `briefings`; row in `research_jobs`; `research_jobs:pending` has one entry. | <3s |
| Idem dedupe | Integration | Real Redis | Second call with same `(userId, meetingId)` returns same `briefingId` + `deduped: true`. | <1s |
| Worker BLMOVE + claim | Integration | Real Redis | Job dequeued; `job:{id}:claim` set; processing list has entry. | <2s |
| TinyFish fetch path | Unit (stubbed HTTP) | Stubbed via `msw` | Block-string result → source status `"blocked"`. | <1s |
| Normalizer | Unit | None | Fetch result with blocked text → `status="blocked"` row kept; fetch success → `status="ok"`. | <1s |
| `synthesizeBriefing` | Unit (stubbed HTTP) | Stubbed OpenAI | Returns valid `BriefingSections` for fixture inputs; missing required fields → Zod parse error. | <1s |
| `persistBriefing` transaction | Integration | Real Postgres | `status='ready'` never observable while `sections` null. Concurrent read shows either pending or ready, never intermediate. | <2s |
| Progress stream replay | Integration | Real Redis | Subscriber connecting after `XADD` reads all events from `id=0`. | <2s |
| End-to-end worker run | Integration | Real Postgres + Redis; stubbed Notion/TinyFish/LLM | Fixture meeting → briefing row with 11 sections and ≥3 sources after ≤15 s. | <20s |
| Watchdog requeue | Integration | Real Postgres + Redis | Job in `status='running'` with no claim key for 10 min → reappears on `research_jobs:pending`. | <5s |

All tests under `apps/worker/tests/` and `apps/graph/tests/`.

## 8. Rollout

### 8.0 Rollout summary

- **Branch**: `feat/briefing-generation`.
- **Deploy order**: Research Worker first (idles, consumes queue), then Subgraph with `createBriefingFromMeeting` resolver.
- **Feature flag**: none.
- **Migration**: none beyond master §8.6 (Phase 0 applies `001_init.sql`).
- **Rollback**: per-PR revert. If the pipeline breaks, `getBriefing` on the fixture row still works (Dev D slice), voice Q&A still demoable against fixture. No cross-slice failure.

Depends on master Phase 0 artifacts 3, 4, 7, 8, 9, 10, 19.

### 8.1 PR sequence

| # | PR | Depends on | Owner |
|---|---|---|---|
| 1 | `feat/worker-blmove-loop` — worker skeleton, claim token, graceful shutdown | Phase 0 | Dev B |
| 2 | `feat/tinyfish-client` — Fetch + Search wrappers with retry | 1 | Dev B |
| 3 | `feat/source-normalizer` — block-string validation + SourceKind taxonomy | 1 | Dev B |
| 4 | `feat/llm-synthesize` — prompt + Zod-validated response | 1 | Dev B |
| 5 | `feat/worker-pipeline` — wires 1–4; progress stream; `persistBriefing` transaction | 1, 2, 3, 4 | Dev B |
| 6 | `feat/create-briefing-resolver` — Subgraph mutation + idem dedupe + company/contact inference | Phase 0 | Dev B |
| 7 | `feat/watchdog-requeue` — optional; cuts if time short | 5 | Dev B (cut list) |

### 8.2 Wall-clock plan (11:00–16:30 PT, 2026-04-24)

| Time | Work | PR(s) | Exit criteria |
|---|---|---|---|
| 12:00 | Rebase on `feat/phase-0-foundations` | — | `pnpm typecheck` green |
| 12:00–12:30 | Worker BLMOVE loop + claim token | #1 | `docker compose up worker` idles; test job dequeues |
| 12:30–13:15 | TinyFish client + normalizer | #2, #3 | Unit tests green |
| 13:15–14:00 | LLM synthesis + `persistBriefing` transaction | #4, #5 | Integration test: fixture → ready briefing row |
| 14:00–14:30 | `createBriefingFromMeeting` resolver wired end-to-end | #6 | `createBriefingFromMeeting` in smoke test produces briefing in <30 s |
| 14:30–15:00 | Hero meeting "Sarah from Ramp" generated with real external calls | — | Human-reviewed briefing |
| 15:00–16:00 | Bug-fixing + demo polish + pre-record backup take | — | Demo-ready |
| 16:00–16:15 | Demo video recording | — | Video uploaded |

### 8.3 Cut list (if slipping at 14:30 PT)

1. Drop `web_search` task; keep only `web_fetch` with hard-coded URL list.
2. Hard-code Ramp company context + 3 Notion excerpts; `synthesizeBriefing` only writes suggested opening + questions + follow-up email. Document in implementation log.

## 9. Open Questions

1. **[RESOLVED] Single transaction for `persistBriefing`.** Wrapped in `BEGIN/COMMIT` via `@insforge/sdk` transaction helper; falls back to direct PostgREST if SDK lacks transactions. Dev B verifies the SDK path at PR #5.

2. **[RESOLVED] LLM model.** `gpt-4o` with `response_format: { type: "json_object" }`. Temperature 0.3. Max tokens 2000.

3. **[RESOLVED] Fetch batch URL list.** `[company.com, company.com/about, company.com/product, company.com/pricing, company.com/blog]` with per-URL 200/404 tolerance via TinyFish's per-URL `error` field; failed URLs → `sources.status='dead'`.

4. **[RESOLVED] Watchdog cadence.** Worker-level `setInterval` scans `research_jobs WHERE status='running' AND started_at < now() - interval '10 minutes'` and requeues. Runs once per minute.

5. **[RESOLVED] Progress step names.** Fixed enum from master §4 `packages/schema/src/jobs.ts`. Frontend switches on `step`.

6. **[DEFERRED — post-MVP]** Per-source citation inside each briefing section (mapping specific questions/facts to `Source.id`). MVP includes `citedSources` array at the briefing level only.

7. **[DEFERRED — post-MVP]** Multi-tenant TinyFish credit accounting. Free-tier single-account is fine for a demo.

8. **[NON_BLOCKING]** TinyFish Search language/location. Defaults `en`, `us`. Owner: Dev B. Deadline: 13:30 PT at latest; overridden only if demo surfaces non-English targets.

9. **[NON_BLOCKING]** Notion OAuth scope. `read_content` only. Owner: Dev D; Dev B consumes the token via `packages/notion/src/client.ts`. Deadline: 13:00 PT (Dev D's PR #3).

10. **[NON_BLOCKING]** Worker horizontal scaling. One worker instance for the demo. Lists + BLMOVE + claim keys are multi-worker safe; adding replicas needs no code change. Owner: Dev A (infra). Deadline: no deadline — only if autonomy demo calls for it.
