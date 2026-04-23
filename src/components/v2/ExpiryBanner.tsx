import { useMemo, useState } from 'react'
import { Icon } from '../common/Icon'
import { useLicenseStore } from '../../store/useLicenseStore'
import { api } from '../../api'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const SESSION_DISMISS_KEY = 'pilos:expiry-banner-dismissed'
const PRICING_URL = 'https://pilos.net/pricing'

type Severity = 'hidden' | 'info' | 'warn' | 'urgent' | 'expired'

function severityFor(daysLeft: number, isTrial: boolean): Severity {
  if (daysLeft <= 0) return 'expired'
  if (daysLeft <= 1) return 'urgent'
  if (daysLeft <= 3) return 'warn'
  if (daysLeft <= 7) return isTrial ? 'info' : 'hidden'
  return 'hidden'
}

export function ExpiryBanner() {
  const expiresAt = useLicenseStore((s) => s.expiresAt)
  const isTrial = useLicenseStore((s) => s.isTrial)
  const tier = useLicenseStore((s) => s.tier)
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1' } catch { return false }
  })

  const daysLeft = useMemo(() => {
    if (!expiresAt) return null
    return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / MS_PER_DAY)
  }, [expiresAt])

  if (tier === 'free' && !isTrial) return null
  if (daysLeft === null) return null

  const severity = severityFor(daysLeft, isTrial)
  if (severity === 'hidden') return null

  // Allow dismissal only on the lowest-urgency tier. Once ≤3 days we force the
  // banner to stay — that's when attention matters most.
  const isDismissible = severity === 'info'
  if (dismissed && isDismissible) return null

  const handleUpgrade = () => {
    api.dialog.openExternal(PRICING_URL)
  }

  const handleDismiss = () => {
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1') } catch { /* noop */ }
    setDismissed(true)
  }

  const styles = bannerStyles(severity)
  const { title, cta } = bannerCopy(severity, daysLeft, isTrial)

  return (
    <div className={`flex items-center gap-3 px-4 py-2 border-b ${styles.container}`}>
      <Icon icon={styles.icon} className={`text-base flex-shrink-0 ${styles.iconColor}`} />
      <span className={`text-sm flex-1 ${styles.text}`}>{title}</span>
      <button
        onClick={handleUpgrade}
        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${styles.button}`}
      >
        {cta}
      </button>
      {isDismissible && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className={`p-1 rounded-md transition-colors ${styles.dismiss}`}
        >
          <Icon icon="lucide:x" className="text-sm" />
        </button>
      )}
    </div>
  )
}

function bannerStyles(severity: Severity) {
  switch (severity) {
    case 'expired':
      return {
        container: 'bg-red-500/10 border-red-500/30',
        text: 'text-red-200',
        icon: 'lucide:alert-octagon',
        iconColor: 'text-red-400',
        button: 'bg-red-500 hover:bg-red-400 text-white',
        dismiss: 'hover:bg-red-500/20 text-red-300',
      }
    case 'urgent':
      return {
        container: 'bg-amber-500/15 border-amber-500/40',
        text: 'text-amber-100',
        icon: 'lucide:alarm-clock',
        iconColor: 'text-amber-400',
        button: 'bg-amber-500 hover:bg-amber-400 text-black',
        dismiss: 'hover:bg-amber-500/20 text-amber-300',
      }
    case 'warn':
      return {
        container: 'bg-amber-500/10 border-amber-500/30',
        text: 'text-amber-100',
        icon: 'lucide:clock',
        iconColor: 'text-amber-400',
        button: 'bg-amber-500 hover:bg-amber-400 text-black',
        dismiss: 'hover:bg-amber-500/20 text-amber-300',
      }
    case 'info':
    default:
      return {
        container: 'bg-blue-500/10 border-blue-500/20',
        text: 'text-blue-100',
        icon: 'lucide:info',
        iconColor: 'text-blue-400',
        button: 'bg-blue-500 hover:bg-blue-400 text-white',
        dismiss: 'hover:bg-blue-500/20 text-blue-300',
      }
  }
}

function bannerCopy(severity: Severity, daysLeft: number, isTrial: boolean): { title: string; cta: string } {
  const product = isTrial ? 'trial' : 'license'
  if (severity === 'expired') {
    return {
      title: isTrial
        ? 'Your Pro trial has ended — you\'re now on the Free plan.'
        : 'Your Pilos license has expired.',
      cta: 'Renew',
    }
  }
  if (severity === 'urgent') {
    const unit = daysLeft === 1 ? 'day' : 'hours'
    const count = daysLeft === 1 ? '1' : 'less than 24'
    return {
      title: `Your ${product} ends in ${count} ${unit}. Upgrade now to keep Pro access.`,
      cta: 'Upgrade',
    }
  }
  if (severity === 'warn') {
    return {
      title: `Your ${product} ends in ${daysLeft} days. Upgrade to keep your workflows, agents, and integrations.`,
      cta: 'Upgrade',
    }
  }
  return {
    title: `Your ${product} ends in ${daysLeft} days.`,
    cta: 'Upgrade',
  }
}
