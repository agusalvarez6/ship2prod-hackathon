import { describe, expect, it } from 'vitest'

import { normalizePhoneNumberE164 } from '../src/phone.js'

describe('normalizePhoneNumberE164', () => {
  it('normalizes common US phone number input to E.164', () => {
    expect(normalizePhoneNumberE164('(415) 555-2671')).toBe('+14155552671')
    expect(normalizePhoneNumberE164('1-415-555-2671')).toBe('+14155552671')
    expect(normalizePhoneNumberE164('+1 415 555 2671')).toBe('+14155552671')
  })

  it('rejects missing, ambiguous, and vanity input', () => {
    expect(normalizePhoneNumberE164('')).toBeNull()
    expect(normalizePhoneNumberE164('555-2671')).toBeNull()
    expect(normalizePhoneNumberE164('1-800-PRECALL')).toBeNull()
  })
})
