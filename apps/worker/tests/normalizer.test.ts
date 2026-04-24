import { describe, expect, it } from 'vitest'
import { isBlocked } from '../src/tinyfish/normalizer.js'

describe('isBlocked', () => {
  it.each([
    ['captcha'],
    ['Captcha'],
    ['please solve the CAPTCHA'],
    ['blocked'],
    ['You are Blocked'],
    ['access denied'],
    ['Access Denied'],
    ['cloudflare ray'],
    ['Cloudflare Ray id: abc'],
    ['are you a human'],
    ['Are you a human?'],
  ])('returns true for %s', (text) => {
    expect(isBlocked(text)).toBe(true)
  })

  it.each([
    ['Sarah is the CEO of Acme'],
    ['The company ships voice agents'],
    [''],
    ['pricing page for a B2B product'],
  ])('returns false for %s', (text) => {
    expect(isBlocked(text)).toBe(false)
  })
})
