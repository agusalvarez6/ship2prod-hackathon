const BLOCK_STRINGS = [
  'captcha',
  'blocked',
  'access denied',
  'cloudflare ray',
  'are you a human',
] as const

export function isBlocked(text: string): boolean {
  const lower = text.toLowerCase()
  return BLOCK_STRINGS.some((s) => lower.includes(s))
}

export function normalize(_input: unknown): [] {
  return []
}
