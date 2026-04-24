import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { PermanentError, TransientError, UserInputError } from "./errors.js";
import { getNotionEnv } from "./notion-env.js";
import { getEnv } from "./env.js";

export const NOTION_AUTH_ENDPOINT = "https://api.notion.com/v1/oauth/authorize";
export const NOTION_TOKEN_ENDPOINT = "https://api.notion.com/v1/oauth/token";

const STATE_TTL_SECONDS = 600;
const STATE_AUDIENCE = "oauth:state:notion";

function stateSecret(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_JWT_SECRET);
}

export interface NotionTokenResponse {
  access_token: string;
  token_type: "bearer";
  bot_id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  owner: NotionOwner;
  duplicated_template_id: string | null;
}

export type NotionOwner =
  | {
      type: "user";
      user: {
        object: "user";
        id: string;
        name?: string | null;
        avatar_url?: string | null;
        type?: string;
        person?: { email?: string };
      };
    }
  | { type: "workspace"; workspace: true };

/**
 * Mints an HS256-signed JWT carrying a 32-byte nonce, the owning user id,
 * and a creation timestamp. The JWT itself is the OAuth `state` value, so
 * no server-side store is needed.
 */
export async function mintNotionState(userId: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(32).toString("base64url");
  return await new SignJWT({ nonce, userId, createdAt: Date.now() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + STATE_TTL_SECONDS)
    .setAudience(STATE_AUDIENCE)
    .sign(stateSecret());
}

/**
 * Verifies the state JWT signature, expiry, and audience. Returns the
 * `{userId, createdAt}` payload, or `null` on tampering or expiry.
 */
export async function consumeNotionState(
  state: string,
): Promise<{ userId: string; createdAt: number } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret(), {
      audience: STATE_AUDIENCE,
    });
    if (typeof payload.userId !== "string") return null;
    const createdAt =
      typeof payload.createdAt === "number" ? payload.createdAt : Date.now();
    return { userId: payload.userId, createdAt };
  } catch {
    return null;
  }
}

/**
 * Builds the Notion consent URL. `state` must already be persisted in Redis
 * via `mintNotionState`. `owner=user` restricts the flow to per-user tokens
 * rather than workspace-level bot installs.
 */
export function buildNotionAuthUrl(state: string, env = getNotionEnv()): string {
  const params = new URLSearchParams({
    client_id: env.NOTION_OAUTH_CLIENT_ID,
    redirect_uri: env.NOTION_OAUTH_REDIRECT_URI,
    response_type: "code",
    owner: "user",
    state,
  });
  return `${NOTION_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Classifies a Notion API failure. 408/429/5xx → transient. 401/403 and any
 * body containing `unauthorized` or `invalid_grant` → permanent (caller must
 * force re-consent). Other 4xx → user-input.
 */
export function classifyNotionError(
  status: number,
  reasonOrBody: string | undefined,
): TransientError | PermanentError | UserInputError {
  const reason = (reasonOrBody ?? "").toLowerCase();

  if (status === 408 || status === 429 || (status >= 500 && status < 600)) {
    return new TransientError(`notion transient ${status}`, status);
  }

  if (
    status === 401 ||
    status === 403 ||
    reason.includes("unauthorized") ||
    reason.includes("invalid_grant") ||
    reason.includes("invalid_client")
  ) {
    return new PermanentError(`notion auth invalid: ${reason || status}`, status);
  }

  if (status >= 400 && status < 500) {
    return new UserInputError(`notion rejected request: ${reason || status}`, status);
  }

  return new PermanentError(`notion unexpected status ${status}`, status);
}

/**
 * Exchange an authorization code for a long-lived access token. Notion
 * requires HTTP Basic auth on this endpoint (base64 of `client_id:client_secret`).
 */
export async function exchangeNotionCode(
  code: string,
  env = getNotionEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<NotionTokenResponse> {
  const basic = Buffer.from(
    `${env.NOTION_OAUTH_CLIENT_ID}:${env.NOTION_OAUTH_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetchImpl(NOTION_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${basic}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.NOTION_OAUTH_REDIRECT_URI,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw classifyNotionError(res.status, text);
  }

  let parsed: NotionTokenResponse;
  try {
    parsed = JSON.parse(text) as NotionTokenResponse;
  } catch {
    throw new PermanentError("notion returned non-JSON token response", res.status);
  }

  if (!parsed.access_token || !parsed.bot_id || !parsed.workspace_id) {
    throw new PermanentError("notion token response missing required fields", res.status);
  }
  return parsed;
}
