import { describe, expect, it } from 'vitest'

describe('apps/web smoke', () => {
  it('dashboard page exports a component', async () => {
    const mod = await import('../src/app/page')
    expect(typeof mod.default).toBe('function')
  })

  it('briefings page exports a component', async () => {
    const mod = await import('../src/app/briefings/[briefingId]/page')
    expect(typeof mod.default).toBe('function')
  })

  it('meetings brief page exports a component', async () => {
    const mod = await import('../src/app/meetings/[meetingId]/brief/page')
    expect(typeof mod.default).toBe('function')
  })
})
