import { describe, it, expect } from 'vitest'

describe('web shell', () => {
  it('exports a Page component', async () => {
    const mod = await import('../src/app/page.js')
    expect(typeof mod.default).toBe('function')
  })
})
