**Created At**: 2026-04-24
**Author**: emperor-direct
**Approved By**: [leave blank]

---

> **Preamble**. Spec for PreCall's Google OAuth primary-login flow on ship2prod-hackathon. Diverges from the sibling repo's `s2p-hackathon/docs/specs/04-google-calendar-integration.md` along three axes:
>
> 1. **OAuth posture**: Google is the primary identity provider. First login provisions the `users` row. There is no prior InsForge email/password step.
> 2. **Scope**: `https://www.googleapis.com/auth/calendar` (read/write), not `calendar.readonly`.
> 3. **Frontend**: `apps/web` is promoted from a one-line stub to a real Next.js 14 App Router app.
>
> **Cross-references**: [../specs/00-master.md](./00-master.md) (stack invariants) · [../../CLAUDE.md](../../CLAUDE.md) · sibling reference implementation at `/Users/sachinmeier/Projects/Me/s2p-hackathon/packages/gcal/src/oauth.ts` (300-line working example; adapt, do not copy verbatim — the flow differs).

---

## 1. Problem

Users cannot sign in. `apps/web/src/app/page.tsx` returns the string `"web: not implemented"`. `apps/graph/src/index.ts` is `console.log('graph: not implemented')`. The `users` table has `google_refresh_token TEXT` but no `google_access_token`, no stable Google-side identifier, no display name. Every downstream briefing and calendar feature presumes a logged-in user and a cached Calendar access token. Neither exists.

## 2. Solution (one paragraph)

`apps/web` becomes a Next.js 14 App Router app. A "Sign in with Google" button starts an OAuth 2.0 Authorization Code flow scoped to `openid email profile https://www.googleapis.com/auth/calendar`. The callback exchanges the code, decodes the `id_token`, **upserts the `users` row by `google_sub`** (Google's stable subject claim), persists `google_refresh_token`, `google_access_token`, `google_access_token_expires_at`, and issues a signed HS256 JWT in an HttpOnly cookie. A protected `/dashboard` renders the user profile. A demo `/calendar` page proves read/write: list primary-calendar events and a button to create a test event tomorrow at 10:00 local. Token refresh is serialised per user with a Redis `SET NX EX` lock and a 200 ms poll loop for losers — the pattern from the sibling repo, adapted.

## 3. Architecture

### 3.1 Sign-in sequence

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant W as Next.js (apps/web :3000)
    participant R as Redis
    participant PG as Postgres (users)
    participant G as Google OAuth
    participant GC as Google Calendar

    B->>W: GET / (no session cookie)
    W-->>B: Landing page with "Sign in with Google"
    B->>W: GET /api/auth/google/start
    W->>W: n = randomBytes(32).toString("base64url")
    W->>R: SET oauth:state:{n} {createdAt} EX 600
    W-->>B: 302 https://accounts.google.com/o/oauth2/v2/auth?...&state={n}
    B->>G: consent (calendar scope)
    G-->>B: 302 GOOGLE_REDIRECT_URI?code&state={n}
    B->>W: GET /api/auth/google/callback?code&state
    W->>R: GETDEL oauth:state:{n}
    W->>G: POST /token (code, client_id, secret, redirect_uri, authorization_code)
    G-->>W: { access_token, refresh_token, id_token, expires_in, scope }
    W->>W: verify scope contains calendar.readwrite; decode id_token
    W->>PG: INSERT ... ON CONFLICT (google_sub) DO UPDATE
    W->>W: sign session JWT { sub=userId, email, name }; Set-Cookie
    W-->>B: 302 /dashboard
    B->>W: GET /dashboard (Cookie: s2p_session)
    W->>W: verify JWT; read user
    W-->>B: rendered dashboard
    B->>W: GET /calendar
    W->>PG: SELECT tokens FROM users
    alt access_token expired
        W->>R: SET lock:google:refresh:{userId} NX EX 30
        W->>G: POST /token grant_type=refresh_token
        W->>PG: UPDATE google_access_token, ...expires_at
        W->>R: DEL lock
    end
    W->>GC: GET /calendars/primary/events
    GC-->>W: items[]
    W-->>B: events list + "Create test event" form
```

### 3.2 Invariants

- **Google `sub` is the primary key for user identity.** Email may change; `sub` is stable. `users.google_sub` is UNIQUE.
- **Access token on DB, never in the session cookie.** Cookie carries only user id + email + name.
- **Session JWT is HS256 signed by `SESSION_JWT_SECRET`.** 7-day `exp`. `iat`, `sub`, `email`, `name`, `picture` claims. No `google_access_token` in the cookie.
- **Cookie is `Secure` in production, `SameSite=Lax`, `HttpOnly`, `Path=/`, `Domain` unset (host-only).** Cookie name `s2p_session`.
- **Single writer for user's Google token columns: `apps/web`.** The graph service will read these columns later; it will not write them.
- **State nonce is single-use.** `GETDEL` at callback. Missing state = 400. TTL 600 s is the safety net.
- **No background Calendar sync.** Reads are on page load (cache via Next.js `revalidate` at 60 s is optional; not required for MVP).
- **Refresh serialisation.** `SET lock:google:refresh:{userId} NX EX 30`. Losers poll `users.google_access_token_expires_at` every 200 ms for up to 5 s. Timeout → one retry outside the lock → if still fails, `TransientError`.
- **Scope gate.** Callback refuses to persist tokens if returned `scope` does not include `https://www.googleapis.com/auth/calendar`. Redirect `/?oauthError=calendar_scope_missing`.
- **Logout is local.** `POST /api/auth/logout` clears the cookie only. It does not revoke tokens at Google. Use `/api/auth/google/disconnect` for that.
- **Disconnect revokes at Google** (`POST oauth2.googleapis.com/revoke`), nulls the three Google columns, clears the `s2p_session` cookie.

### 3.3 Stack choices

| Decision | Chosen | Why |
|---|---|---|
| OAuth library | Hand-rolled using `fetch` | 200 lines, no SDK, matches sibling repo pattern. No `next-auth` adapter needed. |
| Session JWT | `jose` v5 (ESM-first, edge-compatible) | Works in Next.js middleware (edge runtime) and Route Handlers (node runtime). |
| Postgres driver | `pg` (node-postgres) | Already in the Postgres ecosystem; simple pool. Not ORM. |
| Redis client | `ioredis` | Already used elsewhere in the workspace (dev dep at root). |
| Frontend styling | Tailwind CSS v3 | Fast, no design system dependencies, plays well with Next.js 14. |
| Runtime for Route Handlers | `nodejs` (default) | `pg` and `ioredis` need node built-ins. Middleware stays edge. |

## 4. Components

### 4.1 DDL migration (`infra/seed/migrations/002_google_oauth_primary.sql`, new file)

```sql
-- 002_google_oauth_primary.sql
-- Adds Google primary-login columns to users. See docs/specs/04-google-oauth-login.md §3.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub                     TEXT,
  ADD COLUMN IF NOT EXISTS google_access_token            TEXT,
  ADD COLUMN IF NOT EXISTS google_access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS display_name                   TEXT,
  ADD COLUMN IF NOT EXISTS picture_url                    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
```

Partial-unique index (`WHERE google_sub IS NOT NULL`) lets the seeded demo user with `google_sub = NULL` coexist with real OAuth rows.

### 4.2 Schema update (`packages/schema/src/insforge.ts`)

Extend `UsersRowSchema` with five optional-nullable fields. Keep existing `id`, `email`, `google_refresh_token`, `notion_token`, `created_at`. The seed row at `infra/seed/seed/00_users.sql` has `NULL`s for the new columns; `UsersRowSchema.parse` on that row must pass after this change.

```typescript
export const UsersRowSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    google_sub: z.string().nullable(),
    google_refresh_token: z.string().nullable(),
    google_access_token: z.string().nullable(),
    google_access_token_expires_at: z.string().nullable(),  // ISO-8601
    display_name: z.string().nullable(),
    picture_url: z.string().nullable(),
    notion_token: z.string().nullable(),
    created_at: z.string(),
  })
  .strict()
```

### 4.3 Next.js app layout (`apps/web/*`)

```
apps/web/
  next.config.mjs
  next-env.d.ts
  postcss.config.mjs
  tailwind.config.ts
  tsconfig.json                      # updated for Next.js
  package.json                       # adds next, react, react-dom, tailwindcss, pg, ioredis, jose
  src/
    middleware.ts                    # protects /dashboard, /calendar
    app/
      layout.tsx                     # root layout with Tailwind globals + font
      page.tsx                       # landing + "Sign in with Google"
      globals.css                    # Tailwind directives
      dashboard/
        page.tsx                     # server component; reads session, shows user card
      calendar/
        page.tsx                     # server component; lists events, form to create test event
      api/
        auth/
          google/
            start/route.ts           # GET: mint state, 302 to Google
            callback/route.ts        # GET: exchange code, upsert user, set cookie, 302 /dashboard
            disconnect/route.ts      # POST: revoke at Google, null columns, clear cookie
          logout/route.ts            # POST: clear cookie
          me/route.ts                # GET: return { user } or 401
        calendar/
          events/route.ts            # GET: list; POST: create test event
    lib/
      env.ts                         # typed env access (zod parse)
      db.ts                          # pg Pool singleton
      redis.ts                       # ioredis singleton
      session.ts                     # signSession / verifySession (jose)
      oauth.ts                       # buildAuthUrl, exchangeCode, refreshAccessToken, revoke
      calendar.ts                    # listUpcomingEvents, createEvent (calls Google directly)
      errors.ts                      # classifyGoogleError
      users.ts                       # upsertUserByGoogleSub, getUserById, updateUserTokens, clearUserTokens
```

### 4.4 OAuth routes (contracts)

| Method | Path | Auth | Body | 2xx response | Error |
|---|---|---|---|---|---|
| GET | `/api/auth/google/start` | none | — | 302 to Google | 500 if Redis down |
| GET | `/api/auth/google/callback?code&state` | (state cookie-independent; bound to Redis) | — | 302 `/dashboard` on success, `/?oauthError=<tag>` otherwise | 400 `state_missing` if state not in Redis |
| POST | `/api/auth/logout` | session cookie | — | 204 with `Set-Cookie: s2p_session=; Max-Age=0` | — |
| POST | `/api/auth/google/disconnect` | session cookie | — | 204 with cleared cookie | 401 if no session |
| GET | `/api/auth/me` | session cookie | — | `{ user: { id, email, displayName, pictureUrl } }` | 401 if no session |
| GET | `/api/calendar/events` | session cookie | — | `{ events: UpcomingEvent[] }` | 401, 424 (google down) |
| POST | `/api/calendar/events` | session cookie | `{ title, startsAt, durationMinutes }` | `{ event: { id, title, startsAt, endsAt, htmlLink } }` | 401, 424, 422 (validation) |

### 4.5 Session JWT shape

```json
{
  "sub":     "<UserId UUID>",
  "email":   "<email>",
  "name":    "<displayName>",
  "picture": "<pictureUrl>",
  "iat":     1714060800,
  "exp":     1714665600
}
```

Signed HS256 with `SESSION_JWT_SECRET` (min 32 bytes). Cookie name `s2p_session`. Attributes: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` (7 days).

### 4.6 Redis keys (additions)

| Key | Type | TTL | Writer | Reader | Purpose |
|---|---|---|---|---|---|
| `oauth:state:{nonce}` | STRING (JSON `{ createdAt }`) | 600 s | `/api/auth/google/start` | `/api/auth/google/callback` | CSRF state. `GETDEL` at callback. |
| `lock:google:refresh:{userId}` | STRING (`refresherId`) | 30 s | winner | all callers | Refresh serialisation. Losers poll Postgres. |

### 4.7 Scopes

`scope` query param on Google's auth URL:

```
openid email profile https://www.googleapis.com/auth/calendar
```

Full `/auth/calendar` is read/write. Narrower alternatives (`calendar.events` only) would also work; pick the broad one to match the user's mandate.

### 4.8 Demo Calendar write

On `/calendar`, a button "Create test event" submits to `POST /api/calendar/events` with:

```json
{ "title": "PreCall test event", "startsAt": "<tomorrow 10:00 local ISO>", "durationMinutes": 30 }
```

Server calls `POST https://www.googleapis.com/calendar/v3/calendars/primary/events` with bearer token. Returns the created event. On success the page re-renders the list, which now includes the event.

### 4.9 Env additions (`.env.example` at repo root, new file)

```bash
# ---- Google OAuth (primary login + Calendar R/W) ----
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Must match exactly what is registered in Google Cloud Console.
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# ---- Session signing (min 32 bytes) ----
SESSION_JWT_SECRET=dev-insecure-change-me-dev-insecure-change-me

# ---- Infra ----
DATABASE_URL=postgres://postgres:postgres@localhost:5432/insforge
REDIS_URL=redis://localhost:6379

# ---- App URL (used for Set-Cookie + redirects) ----
APP_URL=http://localhost:3000
```

## 5. Data Flow

### 5.1 First login

1. User clicks "Sign in with Google" on `/`.
2. `GET /api/auth/google/start` mints state, stores in Redis, 302s to Google.
3. User consents at Google.
4. Google 302s back to `/api/auth/google/callback?code&state`.
5. Callback `GETDEL`s state, exchanges code at `oauth2.googleapis.com/token`, decodes `id_token`, upserts user by `google_sub`, persists refresh + access + expiry + display_name + picture_url, signs session JWT, `Set-Cookie`, 302s `/dashboard`.

### 5.2 Subsequent loads

1. Browser sends cookie.
2. Middleware verifies JWT (edge runtime, jose).
3. `/dashboard` server component reads user id from JWT, fetches `users` row.
4. `/calendar` server component fetches events (see 5.3).

### 5.3 Calendar read

1. Read tokens from DB.
2. If `expires_at < now + 60 s`, call `refreshAccessToken(userId)`.
3. `GET https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=...&timeMax=...&singleEvents=true&orderBy=startTime&maxResults=20`.
4. Return mapped events (id, title, startsAt, endsAt, attendees[], htmlLink).

### 5.4 Calendar write

1. Read tokens, refresh if needed.
2. `POST https://www.googleapis.com/calendar/v3/calendars/primary/events` with `{ summary, start: { dateTime, timeZone }, end: { dateTime, timeZone } }`.
3. Return the created event payload trimmed to `{ id, title, startsAt, endsAt, htmlLink }`.

### 5.5 Disconnect

1. Load refresh token from DB.
2. If present, `POST oauth2.googleapis.com/revoke?token=<refresh_token>`. Per Google, single call kills the refresh token and every derived access token.
3. `UPDATE users SET google_sub=null, google_refresh_token=null, google_access_token=null, google_access_token_expires_at=null WHERE id=$1`. Leave `email`, `display_name`, `picture_url` for audit.
4. Clear `s2p_session` cookie (`Max-Age=0`).

Note: disconnect also logs the user out (no session after it). Re-signing in goes through the full consent flow again.

### 5.6 Failure paths

| Signal | Detection | Action |
|---|---|---|
| State missing in Redis | `GETDEL` returns `null` | 400 text/plain `state_missing`. No cookie, no redirect. |
| Scope missing on token response | `!tokens.scope.includes("/auth/calendar")` | 302 `/?oauthError=calendar_scope_missing`. No persist. |
| Code exchange fails | Google returns 4xx on `/token` | 302 `/?oauthError=code_exchange_failed`. |
| DB write fails | `pg` throws | 302 `/?oauthError=db_unavailable`. |
| `401` on events.list | status check | Refresh once → retry. Second 401 → null tokens + force re-consent. |
| `invalid_grant` on refresh | error body | Null tokens. Next request to `/calendar` returns `[]` and a "Re-connect Google" CTA. |
| `429` / `5xx` from Google | status | Full-jitter backoff, base 500 ms, cap 5 s, 3 retries for 429, 2 for 5xx. |
| Redis unavailable | connection error | `/api/auth/google/start` returns 503 with a friendly message. Refresh degrades to concurrent refreshes (rare enough). |
| Clock skew | — | Assumed NTP-synced. Documented, not mitigated. |

## 6. API Contracts

### 6.1 Next.js Route Handlers

See §4.4 table.

### 6.2 External Google endpoints

| Method | URL | Purpose | Auth |
|---|---|---|---|
| GET | `https://accounts.google.com/o/oauth2/v2/auth` | Consent URL (redirect) | none |
| POST | `https://oauth2.googleapis.com/token` | Code exchange + refresh | `client_id`, `client_secret`, body |
| POST | `https://oauth2.googleapis.com/revoke` | Revoke refresh token | `token=` |
| GET | `https://www.googleapis.com/calendar/v3/calendars/primary/events` | List events | `Authorization: Bearer <access_token>` |
| POST | `https://www.googleapis.com/calendar/v3/calendars/primary/events` | Insert event | `Authorization: Bearer <access_token>`, JSON body |

## 7. Test Plan

Vitest. Integration over unit per the `tests` skill.

| File | Type | Deps (real / stub) | Observable assertion |
|---|---|---|---|
| `packages/schema/tests/insforge.test.ts` (extended) | Unit | — | `UsersRowSchema.safeParse` accepts a row with all five new columns `null`, and accepts a row with all five populated. |
| `apps/web/tests/session.test.ts` (new) | Unit | — | `signSession` then `verifySession` round-trip; bad signature throws; expired token throws. |
| `apps/web/tests/oauth.test.ts` (new) | Integration | Real Redis (6380) + stubbed Google via `msw` | `GET /start` 302s with a Redis nonce set. `GET /callback` with a valid nonce + stubbed token response 302s `/dashboard` with `Set-Cookie: s2p_session=...`. Stale state returns 400. Missing calendar scope 302s `/?oauthError=calendar_scope_missing`. |
| `apps/web/tests/calendar.test.ts` (new) | Integration | Real Redis + real Postgres (5433) + stubbed Google | `GET /api/calendar/events` returns mapped events. `POST` inserts an event (verify stubbed Google received the right body). Expired access token triggers refresh. |

Docker:

```bash
docker compose -f docker-compose.test.yml up -d --wait
pnpm test:run
```

## 8. Rollout

- Branch: stays on current working tree. User will handle `git add/commit/push` (per their note that another agent is active in the repo).
- Docker: `docker compose up -d` (default profile) brings up postgres + redis + insforge. The `apps` profile is intentionally not started; local dev for this spec is `pnpm --filter @ship2prod/web dev`.
- Demo: open `http://localhost:3000`, click sign-in, land at `/dashboard`, navigate to `/calendar`, click "Create test event", verify in Google Calendar UI.

### 8.1 Cut list (if behind the hackathon clock)

1. Drop the refresh-lock poll. Use `SET NX` only; losers throw `TransientError`. Single-user demo tolerates this.
2. Drop the `/calendar` write demo. Read-only page still proves R/W scope was granted; just no UI button.
3. Drop Tailwind. Ship un-styled HTML. Fastest path.
4. Drop the E2E Playwright test (not in the plan above — only named so it can be formally skipped if mentioned).

Never cut: the DDL migration, `google_sub` uniqueness, the session JWT (no session = no demo).

## 9. Open Questions

1. **[RESOLVED]** Primary login vs connect-after-login. User mandate is explicit: Google is the identity. No InsForge email/password pre-step.
2. **[RESOLVED]** Scope breadth. `https://www.googleapis.com/auth/calendar` (full R/W). Narrower `calendar.events` is semantically equivalent for the demo but broader matches the mandate.
3. **[RESOLVED]** Where OAuth lives. `apps/web` (Next.js) owns the flow end-to-end. The graph service will read `users.google_access_token` later; it does not participate in the auth dance.
4. **[RESOLVED]** Session mechanism. Signed HS256 JWT in HttpOnly cookie. No server-side session store; the JWT is self-contained.
5. **[RESOLVED]** User key. `google_sub`. Email is a display field; it can change.
6. **[DEFERRED: post-MVP]** PKCE. Confidential client, server-side code exchange — PKCE is optional. Add if Google Cloud Console nudges.
7. **[DEFERRED: post-MVP]** Multi-calendar. `primary` only.
8. **[DEFERRED: post-MVP]** Background token refresh cron. Demand-refresh is sufficient for the hackathon.
9. **[NON_BLOCKING]** Graph service session verification. Graph will verify the same JWT with the same `SESSION_JWT_SECRET`. Tracked by its own spec; not in scope here.
10. **[NON_BLOCKING]** Email verification. We trust Google's `email_verified` claim. If `false`, the callback redirects `/?oauthError=email_not_verified`.

## 10. File Checklist (for the implementing SWE)

CREATE:
- `infra/seed/migrations/002_google_oauth_primary.sql`
- `apps/web/next.config.mjs`
- `apps/web/next-env.d.ts` (auto-generated; may be committed or gitignored)
- `apps/web/postcss.config.mjs`
- `apps/web/tailwind.config.ts`
- `apps/web/src/middleware.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/calendar/page.tsx`
- `apps/web/src/app/api/auth/google/start/route.ts`
- `apps/web/src/app/api/auth/google/callback/route.ts`
- `apps/web/src/app/api/auth/google/disconnect/route.ts`
- `apps/web/src/app/api/auth/logout/route.ts`
- `apps/web/src/app/api/auth/me/route.ts`
- `apps/web/src/app/api/calendar/events/route.ts`
- `apps/web/src/lib/env.ts`
- `apps/web/src/lib/db.ts`
- `apps/web/src/lib/redis.ts`
- `apps/web/src/lib/session.ts`
- `apps/web/src/lib/oauth.ts`
- `apps/web/src/lib/calendar.ts`
- `apps/web/src/lib/errors.ts`
- `apps/web/src/lib/users.ts`
- `apps/web/tests/session.test.ts`
- `apps/web/tests/oauth.test.ts`
- `apps/web/tests/calendar.test.ts`
- `apps/web/vitest.config.ts`
- `.env.example` (root)

MODIFY:
- `apps/web/package.json` (add deps)
- `apps/web/tsconfig.json` (Next.js compatible)
- `apps/web/src/app/page.tsx` (replace stub with landing page)
- `packages/schema/src/insforge.ts` (extend `UsersRowSchema`)
- `packages/schema/tests/insforge.test.ts` (new-column cases)

DO NOT TOUCH (another agent is active here):
- `packages/integrations/**/*` (Notion work in flight)
- `pnpm-lock.yaml` (will regenerate on `pnpm install`, but do not hand-edit)

DO NOT RUN:
- `git add`, `git commit`, `git push` — user handles VCS.
- `git branch`, `git checkout -b` — stay on `main`.
