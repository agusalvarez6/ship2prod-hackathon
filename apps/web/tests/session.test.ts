import { describe, it, expect } from "vitest";
import { signSession, verifySession, buildSessionCookie, buildClearSessionCookie, SESSION_COOKIE } from "../src/lib/session.js";

const SECRET = "0123456789abcdef0123456789abcdef-dev-test-secret";
const OTHER_SECRET = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-other";

describe("session JWT", () => {
  it("round-trips sub, email, name, picture", async () => {
    const token = await signSession(
      { sub: "user-1", email: "a@b.com", name: "Ada", picture: "https://img" },
      { secret: SECRET },
    );
    const verified = await verifySession(token, { secret: SECRET });
    expect(verified.sub).toBe("user-1");
    expect(verified.email).toBe("a@b.com");
    expect(verified.name).toBe("Ada");
    expect(verified.picture).toBe("https://img");
    expect(verified.iat).toBeTypeOf("number");
    expect(verified.exp).toBeGreaterThan(verified.iat);
  });

  it("accepts null name and picture", async () => {
    const token = await signSession(
      { sub: "user-2", email: "z@z.com", name: null, picture: null },
      { secret: SECRET },
    );
    const verified = await verifySession(token, { secret: SECRET });
    expect(verified.name).toBeNull();
    expect(verified.picture).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(
      { sub: "user-3", email: "z@z.com", name: null, picture: null },
      { secret: SECRET },
    );
    await expect(verifySession(token, { secret: OTHER_SECRET })).rejects.toThrow();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession(
      { sub: "user-4", email: "z@z.com", name: null, picture: null },
      { secret: SECRET },
    );
    const parts = token.split(".");
    const fakePayload = Buffer.from(JSON.stringify({ sub: "attacker", email: "x@x" })).toString("base64url");
    const tampered = [parts[0], fakePayload, parts[2]].join(".");
    await expect(verifySession(tampered, { secret: SECRET })).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signSession(
      { sub: "user-5", email: "z@z.com", name: null, picture: null },
      { secret: SECRET, expiresInSec: -10 },
    );
    await expect(verifySession(token, { secret: SECRET })).rejects.toThrow();
  });

  it("builds a session cookie with HttpOnly, SameSite=Lax, Path=/, 7-day Max-Age", () => {
    const header = buildSessionCookie("abc.def.ghi");
    expect(header).toContain(`${SESSION_COOKIE}=abc.def.ghi`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=604800");
  });

  it("omits Secure in non-production environments", () => {
    const prev = process.env.NODE_ENV;
    (process.env as unknown as Record<string, string>).NODE_ENV = "development";
    try {
      const header = buildSessionCookie("abc");
      expect(header).not.toContain("Secure");
    } finally {
      (process.env as unknown as Record<string, string | undefined>).NODE_ENV = prev;
    }
  });

  it("includes Secure when NODE_ENV=production", () => {
    const prev = process.env.NODE_ENV;
    (process.env as unknown as Record<string, string>).NODE_ENV = "production";
    try {
      const header = buildSessionCookie("abc");
      expect(header).toContain("Secure");
    } finally {
      (process.env as unknown as Record<string, string | undefined>).NODE_ENV = prev;
    }
  });

  it("buildClearSessionCookie emits Max-Age=0 with empty value", () => {
    const header = buildClearSessionCookie();
    expect(header).toContain(`${SESSION_COOKIE}=`);
    expect(header).toContain("Max-Age=0");
  });
});
