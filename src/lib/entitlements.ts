/**
 * Reactive entitlement checks for components.
 *
 * Before Pilos went free, components wrote:
 *     const tier = useLicenseStore((s) => s.flags.tier)
 *     const isPro = tier === 'pro' || tier === 'teams'
 *
 * That pattern is now `useIsPro()`, which is simply `true` while monetization is
 * off. Keeping the checks (rather than deleting them) is what makes paid mode a
 * one-flag change instead of a re-implementation.
 *
 * Rule of thumb:
 *   useIsPro()      — "may this user use the feature?"  → gate behaviour
 *   useShowPaidUi() — "should we advertise a paid plan?" → gate upsell chrome
 */
import { useLicenseStore } from '../store/useLicenseStore'

/** Whether the user may use features that used to require Pro/Teams. */
export function useIsPro(): boolean {
  return useLicenseStore((s) => {
    if (!s.monetizationEnabled) return true
    return s.flags.tier === 'pro' || s.flags.tier === 'teams'
  })
}

/**
 * Whether any paid surface (upgrade buttons, pricing, license keys, trial
 * banners) should render at all. False while Pilos is free.
 */
export function useShowPaidUi(): boolean {
  return useLicenseStore((s) => s.monetizationEnabled)
}
