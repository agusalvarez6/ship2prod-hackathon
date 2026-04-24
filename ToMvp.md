# ToMvp

How close PreCall is to the demo, what is missing, and exactly how to close each gap.

## The product

You sign in with Google. PreCall reads your calendar. For each upcoming meeting it researches the contact and their company, then writes you a briefing. Before the meeting you open a voice call with an assistant that knows the briefing and answers your questions. That is the demo.

## What works today

- **Google sign-in.** `/` → `/api/auth/google/start` → Google → callback → session cookie. Lands you on `/dashboard`.
- **Notion connect.** Per-user OAuth grant stored in the `users` table.
- **Live calendar.** `/calendar` is a Next.js Server Component that calls Google Calendar directly using the stored access token. Lists up to 20 upcoming events. Supports creating a new event and editing an event description.
- **Briefing generation engine.** `/debug` or `pnpm demo` inserts a pending briefing row, pushes a research job to Redis, a worker picks it up, calls TinyFish for sources, calls Gemini 2.5 Flash in JSON mode, persists the briefing to Postgres. A real briefing runs in 5 to 20 seconds.
- **Data model.** The `meetings` table has a unique `(user_id, calendar_event_id)` index. A Google event maps to exactly one row. A briefing links to that row. The bridge already exists in the schema. Nothing is using it yet in application code.
- **Infra.** `pnpm battleStation:start` boots Docker, applies every migration, seeds the Sarah fixture, and launches graph + worker + web with one command.

Roughly sixty-five percent of the product is in place. The engine runs, auth is solid, and the calendar is real. The pieces that remain are glue and presentation.

## Gap 1. Wire calendar events to briefings

**What you see today.** `/calendar` lists your real events. Each row shows time, title, attendees, description. There is no connection to the briefing engine. No button, no status, no mapping.

**What should happen.** On each event row you see a badge: `no briefing`, `researching`, or `ready`. If `ready` the row links to the briefing page. If `no briefing` a button next to the row says `Generate briefing` and clicking it starts the research. The page also auto-queues briefings for any event in the next forty-eight hours that does not already have one, so most of the time you do not have to click anything.

**How to build it.**

1. New helper `apps/web/src/lib/briefings.ts` with two functions:
   - `ensureMeetingForEvent(userId, googleEvent)` upserts a `meetings` row using the `(user_id, calendar_event_id)` unique index. Returns the meeting UUID.
   - `ensureBriefingForMeeting(userId, meetingId)` checks Redis `idem:briefings:create:<userId>:<meetingId>`. If the key is unset it calls the graph mutation `createBriefingFromMeeting(meetingId)`, stores the new briefing id at that key with a 24 hour TTL, and returns the id. Otherwise returns the cached id.
2. New API route `apps/web/src/app/api/briefings/ensure/route.ts`. Accepts `{ calendarEventId }`, resolves the session, calls the two helpers, returns `{ briefingId, status }`.
3. Edit `apps/web/src/app/calendar/EventRow.tsx` to render a badge that reads the briefing status (polls `/api/briefings/<id>` every two seconds while `pending`) and a button that posts to `/api/briefings/ensure` when there is no briefing yet.
4. Edit `apps/web/src/app/calendar/page.tsx` to loop over events starting within forty-eight hours and call the ensure helper server-side so they queue on page load. Server rendering can wait up to five seconds. Anything still pending after that shows the `researching` badge and the client polls.

**Files touched.** Two new, two edited. No schema changes. No graph resolver changes.

**Effort.** About two hours.

## Gap 2. Briefing viewer

**What you see today.** Raw JSON on `/debug`. No way to read a briefing in prose form. No link from the calendar to a briefing.

**What should happen.** Each briefing has its own page at `/briefings/<id>`. The page renders the ten sections as readable blocks: a one-paragraph summary at the top, then who you are meeting, company context, recent updates, questions to ask, likely pain points, suggested opening line, conversation angle, risks, and a collapsible draft follow-up email. A status strip at the top shows `pending` with elapsed seconds, `ready`, or `failed` with the worker error.

**How to build it.**

1. New route `apps/web/src/app/briefings/[briefingId]/page.tsx`. Auth-gated. Reads the briefing through the graph with `getBriefing(id)`. Renders every section as a card.
2. New component `apps/web/src/app/briefings/[briefingId]/PollStatus.tsx` that polls `getBriefing` every two seconds while status is `pending` and refreshes the whole page on transition.
3. Fix the known bug in `apps/graph/src/resolvers/briefing.ts` `getBriefingProgress` so its return shape matches the SDL. Either rename the SDL fields (`jobId`, `detail`, `pct`, `at`, `history`) to what the resolver returns, or update the resolver to match the SDL. Pick the SDL version because the worker emits `pct` and `detail` already.
4. Add a link in `EventRow.tsx` when `status === 'ready'` that points at `/briefings/<id>`.

**Files touched.** Two new components, one bug fix, one small edit.

**Effort.** About one and a half hours.

## Gap 3. Voice debrief

**What you see today.** Nothing. The Vapi webhook returns 200 on every event type without verifying anything. The tool handler dispatch table is empty. The `answerFromBriefing` resolver throws. No Vapi assistant is configured.

**What should happen.** On a briefing page the user clicks `Start voice debrief`. A Vapi web session opens. The assistant greets them and asks what they want to know about the meeting. The user speaks. Vapi calls a tool that asks our backend for the answer. The assistant speaks the answer. At the end of the call the transcript is saved to Postgres.

**How to build it.**

1. `apps/vapi-webhook/src/middleware/hmac.ts`. Replace the stub with real HMAC-SHA256 verification over `timestamp + raw_body` using `VAPI_WEBHOOK_SECRET`. Reject requests with a timestamp outside a five-minute window. Use `crypto.timingSafeEqual` after a length check.
2. `apps/vapi-webhook/src/middleware/idem.ts`. Replace the stub with `redis.set('idem:vapi:<eventId>', '1', 'NX', 'EX', 86400)`. If the SET returns null the event is a replay. Return the cached result from `idem:vapi:<eventId>:result` if present, otherwise 200 with an empty body.
3. `apps/vapi-webhook/src/tools.ts`. Populate the dispatch table:
   - `answerFromBriefing({ briefingId, question })` calls the graph mutation `answerFromBriefing` and returns `{ text }`.
   - `saveCallTranscript({ callId, transcript })` calls the graph mutation and returns `{ ok: true }`.
4. `apps/graph/src/resolvers/voice.ts`. Replace both throws.
   - `answerFromBriefing` loads the briefing sections, builds a retrieval prompt of the form `You are helping the user prepare for a meeting. Briefing: <sections JSON>. Question: <question>. Answer in one or two sentences.`, calls `llm.synthesize({ system, context, question, json: false })`, returns `{ text }`.
   - `saveCallTranscript` inserts a row into `call_transcripts` and returns the row.
5. Set up the Vapi assistant in the Vapi dashboard. One assistant. Two tools. Webhook URL points at your local machine through an ngrok tunnel for development, or a deployed URL. Paste `NEXT_PUBLIC_VAPI_PUBLIC_KEY` and `NEXT_PUBLIC_VAPI_ASSISTANT_ID` into `.env`.
6. `apps/web/src/components/CallButton.tsx`. Replace the `console.warn` with a `@vapi-ai/web` client that calls `vapi.start(assistantId, { variables: { briefingId } })`.
7. Drop the button into `apps/web/src/app/briefings/[briefingId]/page.tsx` above the sections.

**Files touched.** Four edits on the webhook, two on the graph, one new client component, one env update.

**External work.** Creating the assistant in Vapi and setting up ngrok. About thirty minutes. Not code.

**Effort.** About four hours of code plus the external setup.

## Gap 4. Caching

**What you see today.** Generating two briefings for the same person researches them twice. The viewer page hits Postgres on every poll. The schema declares all the cache keys but no code touches them.

**What should happen.** TinyFish fetches are cached by URL hash for twenty-four hours. Briefings are cached in Redis for fifteen minutes so the poll is cheap. Notion pages and searches are cached too.

**How to build it.**

1. `packages/integrations/src/tinyfish.ts`. Wrap `fetch` and `search`. Before the HTTP call, compute `sha256(url)` or `sha256(query)`, look up `cache:tinyfish:<hash>` in Redis, return the cached JSON if present. After a successful fetch, write the result with a 24 hour TTL.
2. `apps/graph/src/resolvers/briefing.ts` `getBriefing`. Read `cache:briefing:<id>` first. On miss, read from Postgres and write back with a 15 minute TTL. On `createBriefingFromMeeting` write, invalidate the cache key.
3. Repeat the pattern for the Notion client once Notion is wired into the pipeline.

**Files touched.** Two edits, one future.

**Effort.** About one hour.

## Order and effort

| Gap | Hours | In the demo? |
|---|---|---|
| 1. Calendar to briefing wiring | 2.0 | Required |
| 2. Briefing viewer | 1.5 | Required |
| 3. Voice debrief | 4.0 | Required for the voice demo |
| 4. Caching | 1.0 | Optional |

Serial cost without voice: three and a half hours.
Serial cost with voice: seven and a half hours.
Wall clock with two parallel sessions (1+2 on one track, 3 on the other): about four and a half hours.

## What to do next

1. Confirm `/calendar` renders your real events after sign-in. If yes, gap 1 can start immediately and nothing else blocks it.
2. Decide whether voice is in scope for the first demo. If yes, fork gap 3 to a separate session in parallel with gaps 1 and 2. If no, save it for a later session.
3. Leave gap 4 for after gaps 1 through 3 land. It is measurable polish, not plumbing.
