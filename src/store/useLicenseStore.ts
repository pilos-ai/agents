import { create } from 'zustand'
import type { LicenseTier, ProFeatureFlags } from '../types'
import { FREE_LIMITS, getFlagsForTier, loadProModule } from '../lib/pro'
import { api } from '../api'

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

  checkLicense: () => Promise<void>
  activateLicense: (key: string) => Promise<{ valid: boolean; error?: string }>
  deactivateLicense: () => Promise<void>
  loginWithKey: (email: string, key?: string) => Promise<{ valid: boolean; error?: string }>
  logout: () => Promise<void>
  loadAuthState: () => Promise<void>
  recoverLicense: (email: string) => Promise<{ found: boolean; key?: string; error?: string }>
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

  loadAuthState: async () => {
    try {
      const raw = await api.settings.get('pilos_auth')
      const auth = raw as PilosAuth | null
      if (auth?.email) {
        set({
          email: auth.email,
          licenseKey: auth.licenseKey || null,
          tier: auth.tier || 'free',
          flags: getFlagsForTier(auth.tier || 'free'),
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
          const authData: PilosAuth = { email, licenseKey: key, tier }
          await api.settings.set('pilos_auth', authData)
          set({
            tier,
            licenseKey: key,
            email,
            flags: getFlagsForTier(tier),
            error: null,
            isValidating: false,
            isAuthenticated: true,
            machineMismatch: false,
          })
          api.metrics.setLicenseKey(key).catch(() => {})
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
        pro.registerFreeUser(email, machineId).catch(() =>
          registerFree(email, machineId).catch(() => {})
        )
      } else {
        registerFree(email, machineId).catch(() => {})
      }

      const authData: PilosAuth = { email, tier: 'free' }
      await api.settings.set('pilos_auth', authData)
      set({
        tier: 'free',
        licenseKey: null,
        email,
        flags: getFlagsForTier('free'),
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
      api.metrics.setLicenseKey('').catch(() => {})
    }

    await api.settings.set('pilos_auth', null)
    set({
      tier: 'free',
      licenseKey: null,
      email: null,
      flags: getFlagsForTier('free'),
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
        set({
          tier,
          licenseKey: result.license.key,
          email: get().email || result.license.email,
          flags: getFlagsForTier(tier),
          isValidating: false,
          machineMismatch: false,
        })
        api.metrics.setLicenseKey(result.license.key).catch(() => {})
      } else if (result.error === 'No license key found' || result.error === 'No offline cache' || result.error?.startsWith('Server error')) {
        // Infrastructure issue — preserve current tier from settings
        set({ isValidating: false })
      } else {
        // Explicit invalidity from server (expired, invalid key, etc.)
        set({ tier: 'free', licenseKey: null, flags: getFlagsForTier('free'), isValidating: false })
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
        const authEmail = get().email || result.license.email
        const authData: PilosAuth = { email: authEmail || '', licenseKey: key, tier }
        await api.settings.set('pilos_auth', authData)
        set({
          tier,
          licenseKey: result.license.key,
          email: authEmail,
          flags: getFlagsForTier(tier),
          error: null,
          isValidating: false,
          machineMismatch: false,
        })
        api.metrics.setLicenseKey(result.license.key).catch(() => {})
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
    api.metrics.setLicenseKey('').catch(() => {})

    // Keep authenticated but downgrade to free
    const authData: PilosAuth = { email: email || '', tier: 'free' }
    await api.settings.set('pilos_auth', authData)

    set({
      tier: 'free',
      licenseKey: null,
      flags: getFlagsForTier('free'),
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
