# infra/seed

Canonical SQL schema, seed fixtures, and a JSON mirror of the fixture briefing.

## Layout

```
infra/seed/
  migrations/
    001_init.sql           # DDL for the 5 InsForge tables
  seed/
    00_users.sql           # fixture user
    01_meetings_fixture.sql  # Sarah / Ramp meeting
    02_briefing_fixture.sql  # canonical fixture briefing (status=ready, 11 sections)
    03_sources_fixture.sql   # 5 source rows cited by the fixture briefing
  briefings.seed.json      # JSON mirror of the fixture briefing for app-level tests
  tests/
    seed.test.ts           # integration test asserting schema + fixture load
```

## Canonical fixture briefing

- **UUID**: `11111111-2222-3333-4444-555555555555` (literal; never regenerate)
- **Status**: `ready`
- **Sections**: eleven keys per `BriefingSectionsSchema` in `packages/schema/src/briefing.ts`
- **Meeting**: Intro with Sarah from Ramp (`bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`)
- **User**: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
- **Sources**: five rows, one per kind in CLAUDE.md vocabulary; the `linkedin` row has `status='blocked'` to exercise the CAPTCHA fallback path.

Rationale is in `docs/specs/00-master.md` §8.3 and `/tmp/foundations-2215ec51/scope.md` §2.

## Load order

Apply in this order. Migrations first, then seeds in lexical order.

1. `migrations/001_init.sql`
2. `seed/00_users.sql`
3. `seed/01_meetings_fixture.sql`
4. `seed/02_briefing_fixture.sql`
5. `seed/03_sources_fixture.sql`

Every statement is idempotent. `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `INSERT ... ON CONFLICT DO NOTHING` make it safe to re-apply.

## Applying to a local or test database

### In docker-compose (dev / demo path)

`docker-compose.yml` at the repo root already wires the Postgres service to mount these two directories under `/docker-entrypoint-initdb.d/` with the `01-` and `02-` prefixes that force migrations before seeds, per `docs/specs/00-master.md` §8.6:

```yaml
postgres:
  image: postgres:15-alpine
  volumes:
    - ./infra/seed/migrations:/docker-entrypoint-initdb.d/01-migrations:ro
    - ./infra/seed/seed:/docker-entrypoint-initdb.d/02-seed:ro
```

Bring it up:

```bash
docker compose up -d postgres
```

Postgres applies files in lexical order on first init. Subsequent starts are no-ops. Drop the volume to re-seed:

```bash
docker compose down -v
```

### In the test harness

The test harness (`test/env.ts`, `test/globalSetup.ts`) brings up `docker-compose.test.yml` with Postgres on host port `5433` and Redis on `6380`. The harness does NOT mount the seed directory, so each test that needs the schema applies it itself. `tests/seed.test.ts` does this inside an ephemeral schema so parallel test files do not collide. Reusable pattern for consumers:

```typescript
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";

const client = new pg.Client({ connectionString: process.env.POSTGRES_TEST_URL });
await client.connect();
await client.query(`CREATE SCHEMA IF NOT EXISTS test_abc`);
await client.query(`SET search_path TO test_abc`);
await client.query(await readFile("infra/seed/migrations/001_init.sql", "utf8"));
for (const f of (await readdir("infra/seed/seed")).sort()) {
  await client.query(await readFile(`infra/seed/seed/${f}`, "utf8"));
}
```

## JSON mirror

`briefings.seed.json` is a plain-object rendering of the fixture briefing in the
shape that `BriefingSchema` in `packages/schema/src/briefing.ts` validates. It is
consumed by:

- Frontend Storybook stories that need a briefing without a live DB.
- Worker tests that assert synthesizer output shape.
- Vapi prompt fixtures during development.

Keep the JSON in sync with `02_briefing_fixture.sql`. The seed test loads both and asserts that they represent the same logical briefing.
