/**
 * Monetization kill switch.
 *
 * Pilos Agents is currently FREE: every feature is unlocked, there are no paid
 * tiers, no license key requirement, no trial countdown and no upgrade prompts.
 * Rather than deleting all of that code, it is gated behind this one flag so
 * paid plans can be switched back on later (the plan: once registrations pass
 * 10,000 — the server tracks the count and reports it on the admin dashboard).
 *
 * Resolution order, most authoritative last:
 *   1. `__MONETIZATION_ENABLED__`  — build-time default, currently `false`.
 *   2. `monetizationEnabled`       — local setting, survives offline/first paint.
 *   3. `GET /v1/config`            — the server, so a single env flip on the
 *                                    backend turns paid mode back on for every
 *                                    installed copy without shipping a release.
 *
 * Read the *reactive* value from the license store (`useIsPro`, `useShowPaidUi`
 * in src/lib/entitlements.ts). The synchronous getter here exists for pure
 * helpers like getFlagsForTier() that cannot use hooks.
 */
import { api } from '../api'

export const MONETIZATION_SETTING_KEY = 'monetizationEnabled'

const BUILD_DEFAULT =
  typeof __MONETIZATION_ENABLED__ !== 'undefined' ? __MONETIZATION_ENABLED__ : false

let current = BUILD_DEFAULT

/** Synchronous, non-reactive. Prefer the store selectors in components. */
export function isMonetizationEnabled(): boolean {
  return current
}

/** Module-local update. Callers are responsible for refreshing derived state. */
export function setMonetizationEnabledValue(enabled: boolean): void {
  current = enabled
}

const LICENSE_SERVER_ORIGIN = 'https://license.pilos.net'

/**
 * Resolve the effective value: local setting first (fast, offline-safe), then
 * the server (authoritative). Never throws — any failure keeps the current
 * value, so a network blip can never accidentally paywall a free user.
 */
export async function resolveMonetization(): Promise<boolean> {
  try {
    const stored = await api.settings.get(MONETIZATION_SETTING_KEY)
    if (typeof stored === 'boolean') current = stored
  } catch {
    /* settings unavailable — keep the build default */
  }

  try {
    const res = await fetch(`${LICENSE_SERVER_ORIGIN}/v1/config`)
    if (res.ok) {
      const data = (await res.json()) as { monetizationEnabled?: boolean }
      if (typeof data.monetizationEnabled === 'boolean') {
        current = data.monetizationEnabled
        api.settings.set(MONETIZATION_SETTING_KEY, current).catch(() => {})
      }
    }
  } catch {
    /* offline — the cached setting stands */
  }

  return current
}
