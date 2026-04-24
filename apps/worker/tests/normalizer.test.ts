import { describe, it, expect } from 'vitest'
import { BLOCK_STRINGS, isBlocked } from '../src/tinyfish/normalizer.js'

describe('isBlocked', () => {
  it('detects each block string in lowercase', () => {
    for (const needle of BLOCK_STRINGS) {
      expect(isBlocked(`prefix ${needle} suffix`)).toBe(true)
    }
  })

  it('detects each block string in uppercase', () => {
    for (const needle of BLOCK_STRINGS) {
      expect(isBlocked(`prefix ${needle.toUpperCase()} suffix`)).toBe(true)
    }
  })

  it('detects each block string in mixed case', () => {
    const mixed: Record<(typeof BLOCK_STRINGS)[number], string> = {
      captcha: 'CaPtCha',
      blocked: 'BlOcKeD',
      'access denied': 'Access Denied',
      'cloudflare ray': 'Cloudflare Ray',
      'are you a human': 'Are You A Human',
    }
    for (const needle of BLOCK_STRINGS) {
      expect(isBlocked(`x ${mixed[needle]} y`)).toBe(true)
    }
  })

  it('returns false for normal prose', () => {
    expect(isBlocked('Sarah is the CEO of Acme')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isBlocked('')).toBe(false)
  })
})
