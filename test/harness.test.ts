import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { REDIS_TEST_URL } from "./env.js";

describe("test harness", () => {
  describe("real Redis", () => {
    const redis = new Redis(REDIS_TEST_URL, { lazyConnect: true });

    beforeAll(async () => {
      await redis.connect();
    });

    afterAll(async () => {
      await redis.flushdb();
      redis.disconnect();
    });

    it("round-trips a SETNX on a real Redis instance", async () => {
      const key = `harness:setnx:${Date.now()}`;

      const first = await redis.set(key, "claimed", "EX", 60, "NX");
      expect(first).toBe("OK");

      const second = await redis.set(key, "stolen", "EX", 60, "NX");
      expect(second).toBeNull();

      const value = await redis.get(key);
      expect(value).toBe("claimed");
    });
  });

  describe("MSW-stubbed fetch", () => {
    const server = setupServer(
      http.post("https://api.example.test/echo", () =>
        HttpResponse.json({ pong: "canned", via: "msw" }),
      ),
    );

    beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    it("returns the canned body for a stubbed endpoint", async () => {
      const res = await fetch("https://api.example.test/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ping: "hello" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { pong: string; via: string };
      expect(body).toEqual({ pong: "canned", via: "msw" });
    });
  });
});
