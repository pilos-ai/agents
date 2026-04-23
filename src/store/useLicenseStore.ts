import { create } from 'zustand'
import type { LicenseTier, ProFeatureFlags } from '../types'
import { FREE_LIMITS, getFlagsForTier, loadProModule } from '../lib/pro'
import { api } from '../api'

const LICENSE_SERVER = 'https://license.pilos.net/v1/licenses'

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
}

interface LicenseStore {
  tier: LicenseTier
  licenseKey: string | null
  email: string | null
  isValidating: boolean
  isAuthenticated: boolean
  authLoaded: boolean
  machineMismatch: boolean
  error: string | null
  flags: ProFeatureFlags
  pendingActivation: { key: string; email: string } | null
  expiresAt: string | null
  isTrial: boolean

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
  isValidating: false,
  isAuthenticated: false,
  authLoaded: false,
  machineMismatch: false,
  error: null,
  flags: { ...FREE_LIMITS },
  pendingActivation: null,
  expiresAt: null,
  isTrial: false,

  setPendingActivation: (data) => set({ pendingActivation: data }),

  loadAuthState: async () => {
    try {
      const raw = await api.settings.get('pilos_auth')
      const auth = raw as PilosAuth | null
      if (auth?.email) {
        set({
          email: auth.email,
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
    set({
      tier: 'free',
      licenseKey: null,
      email: null,
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
