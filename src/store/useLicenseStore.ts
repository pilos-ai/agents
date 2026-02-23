import { create } from 'zustand'
import type { LicenseTier, ProFeatureFlags } from '../types'
import { FREE_LIMITS, getFlagsForTier, loadProModule } from '../lib/pro'
import { api } from '../api'

interface LicenseStore {
  tier: LicenseTier
  licenseKey: string | null
  email: string | null
  isValidating: boolean
  error: string | null
  flags: ProFeatureFlags

  checkLicense: () => Promise<void>
  activateLicense: (key: string) => Promise<{ valid: boolean; error?: string }>
  deactivateLicense: () => Promise<void>
}

export const useLicenseStore = create<LicenseStore>((set, get) => ({
  tier: 'free',
  licenseKey: null,
  email: null,
  isValidating: false,
  error: null,
  flags: { ...FREE_LIMITS },

  checkLicense: async () => {
    set({ isValidating: true, error: null })

    try {
      const pro = await loadProModule()
      if (!pro) {
        // Pro module not available — free tier silently
        set({ tier: 'free', flags: getFlagsForTier('free'), isValidating: false })
        return
      }

      const result = await pro.validateLicense()
      if (result.valid && result.license) {
        const tier = result.license.plan as LicenseTier
        set({
          tier,
          licenseKey: result.license.key,
          email: result.license.email,
          flags: getFlagsForTier(tier),
          isValidating: false,
        })
        api.metrics.setLicenseKey(result.license.key).catch(() => {})
      } else {
        set({ tier: 'free', flags: getFlagsForTier('free'), isValidating: false })
      }
    } catch {
      // Silently fall back to free tier
      set({ tier: 'free', flags: getFlagsForTier('free'), isValidating: false })
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

      const result = await pro.activateLicense(key)
      if (result.valid && result.license) {
        const tier = result.license.plan as LicenseTier
        set({
          tier,
          licenseKey: result.license.key,
          email: result.license.email,
          flags: getFlagsForTier(tier),
          error: null,
          isValidating: false,
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

    set({
      tier: 'free',
      licenseKey: null,
      email: null,
      flags: getFlagsForTier('free'),
      error: null,
      isValidating: false,
    })
  },
}))
