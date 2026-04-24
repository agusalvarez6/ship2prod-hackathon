import type { AppError } from './AppError.js'

export function isTransient(e: AppError): boolean {
  if (e.kind !== 'upstream') return false
  const { status } = e
  return status === 408 || status === 429 || (status >= 500 && status < 600)
}
