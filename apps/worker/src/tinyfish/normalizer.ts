import type { SourceKind } from '@ship2prod/schema/source'

export const BLOCK_STRINGS = [
  'captcha',
  'blocked',
  'access denied',
  'cloudflare ray',
  'are you a human',
] as const

const MAX_TEXT_LEN = 4000

const NEWS_HOST_PATTERNS = [
  'news',
  'nytimes',
  'bloomberg',
  'wsj',
  'techcrunch',
  'reuters',
  'forbes',
  'ft.com',
  'cnbc',
  'theinformation',
  'businesswire',
  'prnewswire',
]

export function isBlocked(text: string): boolean {
  const haystack = text.toLowerCase()
  return BLOCK_STRINGS.some((needle) => haystack.includes(needle))
}

export interface NormalizerInput {
  url: string
  text: string
  blocked: boolean
}

export interface NormalizedSource {
  url: string
  kind: SourceKind
  text: string
}

function inferKind(url: string): SourceKind {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'other'
  }
  if (host.includes('linkedin.com')) return 'linkedin'
  if (NEWS_HOST_PATTERNS.some((p) => host.includes(p))) return 'news'
  return 'company_site'
}

export function normalize(input: NormalizerInput): NormalizedSource | null {
  if (input.blocked) return null
  if (isBlocked(input.text)) return null

  const cleaned = input.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LEN)
  if (cleaned.length === 0) return null

  return {
    url: input.url,
    kind: inferKind(input.url),
    text: cleaned,
  }
}
