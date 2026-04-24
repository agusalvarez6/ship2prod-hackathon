export const BLOCK_STRINGS = [
  'captcha',
  'blocked',
  'access denied',
  'cloudflare ray',
  'are you a human',
] as const

export function isBlocked(text: string): boolean {
  const haystack = text.toLowerCase()
  return BLOCK_STRINGS.some((needle) => haystack.includes(needle))
}

export function normalize(_input: unknown): unknown[] {
  return []
}
