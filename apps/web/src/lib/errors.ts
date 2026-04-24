/**
 * Minimal local error classes. We mirror the shape of the shared
 * `@ship2prod/errors` package but keep these app-local so route handlers
 * can throw directly without constructing `Result` envelopes.
 */

export class TransientError extends Error {
  readonly kind = "transient" as const;
  readonly status: number;
  readonly retryAfterMs?: number;
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class UserInputError extends Error {
  readonly kind = "user_input" as const;
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export class PermanentError extends Error {
  readonly kind = "permanent" as const;
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Classifies a Google API failure. 408/429/5xx → transient. `invalid_grant`
 * and 401 are permanent and require the caller to force re-consent.
 * Everything else with a 4xx status is user-input.
 */
export function classifyGoogleError(
  status: number,
  reasonOrBody: string | undefined,
): TransientError | PermanentError | UserInputError {
  const reason = (reasonOrBody ?? "").toLowerCase();

  if (status === 408 || status === 429 || (status >= 500 && status < 600)) {
    return new TransientError(`google transient ${status}`, status);
  }

  if (status === 401 || reason.includes("invalid_grant") || reason.includes("invalid_token")) {
    return new PermanentError(`google auth invalid: ${reason || status}`, status);
  }

  if (status >= 400 && status < 500) {
    return new UserInputError(`google rejected request: ${reason || status}`, status);
  }

  return new PermanentError(`google unexpected status ${status}`, status);
}

/**
 * Full-jitter exponential backoff. Local implementation so the route
 * handlers can retry Google calls without dragging in the `Result`-based
 * helper from `@ship2prod/errors` (the factored signatures differ).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; capMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 500;
  const capMs = opts.capMs ?? 5_000;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const isTransient = err instanceof TransientError;
      if (attempt > retries || !isTransient) throw err;
      const hinted = err.retryAfterMs ?? 0;
      const expo = Math.min(capMs, baseMs * 2 ** (attempt - 1));
      const jitter = Math.random() * expo;
      const delay = Math.max(hinted, jitter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
