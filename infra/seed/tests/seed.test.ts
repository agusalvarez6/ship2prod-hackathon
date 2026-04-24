import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { BriefingSectionsSchema } from "@ship2prod/schema/briefing";

const POSTGRES_TEST_URL =
  process.env["POSTGRES_TEST_URL"] ??
  "postgres://postgres:postgres@localhost:5433/postgres";

const here = dirname(fileURLToPath(import.meta.url));
const seedRoot = join(here, "..");
const migrationsDir = join(seedRoot, "migrations");
const seedDir = join(seedRoot, "seed");

const FIXTURE_BRIEFING_ID = "11111111-2222-3333-4444-555555555555";
const FIXTURE_USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FIXTURE_MEETING_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const CANONICAL_TABLES = [
  "users",
  "meetings",
  "briefings",
  "sources",
  "call_transcripts",
] as const;

// Each run gets its own schema so parallel test files do not collide on the
// shared test Postgres database.
const schemaName = `seed_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function applySqlFile(client: pg.Client, path: string): Promise<void> {
  const sql = await readFile(path, "utf8");
  await client.query(sql);
}

async function applyAllSql(client: pg.Client): Promise<void> {
  await applySqlFile(client, join(migrationsDir, "001_init.sql"));
  const seedFiles = (await readdir(seedDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of seedFiles) {
    await applySqlFile(client, join(seedDir, f));
  }
}

async function tryConnect(url: string): Promise<pg.Client | null> {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

let client: pg.Client | null = null;
let dbAvailable = false;

beforeAll(async () => {
  client = await tryConnect(POSTGRES_TEST_URL);
  if (!client) return;
  dbAvailable = true;
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}"`);
  await applyAllSql(client);
});

afterAll(async () => {
  if (client) {
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      await client.end();
    }
  }
});

describe("infra/seed SQL", () => {
  it.skipIf(!dbAvailable)("creates the five canonical InsForge tables", async () => {
    const { rows } = await client!.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = ANY($2)
       ORDER BY table_name`,
      [schemaName, [...CANONICAL_TABLES]],
    );
    const names = rows.map((r) => r.table_name).sort();
    expect(names).toEqual([...CANONICAL_TABLES].sort());
  });

  it.skipIf(!dbAvailable)(
    "seeds the canonical fixture briefing with status=ready and 11 sections",
    async () => {
      const { rows } = await client!.query<{
        id: string;
        user_id: string;
        meeting_id: string | null;
        status: string;
        sections: Record<string, unknown> | null;
        sources_count: number;
      }>(
        `SELECT id, user_id, meeting_id, status, sections, sources_count
         FROM briefings WHERE id = $1`,
        [FIXTURE_BRIEFING_ID],
      );
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.user_id).toBe(FIXTURE_USER_ID);
      expect(row.meeting_id).toBe(FIXTURE_MEETING_ID);
      expect(row.status).toBe("ready");
      expect(row.sections).not.toBeNull();
      expect(Object.keys(row.sections!)).toHaveLength(11);
      const parsed = BriefingSectionsSchema.safeParse(row.sections);
      expect(parsed.success).toBe(true);
      expect(row.sources_count).toBe(5);
    },
  );

  it.skipIf(!dbAvailable)(
    "seeds five source rows referencing the fixture briefing",
    async () => {
      const { rows } = await client!.query<{ kind: string; status: string }>(
        `SELECT kind, status FROM sources WHERE briefing_id = $1 ORDER BY id`,
        [FIXTURE_BRIEFING_ID],
      );
      expect(rows).toHaveLength(5);
      const kinds = rows.map((r) => r.kind).sort();
      expect(kinds).toEqual(
        ["company_site", "linkedin", "news", "notion_page", "pricing_page"].sort(),
      );
      const linkedin = rows.find((r) => r.kind === "linkedin");
      expect(linkedin?.status).toBe("blocked");
    },
  );

  it.skipIf(!dbAvailable)("is idempotent: re-applying seeds does not duplicate rows", async () => {
    await applyAllSql(client!);
    const { rows } = await client!.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM briefings WHERE id = $1`,
      [FIXTURE_BRIEFING_ID],
    );
    expect(rows[0]!.count).toBe("1");
  });
});

describe("infra/seed briefings.seed.json", () => {
  it("mirrors the fixture briefing row with a valid BriefingSections shape", async () => {
    const raw = await readFile(join(seedRoot, "briefings.seed.json"), "utf8");
    const mirror = JSON.parse(raw) as {
      id: string;
      userId: string;
      meetingId: string;
      status: string;
      sections: unknown;
      sourcesCount: number;
    };
    expect(mirror.id).toBe(FIXTURE_BRIEFING_ID);
    expect(mirror.userId).toBe(FIXTURE_USER_ID);
    expect(mirror.meetingId).toBe(FIXTURE_MEETING_ID);
    expect(mirror.status).toBe("ready");
    expect(mirror.sourcesCount).toBe(5);
    const parsed = BriefingSectionsSchema.safeParse(mirror.sections);
    expect(parsed.success).toBe(true);
  });
});
