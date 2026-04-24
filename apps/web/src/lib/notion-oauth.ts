import crypto from "node:crypto";
import { PermanentError, TransientError, UserInputError } from "./errors.js";
import { getNotionEnv } from "./notion-env.js";
import { getRedis } from "./redis.js";

export const NOTION_AUTH_ENDPOINT = "https://api.notion.com/v1/oauth/authorize";
export const NOTION_TOKEN_ENDPOINT = "https://api.notion.com/v1/oauth/token";

const STATE_TTL_SECONDS = 600;

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

/** Redis key for a CSRF state nonce. Distinct namespace from the gcal flow. */
export function notionStateKey(nonce: string): string {
  return `oauth:notion:state:${nonce}`;
}

/**
 * Mints a 32-byte base64url nonce and stores it in Redis under a Notion-
 * specific namespace with a 10-minute TTL. Stores the owning user id in the
 * payload so the callback can correlate the grant back to a session even if
 * the user's session cookie was rotated in the interim.
 */
export async function mintNotionState(
  userId: string,
  redis = getRedis(),
): Promise<string> {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const payload = JSON.stringify({ userId, createdAt: Date.now() });
  await redis.set(notionStateKey(nonce), payload, "EX", STATE_TTL_SECONDS);
  return nonce;
}

/**
 * Atomically reads and deletes a state nonce. Returns the stored payload or
 * `null` if the nonce is unknown, expired, or already consumed.
 */
export async function consumeNotionState(
  nonce: string,
  redis = getRedis(),
): Promise<{ userId: string; createdAt: number } | null> {
  const raw = await redis.getdel(notionStateKey(nonce));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: unknown; createdAt?: unknown };
    if (typeof parsed.userId !== "string") return null;
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now();
    return { userId: parsed.userId, createdAt };
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
