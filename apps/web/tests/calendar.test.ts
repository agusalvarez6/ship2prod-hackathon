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
  seedUser,
  truncateUsers,
} from "./helpers.js";

primeTestEnv();

const { GET: eventsGet, POST: eventsPost } = await import("../src/app/api/calendar/events/route.js");
const { signSession, SESSION_COOKIE } = await import("../src/lib/session.js");

const server = setupServer();

const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function calendarItem(overrides: Partial<{ id: string; summary: string; start: string; end: string }> = {}) {
  return {
    id: overrides.id ?? "evt-1",
    summary: overrides.summary ?? "Sync",
    start: { dateTime: overrides.start ?? "2026-04-25T17:00:00Z", timeZone: "UTC" },
    end: { dateTime: overrides.end ?? "2026-04-25T17:30:00Z", timeZone: "UTC" },
    htmlLink: "https://calendar.google.com/event?eid=evt-1",
    attendees: [{ email: "someone@test.com", displayName: "Someone" }],
  };
}

describe("GET /api/calendar/events", () => {
  let redis: Redis;
  let pool: Pool;
  let userId: string;
  let sessionCookie: string;

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

    userId = await seedUser(pool, {
      email: "cal@test.com",
      googleSub: "sub-cal-1",
      refreshToken: "1//REFRESH",
      accessToken: "ya29.FRESH",
      // Fresh enough (not within safety margin).
      accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000),
      displayName: "Cal Test",
      pictureUrl: null,
    });

    const token = await signSession({
      sub: userId,
      email: "cal@test.com",
      name: "Cal Test",
      picture: null,
    });
    sessionCookie = `${SESSION_COOKIE}=${token}`;
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it("returns 401 when no session cookie is present", async () => {
    const res = await eventsGet(new NextRequest("http://localhost:3000/api/calendar/events"));
    expect(res.status).toBe(401);
  });

  it("returns mapped events when the stored access token is fresh", async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(GOOGLE_EVENTS_URL, ({ request }) => {
        authHeader = request.headers.get("authorization");
        return HttpResponse.json({
          items: [calendarItem(), calendarItem({ id: "evt-2", summary: "Pitch", start: "2026-04-26T14:00:00Z", end: "2026-04-26T14:30:00Z" })],
        });
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/calendar/events", {
      headers: { cookie: sessionCookie },
    });
    const res = await eventsGet(req);
    expect(res.status).toBe(200);
    expect(authHeader).toBe("Bearer ya29.FRESH");

    const body = (await res.json()) as { events: { id: string; title: string }[] };
    expect(body.events).toHaveLength(2);
    expect(body.events[0]!.id).toBe("evt-1");
    expect(body.events[0]!.title).toBe("Sync");
    expect(body.events[1]!.id).toBe("evt-2");
  });

  it("refreshes an expired access token before calling Google Calendar", async () => {
    await pool.query(
      `UPDATE users SET google_access_token=$1, google_access_token_expires_at=$2 WHERE id=$3`,
      ["ya29.STALE", new Date(Date.now() - 60_000).toISOString(), userId],
    );

    let refreshBody: string | null = null;
    let seenAuth: string | null = null;
    server.use(
      http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
        refreshBody = await request.text();
        return HttpResponse.json({
          access_token: "ya29.NEWLY-MINTED",
          expires_in: 3600,
          scope: "openid email profile https://www.googleapis.com/auth/calendar",
          token_type: "Bearer",
        });
      }),
      http.get(GOOGLE_EVENTS_URL, ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json({ items: [calendarItem()] });
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/calendar/events", {
      headers: { cookie: sessionCookie },
    });
    const res = await eventsGet(req);
    expect(res.status).toBe(200);
    expect(refreshBody).not.toBeNull();
    expect(refreshBody!).toContain("grant_type=refresh_token");
    expect(refreshBody!).toContain("refresh_token=1%2F%2FREFRESH");
    expect(seenAuth).toBe("Bearer ya29.NEWLY-MINTED");

    const { rows } = await pool.query<{ google_access_token: string }>(
      "SELECT google_access_token FROM users WHERE id=$1",
      [userId],
    );
    expect(rows[0]!.google_access_token).toBe("ya29.NEWLY-MINTED");
  });
});

describe("POST /api/calendar/events", () => {
  let redis: Redis;
  let pool: Pool;
  let userId: string;
  let sessionCookie: string;

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
    userId = await seedUser(pool, {
      email: "post@test.com",
      googleSub: "sub-post-1",
      refreshToken: "1//REFRESH",
      accessToken: "ya29.FRESH",
      accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000),
      displayName: "Post Test",
      pictureUrl: null,
    });
    const token = await signSession({
      sub: userId,
      email: "post@test.com",
      name: "Post Test",
      picture: null,
    });
    sessionCookie = `${SESSION_COOKIE}=${token}`;
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it("returns 401 without a session", async () => {
    const res = await eventsPost(
      new NextRequest("http://localhost:3000/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "t", startsAt: new Date().toISOString(), durationMinutes: 30 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 422 on invalid payload", async () => {
    const res = await eventsPost(
      new NextRequest("http://localhost:3000/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ title: "" }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("inserts the event on Google with summary + start/end and returns the trimmed event", async () => {
    let receivedBody: { summary?: string; start?: { dateTime?: string; timeZone?: string }; end?: { dateTime?: string; timeZone?: string } } | null = null;
    server.use(
      http.post(GOOGLE_EVENTS_URL, async ({ request }) => {
        receivedBody = (await request.json()) as typeof receivedBody;
        return HttpResponse.json({
          id: "evt-created",
          summary: receivedBody?.summary ?? "",
          start: receivedBody?.start,
          end: receivedBody?.end,
          htmlLink: "https://calendar.google.com/event?eid=evt-created",
          attendees: [],
        });
      }),
    );

    const startsAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const res = await eventsPost(
      new NextRequest("http://localhost:3000/api/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ title: "PreCall test event", startsAt, durationMinutes: 30, timeZone: "America/Los_Angeles" }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { event: { id: string; title: string; htmlLink: string | null } };
    expect(body.event.id).toBe("evt-created");
    expect(body.event.title).toBe("PreCall test event");
    expect(body.event.htmlLink).toBe("https://calendar.google.com/event?eid=evt-created");

    expect(receivedBody).not.toBeNull();
    expect(receivedBody!.summary).toBe("PreCall test event");
    expect(receivedBody!.start?.timeZone).toBe("America/Los_Angeles");
    expect(receivedBody!.end?.timeZone).toBe("America/Los_Angeles");
    const startMs = new Date(receivedBody!.start!.dateTime!).getTime();
    const endMs = new Date(receivedBody!.end!.dateTime!).getTime();
    expect(endMs - startMs).toBe(30 * 60_000);
  });
});
