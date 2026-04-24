import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { Pool } from "pg";
import type Redis from "ioredis";
import { NextRequest } from "next/server";

import {
  applyMigrations,
  openDb,
  openRedis,
  primeTestEnv,
  truncateUsers,
} from "./helpers.js";

primeTestEnv();

// Notion-specific env, primed before any module reads it.
process.env.NOTION_OAUTH_CLIENT_ID = "test-notion-client-id";
process.env.NOTION_OAUTH_CLIENT_SECRET = "test-notion-client-secret";
process.env.NOTION_OAUTH_REDIRECT_URI =
  "http://localhost:3000/api/auth/notion/callback";

// Import after env is primed so the singletons pick up the test URLs.
const { GET: startGet } = await import("../src/app/api/auth/notion/start/route.js");
const { GET: callbackGet } = await import("../src/app/api/auth/notion/callback/route.js");
const { POST: disconnectPost } = await import(
  "../src/app/api/auth/notion/disconnect/route.js"
);
const { signSession, SESSION_COOKIE } = await import("../src/lib/session.js");
const {
  NOTION_TOKEN_ENDPOINT,
  buildNotionAuthUrl,
  classifyNotionError,
  consumeNotionState,
  exchangeNotionCode,
  mintNotionState,
  notionStateKey,
} = await import("../src/lib/notion-oauth.js");
const { TransientError, PermanentError, UserInputError } = await import(
  "../src/lib/errors.js"
);

const server = setupServer();

function tokenJson(overrides: Partial<{ access_token: string; workspace_id: string }> = {}) {
  return {
    access_token: overrides.access_token ?? "secret_NOTION_TEST_TOKEN",
    token_type: "bearer",
    bot_id: "bot-123",
    workspace_id: overrides.workspace_id ?? "ws-abc",
    workspace_name: "Test Workspace",
    workspace_icon: null,
    owner: { type: "user", user: { object: "user", id: "notion-user-1" } },
    duplicated_template_id: null,
  };
}

async function seedUser(pool: Pool, id: string, email: string): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, email, google_sub) VALUES ($1, $2, $3)`,
    [id, email, `sub-${id}`],
  );
}

describe("notion-oauth helpers (pure)", () => {
  it("buildNotionAuthUrl has required params", () => {
    const url = new URL(buildNotionAuthUrl("n1"));
    expect(url.origin + url.pathname).toBe("https://api.notion.com/v1/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-notion-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("owner")).toBe("user");
    expect(url.searchParams.get("state")).toBe("n1");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/notion/callback",
    );
  });

  it("classifyNotionError: 5xx -> transient, 401/403 -> permanent, 400 -> user input", () => {
    expect(classifyNotionError(500, "boom")).toBeInstanceOf(TransientError);
    expect(classifyNotionError(429, "rate")).toBeInstanceOf(TransientError);
    expect(classifyNotionError(401, "unauthorized")).toBeInstanceOf(PermanentError);
    expect(classifyNotionError(403, "forbidden")).toBeInstanceOf(PermanentError);
    expect(classifyNotionError(400, "invalid_grant")).toBeInstanceOf(PermanentError);
    expect(classifyNotionError(400, "something_else")).toBeInstanceOf(UserInputError);
  });
});

describe("Notion OAuth routes", () => {
  let redis: Redis;
  let pool: Pool;

  const USER_ID = "cccccccc-1111-2222-3333-cccccccccccc";
  const EMAIL = "notion-user@precall.app";

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: "error" });
    redis = openRedis();
    pool = await openDb();
    await applyMigrations(pool);
  });

  afterAll(async () => {
    server.close();
    redis.disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await redis.flushdb();
    await truncateUsers(pool);
    await seedUser(pool, USER_ID, EMAIL);
  });

  afterEach(() => {
    server.resetHandlers();
  });

  async function sessionCookie(): Promise<string> {
    const jwt = await signSession({
      sub: USER_ID,
      email: EMAIL,
      name: "Notion User",
      picture: null,
    });
    return `${SESSION_COOKIE}=${jwt}`;
  }

  describe("mintNotionState + consumeNotionState", () => {
    it("stores the userId in the payload and deletes it on consume", async () => {
      const nonce = await mintNotionState(USER_ID, redis);
      expect(await redis.exists(notionStateKey(nonce))).toBe(1);

      const ttl = await redis.ttl(notionStateKey(nonce));
      expect(ttl).toBeGreaterThan(500);
      expect(ttl).toBeLessThanOrEqual(600);

      const consumed = await consumeNotionState(nonce, redis);
      expect(consumed?.userId).toBe(USER_ID);
      expect(typeof consumed?.createdAt).toBe("number");

      // Single use.
      expect(await consumeNotionState(nonce, redis)).toBeNull();
    });

    it("returns null for an unknown nonce", async () => {
      expect(await consumeNotionState("unknown", redis)).toBeNull();
    });

    it("returns null when the stored payload has no userId (malformed)", async () => {
      await redis.set(notionStateKey("raw"), JSON.stringify({ createdAt: 1 }), "EX", 60);
      expect(await consumeNotionState("raw", redis)).toBeNull();
    });
  });

  describe("exchangeNotionCode", () => {
    it("POSTs JSON with HTTP Basic auth and returns the parsed token response", async () => {
      let seenAuth: string | undefined;
      let seenBody: string | undefined;
      server.use(
        http.post(NOTION_TOKEN_ENDPOINT, async ({ request }) => {
          seenAuth = request.headers.get("authorization") ?? undefined;
          seenBody = await request.text();
          return HttpResponse.json(tokenJson());
        }),
      );

      const result = await exchangeNotionCode("auth-code-123");
      expect(result.access_token).toBe("secret_NOTION_TEST_TOKEN");
      expect(result.bot_id).toBe("bot-123");
      expect(result.workspace_id).toBe("ws-abc");

      const expectedBasic = Buffer.from(
        "test-notion-client-id:test-notion-client-secret",
      ).toString("base64");
      expect(seenAuth).toBe(`Basic ${expectedBasic}`);

      const body = JSON.parse(seenBody!);
      expect(body.grant_type).toBe("authorization_code");
      expect(body.code).toBe("auth-code-123");
      expect(body.redirect_uri).toBe("http://localhost:3000/api/auth/notion/callback");
    });

    it("throws PermanentError on 401 from Notion", async () => {
      server.use(
        http.post(NOTION_TOKEN_ENDPOINT, () =>
          HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
        ),
      );
      await expect(exchangeNotionCode("c")).rejects.toBeInstanceOf(PermanentError);
    });

    it("throws TransientError on 502 from Notion", async () => {
      server.use(
        http.post(NOTION_TOKEN_ENDPOINT, () => HttpResponse.text("upstream", { status: 502 })),
      );
      await expect(exchangeNotionCode("c")).rejects.toBeInstanceOf(TransientError);
    });

    it("throws PermanentError when Notion returns 200 but no access_token", async () => {
      server.use(
        http.post(NOTION_TOKEN_ENDPOINT, () =>
          HttpResponse.json({ bot_id: "b", workspace_id: "w" }),
        ),
      );
      await expect(exchangeNotionCode("c")).rejects.toBeInstanceOf(PermanentError);
    });
  });

  describe("GET /api/auth/notion/start", () => {
    it("returns 401 when the caller has no session", async () => {
      const res = await startGet(new NextRequest("http://localhost:3000/api/auth/notion/start"));
      expect(res.status).toBe(401);
    });

    it("302s to Notion with a Redis-backed nonce keyed to the session user", async () => {
      const cookie = await sessionCookie();
      const req = new NextRequest("http://localhost:3000/api/auth/notion/start", {
        headers: { cookie },
      });
      const res = await startGet(req);

      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location")!);
      expect(location.origin + location.pathname).toBe(
        "https://api.notion.com/v1/oauth/authorize",
      );
      expect(location.searchParams.get("client_id")).toBe("test-notion-client-id");
      expect(location.searchParams.get("owner")).toBe("user");

      const nonce = location.searchParams.get("state")!;
      expect(nonce.length).toBeGreaterThan(30);

      const stored = await redis.get(notionStateKey(nonce));
      expect(stored).not.toBeNull();
      const payload = JSON.parse(stored!);
      expect(payload.userId).toBe(USER_ID);
    });
  });

  describe("GET /api/auth/notion/callback", () => {
    async function startAndGetNonce(cookie: string): Promise<string> {
      const res = await startGet(
        new NextRequest("http://localhost:3000/api/auth/notion/start", {
          headers: { cookie },
        }),
      );
      return new URL(res.headers.get("location")!).searchParams.get("state")!;
    }

    it("exchanges code, stores token on users.notion_token, redirects /dashboard?notionConnected=1", async () => {
      let tokenCalls = 0;
      server.use(
        http.post(NOTION_TOKEN_ENDPOINT, () => {
          tokenCalls++;
          return HttpResponse.json(tokenJson());
        }),
      );

      const cookie = await sessionCookie();
      const nonce = await startAndGetNonce(cookie);

      const req = new NextRequest(
        `http://localhost:3000/api/auth/notion/callback?code=code-1&state=${nonce}`,
        { headers: { cookie } },
      );
      const res = await callbackGet(req);

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/dashboard?notionConnected=1",
      );
      expect(tokenCalls).toBe(1);

      const { rows } = await pool.query<{ notion_token: string | null }>(
        "SELECT notion_token FROM users WHERE id = $1",
        [USER_ID],
      );
      expect(rows[0]!.notion_token).toBe("secret_NOTION_TEST_TOKEN");

      // Nonce is single-use.
      expect(await redis.exists(notionStateKey(nonce))).toBe(0);
    });

    it("returns 400 when state is missing from Redis (replay or unknown)", async () => {
      const cookie = await sessionCookie();
      const req = new NextRequest(
        "http://localhost:3000/api/auth/notion/callback?code=c&state=bogus",
        { headers: { cookie } },
      );
      const res = await callbackGet(req);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("state_missing");
    });

    it("redirects with code_exchange_failed when Notion rejects the code", async () => {
      server.use(
        http.post(NOTION_TOKEN_ENDPOINT, () =>
          HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
        ),
      );

      const cookie = await sessionCookie();
      const nonce = await startAndGetNonce(cookie);

      const res = await callbackGet(
        new NextRequest(
          `http://localhost:3000/api/auth/notion/callback?code=c&state=${nonce}`,
          { headers: { cookie } },
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/dashboard?notionError=code_exchange_failed",
      );

      const { rows } = await pool.query<{ notion_token: string | null }>(
        "SELECT notion_token FROM users WHERE id = $1",
        [USER_ID],
      );
      expect(rows[0]!.notion_token).toBeNull();
    });

    it("redirects with session_mismatch if the session userId != state userId", async () => {
      const otherId = "dddddddd-1111-2222-3333-dddddddddddd";
      await seedUser(pool, otherId, "other@precall.app");

      // Mint state as the *first* user.
      const firstCookie = await sessionCookie();
      const nonce = await startAndGetNonce(firstCookie);

      // Swap to a different user's session.
      const otherJwt = await signSession({
        sub: otherId,
        email: "other@precall.app",
        name: null,
        picture: null,
      });
      const otherCookie = `${SESSION_COOKIE}=${otherJwt}`;

      const res = await callbackGet(
        new NextRequest(
          `http://localhost:3000/api/auth/notion/callback?code=c&state=${nonce}`,
          { headers: { cookie: otherCookie } },
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/dashboard?notionError=session_mismatch",
      );
    });

    it("forwards Notion's error param when the user cancels", async () => {
      const res = await callbackGet(
        new NextRequest(
          "http://localhost:3000/api/auth/notion/callback?error=access_denied",
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3000/dashboard?notionError=access_denied",
      );
    });
  });

  describe("POST /api/auth/notion/disconnect", () => {
    it("returns 401 when the caller has no session", async () => {
      const res = await disconnectPost(
        new NextRequest("http://localhost:3000/api/auth/notion/disconnect", {
          method: "POST",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("nulls notion_token and returns 204", async () => {
      await pool.query(`UPDATE users SET notion_token = $1 WHERE id = $2`, [
        "secret_LIVE",
        USER_ID,
      ]);

      const cookie = await sessionCookie();
      const res = await disconnectPost(
        new NextRequest("http://localhost:3000/api/auth/notion/disconnect", {
          method: "POST",
          headers: { cookie },
        }),
      );
      expect(res.status).toBe(204);

      const { rows } = await pool.query<{ notion_token: string | null }>(
        "SELECT notion_token FROM users WHERE id = $1",
        [USER_ID],
      );
      expect(rows[0]!.notion_token).toBeNull();
    });
  });
});
