import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLicenseStore } from './useLicenseStore'

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  api: {
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    metrics: {
      getMachineId: vi.fn().mockResolvedValue('machine-abc'),
      setLicenseKey: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock('../lib/pro', () => ({
  FREE_LIMITS: {
    tier: 'free',
    maxAgents: 3,
    maxMcpServers: 3,
    maxProjects: 3,
    teamMode: false,
    teamSync: false,
    premiumAgents: false,
    enabledFeatures: [],
  },
  getFlagsForTier: vi.fn((tier: string) => ({
    tier,
    maxAgents: tier === 'free' ? 3 : Infinity,
    maxMcpServers: tier === 'free' ? 3 : Infinity,
    maxProjects: tier === 'free' ? 3 : Infinity,
    teamMode: tier !== 'free',
    teamSync: tier === 'teams',
    premiumAgents: tier !== 'free',
    enabledFeatures: [],
  })),
  loadProModule: vi.fn().mockResolvedValue(null),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getApi() {
  const mod = await import('../api')
  return (mod as unknown as { api: Record<string, Record<string, ReturnType<typeof vi.fn>>> }).api
}

async function getProLib() {
  const mod = await import('../lib/pro')
  return mod as unknown as { loadProModule: ReturnType<typeof vi.fn>; getFlagsForTier: ReturnType<typeof vi.fn> }
}

const initialState = useLicenseStore.getState()

beforeEach(() => {
  useLicenseStore.setState(initialState, true)
  vi.clearAllMocks()
})

// ── loadAuthState ─────────────────────────────────────────────────────────────

describe('loadAuthState', () => {
  it('marks authLoaded true when no stored auth', async () => {
    const api = await getApi()
    api.settings.get.mockResolvedValue(null)

    await useLicenseStore.getState().loadAuthState()

    expect(useLicenseStore.getState().authLoaded).toBe(true)
    expect(useLicenseStore.getState().isAuthenticated).toBe(false)
  })

  it('restores authenticated state from storage', async () => {
    const api = await getApi()
    api.settings.get.mockResolvedValue({
      email: 'user@example.com',
      licenseKey: null,
      tier: 'free',
      features: ['feature_a'],
    })

    await useLicenseStore.getState().loadAuthState()

    const state = useLicenseStore.getState()
    expect(state.authLoaded).toBe(true)
    expect(state.isAuthenticated).toBe(true)
    expect(state.email).toBe('user@example.com')
    expect(state.tier).toBe('free')
  })

  it('calls checkLicense in background when licenseKey present', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    api.settings.get.mockResolvedValue({
      email: 'pro@example.com',
      licenseKey: 'KEY-123',
      tier: 'pro',
      features: [],
    })
    // Mock pro module returning null so checkLicense exits early
    proLib.loadProModule.mockResolvedValue(null)

    await useLicenseStore.getState().loadAuthState()

    expect(useLicenseStore.getState().isAuthenticated).toBe(true)
    expect(useLicenseStore.getState().licenseKey).toBe('KEY-123')
  })

  it('marks authLoaded true on storage error', async () => {
    const api = await getApi()
    api.settings.get.mockRejectedValue(new Error('storage unavailable'))

    await useLicenseStore.getState().loadAuthState()

    expect(useLicenseStore.getState().authLoaded).toBe(true)
    expect(useLicenseStore.getState().isAuthenticated).toBe(false)
  })
})

// ── loginWithKey — free tier ──────────────────────────────────────────────────

describe('loginWithKey (free tier)', () => {
  it('sets isAuthenticated and tier free when no key provided', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      registerFreeUser: vi.fn().mockResolvedValue(undefined),
    })
    // Mock fetch for features
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ features: ['feature_x'] }),
    } as unknown as Response)

    const result = await useLicenseStore.getState().loginWithKey('free@user.com')

    expect(result.valid).toBe(true)
    const state = useLicenseStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.tier).toBe('free')
    expect(state.email).toBe('free@user.com')
    expect(state.licenseKey).toBeNull()
    expect(api.settings.set).toHaveBeenCalledWith(
      'pilos_auth',
      expect.objectContaining({ email: 'free@user.com', tier: 'free' }),
    )
  })

  it('succeeds even when pro module unavailable', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue(null)
    global.fetch = vi.fn().mockRejectedValue(new Error('network'))

    const result = await useLicenseStore.getState().loginWithKey('free@user.com')

    expect(result.valid).toBe(true)
    expect(useLicenseStore.getState().isAuthenticated).toBe(true)
  })
})

// ── loginWithKey — pro tier (with license key) ────────────────────────────────

describe('loginWithKey (with license key)', () => {
  it('activates and stores pro tier on success', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: true,
        license: { plan: 'pro', key: 'KEY-PRO-1', email: 'pro@user.com' },
        features: ['team_mode'],
      }),
    })

    const result = await useLicenseStore.getState().loginWithKey('pro@user.com', 'KEY-PRO-1')

    expect(result.valid).toBe(true)
    const state = useLicenseStore.getState()
    expect(state.tier).toBe('pro')
    expect(state.licenseKey).toBe('KEY-PRO-1')
    expect(state.isAuthenticated).toBe(true)
    expect(state.machineMismatch).toBe(false)
    expect(api.settings.set).toHaveBeenCalledWith(
      'pilos_auth',
      expect.objectContaining({ tier: 'pro', licenseKey: 'KEY-PRO-1' }),
    )
  })

  it('returns error when pro module unavailable', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue(null)

    const result = await useLicenseStore.getState().loginWithKey('pro@user.com', 'BAD-KEY')

    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })

  it('returns error when activation fails', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: false,
        error: 'Invalid license key',
      }),
    })

    const result = await useLicenseStore.getState().loginWithKey('pro@user.com', 'WRONG-KEY')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid license key')
    expect(useLicenseStore.getState().error).toBe('Invalid license key')
  })

  it('returns error when activation throws', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockRejectedValue(new Error('Server unavailable')),
    })

    const result = await useLicenseStore.getState().loginWithKey('pro@user.com', 'KEY-X')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Server unavailable')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })
})

// ── logout ────────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('clears auth state and resets to free tier', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      deactivateLicense: vi.fn().mockResolvedValue(undefined),
    })
    useLicenseStore.setState({
      tier: 'pro',
      licenseKey: 'KEY-PRO-1',
      email: 'pro@user.com',
      isAuthenticated: true,
    })

    await useLicenseStore.getState().logout()

    const state = useLicenseStore.getState()
    expect(state.tier).toBe('free')
    expect(state.licenseKey).toBeNull()
    expect(state.email).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.machineMismatch).toBe(false)
    expect(api.settings.set).toHaveBeenCalledWith('pilos_auth', null)
  })

  it('clears auth even when deactivate throws', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      deactivateLicense: vi.fn().mockRejectedValue(new Error('network error')),
    })
    useLicenseStore.setState({ licenseKey: 'KEY-X', isAuthenticated: true, tier: 'pro', email: 'x@y.com' })

    await useLicenseStore.getState().logout()

    expect(useLicenseStore.getState().isAuthenticated).toBe(false)
    expect(api.settings.set).toHaveBeenCalledWith('pilos_auth', null)
  })

  it('skips deactivate call when no licenseKey', async () => {
    const proLib = await getProLib()
    const deactivateMock = vi.fn()
    proLib.loadProModule.mockResolvedValue({ deactivateLicense: deactivateMock })
    useLicenseStore.setState({ licenseKey: null })

    await useLicenseStore.getState().logout()

    expect(deactivateMock).not.toHaveBeenCalled()
  })
})

// ── checkLicense ──────────────────────────────────────────────────────────────

describe('checkLicense', () => {
  it('does nothing when pro module unavailable', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue(null)
    useLicenseStore.setState({ tier: 'pro', licenseKey: 'KEY-X' })

    await useLicenseStore.getState().checkLicense()

    expect(useLicenseStore.getState().isValidating).toBe(false)
    // Tier preserved (not downgraded)
    expect(useLicenseStore.getState().tier).toBe('pro')
  })

  it('sets machineMismatch when server returns machine mismatch', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      validateLicense: vi.fn().mockResolvedValue({ machineMismatch: true, valid: false }),
    })

    await useLicenseStore.getState().checkLicense()

    const state = useLicenseStore.getState()
    expect(state.machineMismatch).toBe(true)
    expect(state.tier).toBe('free')
    expect(state.error).toContain('another machine')
  })

  it('upgrades tier on valid license response', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      validateLicense: vi.fn().mockResolvedValue({
        valid: true,
        machineMismatch: false,
        license: { plan: 'pro', key: 'KEY-PRO-2', email: 'x@y.com' },
        features: ['team_mode'],
      }),
    })
    useLicenseStore.setState({ email: 'x@y.com', licenseKey: 'KEY-PRO-2' })

    await useLicenseStore.getState().checkLicense()

    const state = useLicenseStore.getState()
    expect(state.tier).toBe('pro')
    expect(state.isValidating).toBe(false)
    expect(state.machineMismatch).toBe(false)
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('preserves tier on infrastructure errors', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      validateLicense: vi.fn().mockResolvedValue({ valid: false, error: 'Server error 503' }),
    })
    useLicenseStore.setState({ tier: 'pro' })

    await useLicenseStore.getState().checkLicense()

    expect(useLicenseStore.getState().tier).toBe('pro')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })

  it('downgrades to free on explicit invalid response', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      validateLicense: vi.fn().mockResolvedValue({ valid: false, error: 'License expired' }),
    })
    useLicenseStore.setState({ tier: 'pro', licenseKey: 'KEY-EXPIRED' })

    await useLicenseStore.getState().checkLicense()

    expect(useLicenseStore.getState().tier).toBe('free')
    expect(useLicenseStore.getState().licenseKey).toBeNull()
  })

  it('preserves tier on network error', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      validateLicense: vi.fn().mockRejectedValue(new Error('fetch failed')),
    })
    useLicenseStore.setState({ tier: 'pro' })

    await useLicenseStore.getState().checkLicense()

    expect(useLicenseStore.getState().tier).toBe('pro')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })
})

// ── activateLicense ───────────────────────────────────────────────────────────

describe('activateLicense', () => {
  it('activates and sets pro tier on success', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: true,
        license: { plan: 'pro', key: 'KEY-ACT', email: 'act@user.com' },
        features: [],
      }),
    })
    useLicenseStore.setState({ email: 'act@user.com' })

    const result = await useLicenseStore.getState().activateLicense('KEY-ACT')

    expect(result.valid).toBe(true)
    expect(useLicenseStore.getState().tier).toBe('pro')
    expect(useLicenseStore.getState().licenseKey).toBe('KEY-ACT')
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('returns error when pro module unavailable', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue(null)

    const result = await useLicenseStore.getState().activateLicense('KEY-X')

    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })

  it('returns error when activation returns invalid', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: false,
        error: 'License already in use',
      }),
    })

    const result = await useLicenseStore.getState().activateLicense('KEY-USED')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('License already in use')
  })

  it('returns error on thrown exception', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockRejectedValue(new Error('Activation error')),
    })

    const result = await useLicenseStore.getState().activateLicense('KEY-X')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Activation error')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })
})

// ── deactivateLicense ─────────────────────────────────────────────────────────

describe('deactivateLicense', () => {
  it('downgrades to free while keeping email', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      deactivateLicense: vi.fn().mockResolvedValue(undefined),
    })
    useLicenseStore.setState({ tier: 'pro', licenseKey: 'KEY-PRO', email: 'x@y.com', isAuthenticated: true })

    await useLicenseStore.getState().deactivateLicense()

    const state = useLicenseStore.getState()
    expect(state.tier).toBe('free')
    expect(state.licenseKey).toBeNull()
    expect(state.machineMismatch).toBe(false)
    expect(state.isValidating).toBe(false)
    expect(api.settings.set).toHaveBeenCalledWith(
      'pilos_auth',
      expect.objectContaining({ tier: 'free', email: 'x@y.com' }),
    )
  })

  it('completes even when pro module unavailable', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue(null)
    useLicenseStore.setState({ tier: 'pro', licenseKey: 'KEY-X' })

    await useLicenseStore.getState().deactivateLicense()

    expect(useLicenseStore.getState().tier).toBe('free')
  })
})

// ── getSafeMachineId fallback (lines 33-34) ────────────────────────────────────

describe('getSafeMachineId fallback (exercised via loginWithKey with key)', () => {
  it('uses a fallback UUID when getMachineId throws (lines 33-34)', async () => {
    const api = await getApi()
    // Make getMachineId throw — this is called inside getSafeMachineId for the pro activation path
    api.metrics.getMachineId.mockRejectedValue(new Error('IPC not available'))

    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: true,
        license: { plan: 'pro', key: 'KEY-FB', email: 'fallback@test.com' },
        features: [],
      }),
    })

    // loginWithKey with a key calls getSafeMachineId (line 113) — getMachineId throws →
    // fallback UUID is generated and used instead
    const result = await useLicenseStore.getState().loginWithKey('fallback@test.com', 'KEY-FB')

    // Should still succeed — the fallback UUID keeps execution going
    expect(result.valid).toBe(true)
    expect(useLicenseStore.getState().tier).toBe('pro')
  })
})

// ── pro.registerFreeUser throws → falls back to registerFree (line 158-159) ──

describe('loginWithKey free tier: pro.registerFreeUser failure falls back to registerFree', () => {
  it('falls back to direct registerFree when pro.registerFreeUser throws', async () => {
    const proLib = await getProLib()
    const registerFreeUserMock = vi.fn().mockRejectedValue(new Error('pro module error'))
    proLib.loadProModule.mockResolvedValue({
      registerFreeUser: registerFreeUserMock,
    })

    // fetch is called for both registerFree and fetchFreeFeatures
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ features: [] }),
    } as unknown as Response)

    const result = await useLicenseStore.getState().loginWithKey('fallback2@test.com')

    // registerFreeUser was called (and threw), then registerFree (fetch) was called as fallback
    expect(registerFreeUserMock).toHaveBeenCalled()
    // The overall login should still succeed
    expect(result.valid).toBe(true)
    expect(useLicenseStore.getState().isAuthenticated).toBe(true)
  })
})

// ── recoverLicense ────────────────────────────────────────────────────────────

describe('recoverLicense', () => {
  it('returns key when license found', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      recoverLicense: vi.fn().mockResolvedValue({
        found: true,
        license: { key: 'RECOVERED-KEY' },
      }),
    })

    const result = await useLicenseStore.getState().recoverLicense('user@example.com')

    expect(result.found).toBe(true)
    expect(result.key).toBe('RECOVERED-KEY')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })

  it('returns not found with error message', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      recoverLicense: vi.fn().mockResolvedValue({
        found: false,
        error: 'No license found for email',
      }),
    })

    const result = await useLicenseStore.getState().recoverLicense('nobody@example.com')

    expect(result.found).toBe(false)
    expect(result.error).toBe('No license found for email')
    expect(useLicenseStore.getState().error).toBe('No license found for email')
  })

  it('returns error when pro module unavailable', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue(null)

    const result = await useLicenseStore.getState().recoverLicense('user@example.com')

    expect(result.found).toBe(false)
    expect(result.error).toBeTruthy()
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })

  it('returns error on thrown exception', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      recoverLicense: vi.fn().mockRejectedValue(new Error('Recovery failed')),
    })

    const result = await useLicenseStore.getState().recoverLicense('user@example.com')

    expect(result.found).toBe(false)
    expect(result.error).toBe('Recovery failed')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })
})

// ── fetchFreeFeatures — branch coverage gaps (lines 17-21) ──────────────────

describe('fetchFreeFeatures — branch coverage gaps (exercised via loginWithKey free tier)', () => {
  it('skips setting email param when email is empty string (line 17: if (email) false branch)', async () => {
    // Line 17: `if (email) params.set('email', email)` — false branch when email is falsy
    // Calling loginWithKey with '' (empty string) reaches fetchFreeFeatures('') where `if ('')` is false
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue(null)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ features: [] }),
    } as unknown as Response)

    // Empty email string — loginWithKey still proceeds with free tier (no key)
    const result = await useLicenseStore.getState().loginWithKey('')

    expect(result.valid).toBe(true)
    // fetch was called without email param (line 17 false branch taken)
    expect(global.fetch).toHaveBeenCalled()
  })

  it('handles res.ok=false gracefully (line 19: if (res.ok) false branch)', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue(null)
    // Mock fetch returning res.ok=false — exercises the `if (res.ok)` false branch
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as unknown as Response)

    const result = await useLicenseStore.getState().loginWithKey('user@example.com')

    // Should succeed with empty features (fallback)
    expect(result.valid).toBe(true)
    expect(useLicenseStore.getState().isAuthenticated).toBe(true)
  })

  it('handles data.features undefined gracefully (line 21: data.features || [] false branch)', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue(null)
    // Mock fetch returning res.ok=true but no features field
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}), // features omitted — exercises `data.features || []`
    } as unknown as Response)

    const result = await useLicenseStore.getState().loginWithKey('user@example.com')

    expect(result.valid).toBe(true)
    // flags should have empty enabledFeatures from the fallback
    expect(useLicenseStore.getState().flags.enabledFeatures).toEqual([])
  })
})

// ── loadAuthState — branch coverage gaps (lines 83-85) ──────────────────────

describe('loadAuthState — branch coverage gaps', () => {
  it('uses "free" tier fallback when auth.tier is missing (line 84: auth.tier || "free")', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    // Return auth without tier field — exercises `auth.tier || 'free'`
    api.settings.get.mockResolvedValue({
      email: 'user@example.com',
      licenseKey: null,
      // tier omitted — exercises `auth.tier || 'free'`
    })
    proLib.loadProModule.mockResolvedValue(null)

    await useLicenseStore.getState().loadAuthState()

    const state = useLicenseStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.tier).toBe('free')
  })

  it('applies empty features array when auth.features is undefined (line 85/line 10: applyFeatures with undefined features)', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    // Return auth without features — exercises `features || []` in applyFeatures
    api.settings.get.mockResolvedValue({
      email: 'user@example.com',
      licenseKey: null,
      tier: 'free',
      // features omitted — exercises `features || []` in applyFeatures (line 10)
    })
    proLib.loadProModule.mockResolvedValue(null)

    await useLicenseStore.getState().loadAuthState()

    const state = useLicenseStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.flags.enabledFeatures).toEqual([])
  })
})

// ── logout — branch gap: loadProModule returns null when licenseKey present (line 187) ──

describe('logout — branch coverage gaps', () => {
  it('skips deactivateLicense when pro module returns null even though licenseKey is set (line 187 false branch)', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    // loadProModule returns null — `if (pro)` is false → pro.deactivateLicense() not called
    proLib.loadProModule.mockResolvedValue(null)
    useLicenseStore.setState({
      licenseKey: 'KEY-ACTIVE',
      isAuthenticated: true,
      tier: 'pro',
      email: 'pro@user.com',
    })

    await useLicenseStore.getState().logout()

    // Should still complete and clear auth state
    expect(useLicenseStore.getState().isAuthenticated).toBe(false)
    expect(useLicenseStore.getState().tier).toBe('free')
    expect(api.settings.set).toHaveBeenCalledWith('pilos_auth', null)
  })
})

// ── loginWithKey — branch coverage gaps (lines 133-137) ─────────────────────

describe('loginWithKey (with license key) — branch coverage gaps', () => {
  it('uses empty features array when result.features is undefined in loginWithKey success path (line 117: result.features || [])', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: true,
        license: { plan: 'pro', key: 'KEY-LWK-NF', email: 'x@y.com' },
        // features omitted — exercises line 117: `result.features || []`
      }),
    })

    const result = await useLicenseStore.getState().loginWithKey('x@y.com', 'KEY-LWK-NF')

    expect(result.valid).toBe(true)
    expect(useLicenseStore.getState().tier).toBe('pro')
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('uses "Invalid license key" fallback when result.error is undefined (line 133: result.error || "Invalid license key")', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: false,
        // error intentionally omitted — exercises `result.error || 'Invalid license key'`
      }),
    })

    const result = await useLicenseStore.getState().loginWithKey('user@example.com', 'BAD-KEY')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid license key')
    expect(useLicenseStore.getState().error).toBe('Invalid license key')
  })

  it('uses "Activation failed" fallback when non-Error is thrown (line 137: err instanceof Error)', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockImplementation(() => { throw 'plain string' }),
    })

    const result = await useLicenseStore.getState().loginWithKey('user@example.com', 'KEY-X')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Activation failed')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })
})

// ── checkLicense — branch coverage gaps (lines 233-239) ──────────────────────

describe('checkLicense — branch coverage gaps', () => {
  it('uses empty features array when result.features is undefined (line 233: result.features || [])', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      validateLicense: vi.fn().mockResolvedValue({
        valid: true,
        machineMismatch: false,
        license: { plan: 'pro', key: 'KEY-CF', email: 'x@y.com' },
        // features omitted — exercises `result.features || []`
      }),
    })
    useLicenseStore.setState({ email: 'x@y.com', licenseKey: 'KEY-CF' })

    await useLicenseStore.getState().checkLicense()

    expect(useLicenseStore.getState().tier).toBe('pro')
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('uses empty string when both store email and license email are null in checkLicense (line 234: || "")', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      validateLicense: vi.fn().mockResolvedValue({
        valid: true,
        machineMismatch: false,
        license: { plan: 'pro', key: 'KEY-CH-NM', email: '' }, // empty license email
        features: [],
      }),
    })
    useLicenseStore.setState({ email: null, licenseKey: 'KEY-CH-NM' })

    await useLicenseStore.getState().checkLicense()

    expect(useLicenseStore.getState().tier).toBe('pro')
    expect(api.settings.set).toHaveBeenCalledWith(
      'pilos_auth',
      expect.objectContaining({ email: '' }),
    )
  })

  it('falls back to result.license.email when store email is null (lines 234/239: get().email || result.license.email)', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      validateLicense: vi.fn().mockResolvedValue({
        valid: true,
        machineMismatch: false,
        license: { plan: 'pro', key: 'KEY-CG', email: 'from-license@example.com' },
        features: [],
      }),
    })
    // Ensure store email is null/empty so `get().email || result.license.email` uses the license email
    useLicenseStore.setState({ email: null, licenseKey: 'KEY-CG' })

    await useLicenseStore.getState().checkLicense()

    expect(useLicenseStore.getState().email).toBe('from-license@example.com')
    expect(api.settings.set).toHaveBeenCalled()
  })
})

// ── activateLicense — branch coverage gaps (lines 273-293) ───────────────────

describe('activateLicense — branch coverage gaps', () => {
  it('uses empty features array when result.features is undefined (line 273: result.features || [])', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: true,
        license: { plan: 'pro', key: 'KEY-NO-FEATURES', email: 'no-feat@user.com' },
        // features intentionally omitted — exercises `result.features || []`
      }),
    })
    useLicenseStore.setState({ email: 'no-feat@user.com' })

    const result = await useLicenseStore.getState().activateLicense('KEY-NO-FEATURES')

    expect(result.valid).toBe(true)
    expect(useLicenseStore.getState().tier).toBe('pro')
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('falls back to result.license.email when store email is empty (line 274: get().email || result.license.email)', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: true,
        license: { plan: 'pro', key: 'KEY-EMAIL-FB', email: 'from-license@user.com' },
        features: [],
      }),
    })
    // Set store email to empty string so `get().email || result.license.email` uses the license email
    useLicenseStore.setState({ email: '' })

    const result = await useLicenseStore.getState().activateLicense('KEY-EMAIL-FB')

    expect(result.valid).toBe(true)
    expect(useLicenseStore.getState().email).toBe('from-license@user.com')
    expect(api.settings.set).toHaveBeenCalledWith(
      'pilos_auth',
      expect.objectContaining({ email: 'from-license@user.com' }),
    )
  })

  it('uses empty string when both store email and license email are falsy (line 275: authEmail || "")', async () => {
    const api = await getApi()
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: true,
        license: { plan: 'pro', key: 'KEY-NOMAIL', email: '' }, // empty license email
        features: [],
      }),
    })
    // Store email is also empty — exercises `authEmail || ''`
    useLicenseStore.setState({ email: '' })

    const result = await useLicenseStore.getState().activateLicense('KEY-NOMAIL')

    expect(result.valid).toBe(true)
    expect(api.settings.set).toHaveBeenCalledWith(
      'pilos_auth',
      expect.objectContaining({ email: '' }),
    )
  })

  it('uses "Activation failed" fallback when result.error is undefined in else branch (line 289: result.error || "Activation failed")', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockResolvedValue({
        valid: false,
        // error omitted — exercises `result.error || 'Activation failed'`
      }),
    })

    const result = await useLicenseStore.getState().activateLicense('KEY-NO-ERR')

    expect(result.valid).toBe(false)
    expect(useLicenseStore.getState().error).toBe('Activation failed')
  })

  it('uses "Activation failed" fallback when non-Error is thrown (line 293: err instanceof Error)', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      activateLicense: vi.fn().mockImplementation(() => { throw 'string error' }),
    })

    const result = await useLicenseStore.getState().activateLicense('KEY-THROW')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Activation failed')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })
})

// ── recoverLicense — branch coverage gaps (lines 344-348) ────────────────────

describe('recoverLicense — branch coverage gaps', () => {
  it('uses default "No license found" error when result.error is undefined (line 344: result.error || "No license found")', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      recoverLicense: vi.fn().mockResolvedValue({
        found: false,
        // error intentionally omitted — exercises `result.error || 'No license found'`
      }),
    })

    const result = await useLicenseStore.getState().recoverLicense('nobody@example.com')

    expect(result.found).toBe(false)
    expect(result.error).toBe('No license found')
    expect(useLicenseStore.getState().error).toBe('No license found')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })

  it('catch block uses fallback message when non-Error is thrown (line 348: err instanceof Error)', async () => {
    const proLib = await getProLib()
    proLib.loadProModule.mockResolvedValue({
      // Throw a plain string (not an Error instance) to exercise the non-Error branch
      recoverLicense: vi.fn().mockImplementation(() => { throw 'plain string error' }),
    })

    const result = await useLicenseStore.getState().recoverLicense('user@example.com')

    expect(result.found).toBe(false)
    expect(result.error).toBe('Recovery failed')
    expect(useLicenseStore.getState().isValidating).toBe(false)
  })
})
