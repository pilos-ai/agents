import { describe, it, expect, vi } from 'vitest'
import { getFlagsForTier, loadProModule, FREE_LIMITS } from './pro'

describe('getFlagsForTier', () => {
  it('returns teams flags for "teams" tier', () => {
    const flags = getFlagsForTier('teams')
    expect(flags.tier).toBe('teams')
    expect(flags.teamMode).toBe(true)
    expect(flags.teamSync).toBe(true)
    expect(flags.premiumAgents).toBe(true)
    expect(flags.maxAgents).toBe(Infinity)
  })

  it('returns pro flags for "pro" tier', () => {
    const flags = getFlagsForTier('pro')
    expect(flags.tier).toBe('pro')
    expect(flags.teamMode).toBe(true)
    expect(flags.teamSync).toBe(false)
    expect(flags.premiumAgents).toBe(true)
    expect(flags.maxAgents).toBe(Infinity)
  })

  it('returns free flags for "free" tier', () => {
    const flags = getFlagsForTier('free')
    expect(flags.tier).toBe('free')
    expect(flags.teamMode).toBe(false)
    expect(flags.teamSync).toBe(false)
    expect(flags.premiumAgents).toBe(false)
    expect(flags.maxAgents).toBe(3)
  })

  it('returns free flags for an unknown tier (default case)', () => {
    // Cast to bypass TS to exercise the default branch
    const flags = getFlagsForTier('unknown' as never)
    expect(flags.tier).toBe('free')
    expect(flags.teamMode).toBe(false)
  })

  it('returns a copy, not the same object reference', () => {
    const a = getFlagsForTier('pro')
    const b = getFlagsForTier('pro')
    expect(a).not.toBe(b)
  })

  it('FREE_LIMITS is exported and matches free tier', () => {
    const flags = getFlagsForTier('free')
    expect(flags).toEqual(FREE_LIMITS)
  })
})

describe('loadProModule', () => {
  it('returns null when @pilos/pro is not available (stubbed to throw)', async () => {
    // vitest.config.ts stubs @pilos/pro to throw — loadProModule catches and returns null
    const mod = await loadProModule()
    expect(mod).toBeNull()
  })

  it('returns the module when @pilos/pro loads successfully', async () => {
    const fakeModule = { activateLicense: vi.fn(), version: '1.0.0' }
    vi.doMock('@pilos/pro', () => fakeModule)
    // Re-import so the dynamic import inside loadProModule sees the mock
    const { loadProModule: loadFresh } = await import('./pro?v=mocked')
    const mod = await loadFresh()
    expect(mod).toEqual(fakeModule)
    vi.doUnmock('@pilos/pro')
  })
})
