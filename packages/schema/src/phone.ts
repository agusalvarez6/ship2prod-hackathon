const E164_RE = /^\+[1-9]\d{7,14}$/

export function normalizePhoneNumberE164(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed || /[A-Za-z]/.test(trimmed)) return null

  const digits = trimmed.replace(/\D/g, '')
  const normalized = trimmed.startsWith('+')
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith('1')
        ? `+${digits}`
        : null

  if (!normalized || !E164_RE.test(normalized)) return null
  return normalized
}
