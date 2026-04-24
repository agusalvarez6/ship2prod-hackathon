# @ship2prod/errors

Shared error primitives for the PreCall stack.

- `AppError` — discriminated union keyed on `kind`: `validation`, `not_found`, `upstream`, `conflict`, `internal`.
- `Result<T, E = AppError>` — tagged union plus `ok` / `err` helpers. Functions return `Result`; they do not throw for expected failures.
- `isTransient(e)` — classifies `upstream` errors with status `408`, `429`, or `5xx` as transient.
- `withRetry(op, opts)` — exponential backoff with jitter; honors `Retry-After` when upstream sets `retryAfterMs`; caps per-attempt delay at `capMs`.
- `TransientError`, `PermanentError`, `UserInputError` — thin `Error` subclasses for callers that prefer throw/catch. Each exposes `toAppError()`.

See `.claude/skills/errors/SKILL.md` for the full doctrine.

## Usage

```ts
import { withRetry, ok, err, type AppError } from '@ship2prod/errors'

const result = await withRetry(async () => {
  const res = await fetch('https://api.tinyfish.ai/extract')
  if (!res.ok) {
    const retryAfter = res.headers.get('retry-after')
    const e: AppError = retryAfter
      ? {
          kind: 'upstream',
          service: 'tinyfish',
          status: res.status,
          retryAfterMs: Number(retryAfter) * 1000,
        }
      : { kind: 'upstream', service: 'tinyfish', status: res.status }
    return err(e)
  }
  return ok(await res.json())
})
```
