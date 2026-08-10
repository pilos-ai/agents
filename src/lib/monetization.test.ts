import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock is hoisted, so the mock factory cannot close over module-level
// variables — build the fns inside and pull them back out afterwards.
vi.mock('../api', () => ({
  api: {
    settings: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) },
  },
}))

import { api } from '../api'

const settingsGet = api.settings.get as unknown as ReturnType<typeof vi.fn>
const settingsSet = api.settings.set as unknown as ReturnType<typeof vi.fn>

import {
  MONETIZATION_SETTING_KEY,
  isMonetizationEnabled,
  resolveMonetization,
  setMonetizationEnabledValue,
} from './monetization'

const originalFetch = global.fetch

function mockFetch(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({ ok, json: async () => body }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
  settingsGet.mockResolvedValue(null)
  setMonetizationEnabledValue(false)
})

afterEach(() => {
  global.fetch = originalFetch
  setMonetizationEnabledValue(false)
})

describe('monetization kill switch', () => {
  it('defaults to off — Pilos ships free', () => {
    expect(isMonetizationEnabled()).toBe(false)
  })

  it('takes the value from the server', async () => {
    mockFetch({ monetizationEnabled: true })
    await expect(resolveMonetization()).resolves.toBe(true)
    expect(isMonetizationEnabled()).toBe(true)
  })

  it('caches the server value locally so the next launch is correct offline', async () => {
    mockFetch({ monetizationEnabled: true })
    await resolveMonetization()
    expect(settingsSet).toHaveBeenCalledWith(MONETIZATION_SETTING_KEY, true)
  })

  it('falls back to the cached setting when the server is unreachable', async () => {
    settingsGet.mockResolvedValue(true)
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    await expect(resolveMonetization()).resolves.toBe(true)
  })

  it('never paywalls a free user because of a network blip', async () => {
    // Nothing cached, server unreachable → must stay free, not fail closed.
    settingsGet.mockResolvedValue(null)
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    await expect(resolveMonetization()).resolves.toBe(false)
  })

  it('ignores a malformed server payload', async () => {
    settingsGet.mockResolvedValue(true)
    mockFetch({ monetizationEnabled: 'yes please' })
    // Non-boolean is discarded; the cached setting stands.
    await expect(resolveMonetization()).resolves.toBe(true)
  })

  it('ignores a non-OK response', async () => {
    mockFetch({ monetizationEnabled: true }, false)
    await expect(resolveMonetization()).resolves.toBe(false)
  })
})
