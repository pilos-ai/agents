import { create } from 'zustand'
import type { LicenseTier, ProFeatureFlags } from '../types'
import { getFlagsForTier, loadProModule } from '../lib/pro'
import {
  MONETIZATION_SETTING_KEY,
  isMonetizationEnabled,
  resolveMonetization,
  setMonetizationEnabledValue,
} from '../lib/monetization'
import { api } from '../api'

const LICENSE_SERVER = 'https://license.pilos.net/v1/licenses'
const ACCOUNT_SERVER = 'https://license.pilos.net/v1/account'

/** Fetch server-side feature flags for a plan, merging them into flags. */
function applyFeatures(flags: ProFeatureFlags, features?: string[]): ProFeatureFlags {
  return { ...flags, enabledFeatures: features || [] }
}

/** Fetch features for the free tier from the server (best-effort). */
async function fetchFreeFeatures(email?: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({ plan: 'free' })
    if (email) params.set('email', email)
    const res = await fetch(`${LICENSE_SERVER}/features?${params}`)
    if (res.ok) {
      const data = await res.json() as { features: string[] }
      return data.features || []
    }
  } catch { /* best effort */ }
  return []
}

type LicenseSet = (partial: Partial<LicenseStore>) => void

/**
 * Persist an account session (register / login) into settings + store.
 *
 * An account is an identity, not an entitlement: while Pilos is free it unlocks
 * nothing on its own. `license` is only populated for users who still hold a
 * paid key from before the switch, so they keep their plan.
 */
async function applyAccountSession(
  set: LicenseSet,
  email: string,
  data: AccountResponse
): Promise<void> {
  const tier = (data.license?.plan ?? data.plan ?? 'free') as LicenseTier
  const features = data.features || []
  const licenseKey = data.license?.key ?? null
  const expiresAt = data.license?.expiresAt ?? null
  const isTrial = !!data.license?.isTrial

  if (typeof data.monetizationEnabled === 'boolean') {
    setMonetizationEnabledValue(data.monetizationEnabled)
    api.settings.set(MONETIZATION_SETTING_KEY, data.monetizationEnabled).catch(() => {})
  }

  const authData: PilosAuth = {
    email,
    tier,
    features,
    token: data.token,
    expiresAt,
    isTrial,
    ...(licenseKey ? { licenseKey } : {}),
  }
  await api.settings.set('pilos_auth', authData)

  set({
    tier,
    email,
    token: data.token ?? null,
    licenseKey,
    flags: applyFeatures(getFlagsForTier(tier), features),
    expiresAt,
    isTrial,
    monetizationEnabled: isMonetizationEnabled(),
    error: null,
    isValidating: false,
    isAuthenticated: true,
    machineMismatch: false,
  })

  if (licenseKey) {
    api.metrics.setLicenseKey(licenseKey).catch((err) => console.error('[LicenseStore]', err))
  }
  // Bring device pairing up now rather than at next launch.
  api.metrics.setAccount(email).catch((err) => console.error('[LicenseStore]', err))
}

let fallbackMachineId: string | null = null
async function getSafeMachineId(): Promise<string> {
  try {
    return await api.metrics.getMachineId()
  } catch {
    // IPC handler not available (old build) — use a session-stable fallback
    if (!fallbackMachineId) fallbackMachineId = crypto.randomUUID()
    return fallbackMachineId
  }
}

interface PilosAuth {
  email: string
  licenseKey?: string
  tier: LicenseTier
  features?: string[]
  expiresAt?: string | null
  isTrial?: boolean
  /** Account session token from /v1/account (email + password signup). */
  token?: string
}

interface AccountResponse {
  success?: boolean
  token?: string
  error?: string
  user?: { email: string; createdAt: string | null }
  plan?: LicenseTier
  features?: string[]
  monetizationEnabled?: boolean
  license?: { key: string; plan: LicenseTier; expiresAt: string | null; isTrial: boolean } | null
}

interface LicenseStore {
  tier: LicenseTier
  licenseKey: string | null
  email: string | null
  /** Account session token. Null when signed out — the app still works. */
  token: string | null
  isValidating: boolean
  isAuthenticated: boolean
  authLoaded: boolean
  machineMismatch: boolean
  error: string | null
  flags: ProFeatureFlags
  pendingActivation: { key: string; email: string } | null
  expiresAt: string | null
  isTrial: boolean
  /**
   * Whether paid plans exist at all. False = Pilos is free: every feature is
   * unlocked and no upgrade/license/trial UI is rendered. Mirrors the server's
   * GET /v1/config so paid mode can be restored without shipping a build.
   */
  monetizationEnabled: boolean

  registerAccount: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  loginAccount: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>
  refreshMonetization: () => Promise<void>
  checkLicense: () => Promise<void>
  activateLicense: (key: string) => Promise<{ valid: boolean; error?: string }>
  deactivateLicense: () => Promise<void>
  loginWithKey: (email: string, key?: string) => Promise<{ valid: boolean; error?: string }>
  logout: () => Promise<void>
  loadAuthState: () => Promise<void>
  recoverLicense: (email: string) => Promise<{ found: boolean; key?: string; error?: string }>
  setPendingActivation: (data: { key: string; email: string } | null) => void
}

export const useLicenseStore = create<LicenseStore>((set, get) => ({
  tier: 'free',
  licenseKey: null,
  email: null,
  token: null,
  isValidating: false,
  isAuthenticated: false,
  authLoaded: false,
  machineMismatch: false,
  error: null,
  flags: getFlagsForTier('free'),
  pendingActivation: null,
  expiresAt: null,
  isTrial: false,
  monetizationEnabled: isMonetizationEnabled(),

  setPendingActivation: (data) => set({ pendingActivation: data }),

  /**
   * Re-resolve the monetization flag (local setting → server) and rebuild the
   * feature flags from it. Safe to call repeatedly; never throws.
   */
  refreshMonetization: async () => {
    const enabled = await resolveMonetization()
    if (enabled === get().monetizationEnabled) return
    setMonetizationEnabledValue(enabled)
    set({
      monetizationEnabled: enabled,
      flags: applyFeatures(getFlagsForTier(get().tier), get().flags.enabledFeatures),
    })
  },

  registerAccount: async (email: string, password: string) => {
    set({ isValidating: true, error: null })
    try {
      let machineId: string | undefined
      try { machineId = await api.metrics.getMachineId() } catch { /* IPC unavailable */ }

      const res = await fetch(`${ACCOUNT_SERVER}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, machineId, source: 'app' }),
      })
      const data = (await res.json()) as AccountResponse

      if (!res.ok || !data.token) {
        const error = data.error || 'Could not create your account'
        set({ isValidating: false, error })
        return { ok: false, error }
      }

      await applyAccountSession(set, email, data)
      return { ok: true }
    } catch {
      const error = 'Could not reach Pilos — check your connection'
      set({ isValidating: false, error })
      return { ok: false, error }
    }
  },

  loginAccount: async (email: string, password: string) => {
    set({ isValidating: true, error: null })
    try {
      let machineId: string | undefined
      try { machineId = await api.metrics.getMachineId() } catch { /* IPC unavailable */ }

      const res = await fetch(`${ACCOUNT_SERVER}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, machineId }),
      })
      const data = (await res.json()) as AccountResponse

      if (!res.ok || !data.token) {
        const error = data.error || 'Incorrect email or password'
        set({ isValidating: false, error })
        return { ok: false, error }
      }

      await applyAccountSession(set, email, data)
      return { ok: true }
    } catch {
      const error = 'Could not reach Pilos — check your connection'
      set({ isValidating: false, error })
      return { ok: false, error }
    }
  },

  requestPasswordReset: async (email: string) => {
    try {
      const res = await fetch(`${ACCOUNT_SERVER}/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      // The server always reports success (no account enumeration).
      return res.ok ? { ok: true } : { ok: false, error: 'Could not send the reset email' }
    } catch {
      return { ok: false, error: 'Could not reach Pilos — check your connection' }
    }
  },

  loadAuthState: async () => {
    // Resolve monetization first: it decides whether `flags` come out gated or
    // unrestricted, so doing it after would briefly render a paywalled UI.
    try {
      const enabled = await resolveMonetization()
      setMonetizationEnabledValue(enabled)
      set({ monetizationEnabled: enabled })
    } catch { /* keep the build default */ }

    try {
      const raw = await api.settings.get('pilos_auth')
      const auth = raw as PilosAuth | null
      if (auth?.email) {
        set({
          email: auth.email,
          token: auth.token || null,
          licenseKey: auth.licenseKey || null,
          tier: auth.tier || 'free',
          flags: applyFeatures(getFlagsForTier(auth.tier || 'free'), auth.features),
          expiresAt: auth.expiresAt || null,
          isTrial: !!auth.isTrial,
          isAuthenticated: true,
          authLoaded: true,
        })
        // Re-validate license in background if key exists
        if (auth.licenseKey) {
          get().checkLicense()
        }
      } else {
        set({ authLoaded: true })
        // Signed out, but the app is fully usable — pull the server feature
        // flags anyway so feature-flagged UI isn't hidden from anonymous users.
        fetchFreeFeatures()
          .then((features) => {
            if (!features.length || get().email) return
            set({ flags: applyFeatures(getFlagsForTier(get().tier), features) })
          })
          .catch(() => { /* best effort */ })
      }
    } catch {
      set({ authLoaded: true })
    }
  },

  loginWithKey: async (email: string, key?: string) => {
    set({ isValidating: true, error: null })

    if (key) {
      // Activate with license key
      const pro = await loadProModule()
      if (!pro) {
        set({ isValidating: false, error: 'Pro module not available — try free plan' })
        return { valid: false, error: 'Pro module not available' }
      }

      try {
        const machineId = await getSafeMachineId()
        const result = await pro.activateLicense(key, email, machineId)
        if (result.valid && result.license) {
          const tier = result.license.plan as LicenseTier
          const features = result.features || []
          const expiresAt = result.license.expiresAt ?? null
          const isTrial = !!result.license.isTrial
          const authData: PilosAuth = { email, licenseKey: key, tier, features, expiresAt, isTrial }
          await api.settings.set('pilos_auth', authData)
          set({
            tier,
            licenseKey: key,
            email,
            flags: applyFeatures(getFlagsForTier(tier), features),
            expiresAt,
            isTrial,
            error: null,
            isValidating: false,
            isAuthenticated: true,
            machineMismatch: false,
          })
          api.metrics.setLicenseKey(key).catch((err) => console.error('[LicenseStore]', err))
          return { valid: true }
        } else {
          set({ isValidating: false, error: result.error || 'Invalid license key' })
          return { valid: false, error: result.error || 'Invalid license key' }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Activation failed'
        set({ isValidating: false, error: msg })
        return { valid: false, error: msg }
      }
    } else {
      // Free tier — register email on server (best-effort)
      let machineId: string | undefined
      try { machineId = await api.metrics.getMachineId() } catch { /* IPC not available */ }

      const registerFree = (e: string, mid?: string) => {
        const body: Record<string, string> = { email: e }
        if (mid) body.machineId = mid
        return fetch('https://license.pilos.net/v1/licenses/register-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      const pro = await loadProModule()
      if (pro) {
        pro.registerFreeUser(email, machineId).catch((err: unknown) =>
          registerFree(email, machineId).catch((err) => console.error('[LicenseStore]', err))
        )
      } else {
        registerFree(email, machineId).catch((err) => console.error('[LicenseStore]', err))
      }

      const features = await fetchFreeFeatures(email)
      const authData: PilosAuth = { email, tier: 'free', features }
      await api.settings.set('pilos_auth', authData)
      set({
        tier: 'free',
        licenseKey: null,
        email,
        flags: applyFeatures(getFlagsForTier('free'), features),
        error: null,
        isValidating: false,
        isAuthenticated: true,
      })
      return { valid: true }
    }
  },

  logout: async () => {
    const { licenseKey } = get()

    if (licenseKey) {
      try {
        const pro = await loadProModule()
        if (pro) await pro.deactivateLicense()
      } catch { /* best effort */ }
      api.metrics.setLicenseKey('').catch((err) => console.error('[LicenseStore]', err))
    }

    await api.settings.set('pilos_auth', null)
    api.metrics.setAccount(null).catch((err) => console.error('[LicenseStore]', err))
    set({
      tier: 'free',
      licenseKey: null,
      email: null,
      token: null,
      flags: getFlagsForTier('free'),
      expiresAt: null,
      isTrial: false,
      error: null,
      isValidating: false,
      isAuthenticated: false,
      machineMismatch: false,
    })
  },

  checkLicense: async () => {
    set({ isValidating: true, error: null })

    try {
      const pro = await loadProModule()
      if (!pro) {
        // Pro module unavailable — preserve current tier from settings
        set({ isValidating: false })
        return
      }

      const storedKey = get().licenseKey
      const machineId = await getSafeMachineId()
      const result = await pro.validateLicense(machineId, storedKey || undefined)

      if (result.machineMismatch) {
        set({
          machineMismatch: true,
          tier: 'free',
          flags: getFlagsForTier('free'),
          isValidating: false,
          error: 'License is active on another machine',
        })
        return
      }

      if (result.valid && result.license) {
        const tier = result.license.plan as LicenseTier
        const features = result.features || []
        const expiresAt = result.license.expiresAt ?? null
        const isTrial = !!result.license.isTrial
        const authData: PilosAuth = { email: get().email || result.license.email || '', licenseKey: result.license.key, tier, features, expiresAt, isTrial }
        api.settings.set('pilos_auth', authData).catch((err) => console.error('[LicenseStore]', err))
        set({
          tier,
          licenseKey: result.license.key,
          email: get().email || result.license.email,
          flags: applyFeatures(getFlagsForTier(tier), features),
          expiresAt,
          isTrial,
          isValidating: false,
          machineMismatch: false,
        })
        api.metrics.setLicenseKey(result.license.key).catch((err) => console.error('[LicenseStore]', err))
      } else if (result.error === 'No license key found' || result.error === 'No offline cache' || result.error?.startsWith('Server error')) {
        // Infrastructure issue — preserve current tier from settings
        set({ isValidating: false })
      } else {
        // Explicit invalidity from server (expired, invalid key, etc.)
        set({ tier: 'free', licenseKey: null, flags: getFlagsForTier('free'), expiresAt: null, isTrial: false, isValidating: false })
      }
    } catch {
      // Network/infrastructure error — preserve current tier from settings
      set({ isValidating: false })
    }
  },

  activateLicense: async (key: string) => {
    set({ isValidating: true, error: null })

    try {
      const pro = await loadProModule()
      if (!pro) {
        set({ isValidating: false, error: 'Pro module not available' })
        return { valid: false, error: 'Pro module not available' }
      }

      const email = get().email || ''
      const machineId = await getSafeMachineId()
      const result = await pro.activateLicense(key, email, machineId)
      if (result.valid && result.license) {
        const tier = result.license.plan as LicenseTier
        const features = result.features || []
        const authEmail = get().email || result.license.email
        const expiresAt = result.license.expiresAt ?? null
        const isTrial = !!result.license.isTrial
        const authData: PilosAuth = { email: authEmail || '', licenseKey: key, tier, features, expiresAt, isTrial }
        await api.settings.set('pilos_auth', authData)
        set({
          tier,
          licenseKey: result.license.key,
          email: authEmail,
          flags: applyFeatures(getFlagsForTier(tier), features),
          expiresAt,
          isTrial,
          error: null,
          isValidating: false,
          machineMismatch: false,
        })
        api.metrics.setLicenseKey(result.license.key).catch((err) => console.error('[LicenseStore]', err))
        return { valid: true }
      } else {
        set({ isValidating: false, error: result.error || 'Activation failed' })
        return { valid: false, error: result.error }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Activation failed'
      set({ isValidating: false, error: msg })
      return { valid: false, error: msg }
    }
  },

  deactivateLicense: async () => {
    set({ isValidating: true })

    try {
      const pro = await loadProModule()
      if (pro) {
        await pro.deactivateLicense()
      }
    } catch {
      // Best effort
    }

    const email = get().email
    api.metrics.setLicenseKey('').catch((err) => console.error('[LicenseStore]', err))

    // Keep authenticated but downgrade to free
    const authData: PilosAuth = { email: email || '', tier: 'free' }
    await api.settings.set('pilos_auth', authData)

    set({
      tier: 'free',
      licenseKey: null,
      flags: getFlagsForTier('free'),
      expiresAt: null,
      isTrial: false,
      error: null,
      isValidating: false,
      machineMismatch: false,
    })
  },

  recoverLicense: async (email: string) => {
    set({ isValidating: true, error: null })

    try {
      const pro = await loadProModule()
      if (!pro) {
        set({ isValidating: false, error: 'Pro module not available' })
        return { found: false, error: 'Pro module not available' }
      }

      const result = await pro.recoverLicense(email)

      if (result.found && result.license) {
        set({ isValidating: false })
        return { found: true, key: result.license.key }
      } else {
        set({ isValidating: false, error: result.error || 'No license found' })
        return { found: false, error: result.error || 'No license found' }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recovery failed'
      set({ isValidating: false, error: msg })
      return { found: false, error: msg }
    }
  },
}))
