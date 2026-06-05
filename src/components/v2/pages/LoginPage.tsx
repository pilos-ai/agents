import { useState, useEffect } from 'react'
import { Icon } from '../../common/Icon'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { api } from '../../../api'

const TIER_FEATURES = [
  { tier: 'free', label: 'Free', features: ['Up to 3 agents', 'Up to 3 MCP servers', 'Solo mode', 'Workflow builder'] },
  { tier: 'pro', label: 'Pro', features: ['Unlimited agents & MCP servers', 'Team mode', 'Premium agent templates', 'Priority support'] },
  { tier: 'teams', label: 'Teams', features: ['Everything in Pro', 'Per-seat team access', 'Team mode & sync', 'Shared workspaces'] },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [licenseKey, setLicenseKey] = useState('')
  const [mode, setMode] = useState<'login' | 'free' | 'recover'>('login')
  const [recoveredKey, setRecoveredKey] = useState<string | null>(null)

  const isValidating = useLicenseStore((s) => s.isValidating)
  const error = useLicenseStore((s) => s.error)
  const loginWithKey = useLicenseStore((s) => s.loginWithKey)
  const recoverLicense = useLicenseStore((s) => s.recoverLicense)
  const pendingActivation = useLicenseStore((s) => s.pendingActivation)
  const setPendingActivation = useLicenseStore((s) => s.setPendingActivation)

  // Pre-fill email + key when a pilos://activate deep link arrives. User still
  // clicks "Activate & Sign In" — this is intentional confirmation, not auto-login.
  useEffect(() => {
    if (pendingActivation?.key) {
      setMode('login')
      if (pendingActivation.email) setEmail(pendingActivation.email)
      setLicenseKey(pendingActivation.key)
      setPendingActivation(null)
    }
  }, [pendingActivation, setPendingActivation])

  const handleLogin = async () => {
    if (!email.trim()) return
    if (mode === 'login' && !licenseKey.trim()) return
    await loginWithKey(email.trim(), mode === 'login' ? licenseKey.trim() : undefined)
  }

  const handleRecover = async () => {
    if (!email.trim()) return
    const result = await recoverLicense(email.trim())
    if (result.found && result.key) {
      setRecoveredKey(result.key)
      setLicenseKey(result.key)
      setMode('login')
    }
  }

  const handleGetLicense = () => {
    api.dialog.openExternal('https://pilos.net')
  }

  return (
    <div className="onb">
      <div className="onb-glow" />
      <div className="onb-card pop-in" style={{ width: 480 }}>
        {/* Header */}
        <div className="row" style={{ gap: 12 }}>
          <div className="rail-logo" style={{ width: 40, height: 40 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Welcome to Pilos
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {mode === 'recover'
                ? 'Recover your license key'
                : mode === 'free'
                  ? 'Start with the free plan'
                  : 'Sign in with your license key'}
            </div>
          </div>
        </div>

        {/* Mode tabs — hidden in recover */}
        {mode !== 'recover' && (
          <div className="seg" style={{ marginTop: 18, width: '100%' }}>
            <button
              className={mode === 'login' ? 'on' : ''}
              onClick={() => setMode('login')}
              style={{ flex: 1 }}
            >
              License key
            </button>
            <button
              className={mode === 'free' ? 'on' : ''}
              onClick={() => setMode('free')}
              style={{ flex: 1 }}
            >
              Free plan
            </button>
          </div>
        )}

        <div className="divider" />

        {/* Recovered key success */}
        {recoveredKey && mode === 'login' && (
          <div
            className="row"
            style={{
              gap: 8,
              padding: '10px 12px',
              borderRadius: 'var(--r-sm)',
              background: 'rgba(62,207,142,0.08)',
              border: '1px solid rgba(62,207,142,0.25)',
              color: 'var(--ok)',
              fontSize: 12,
              marginBottom: 12,
              alignItems: 'flex-start',
            }}
          >
            <Icon icon="lucide:check-circle" className="text-[14px]" style={{ marginTop: 2 }} />
            License key recovered! Click "Activate & Sign In" to continue.
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              display: 'block',
              marginBottom: 6,
            }}
          >
            Email address
          </label>
          <div className="cli-box" style={{ margin: 0 }}>
            <Icon icon="lucide:mail" className="text-[14px]" style={{ color: 'var(--muted)' }} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              disabled={isValidating}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (mode === 'recover') handleRecover()
                  else handleLogin()
                }
              }}
            />
          </div>
        </div>

        {/* License key — login mode only */}
        {mode === 'login' && (
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              License key
            </label>
            <div className="cli-box" style={{ margin: 0 }}>
              <Icon icon="lucide:key-round" className="text-[14px]" style={{ color: 'var(--muted)' }} />
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="PILOS-XXXX-XXXX-XXXX"
                disabled={isValidating}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>
        )}

        {/* Recovery info */}
        {mode === 'recover' && (
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            Enter the email address associated with your license. If a valid license is found, your key will be recovered.
          </p>
        )}

        {/* Error */}
        {error && (
          <div
            className="row"
            style={{
              gap: 8,
              padding: '10px 12px',
              borderRadius: 'var(--r-sm)',
              background: 'rgba(251,111,111,0.08)',
              border: '1px solid rgba(251,111,111,0.25)',
              color: 'var(--err)',
              fontSize: 12,
              margin: '4px 0 12px',
              alignItems: 'flex-start',
            }}
          >
            <Icon icon="lucide:alert-circle" className="text-[14px]" style={{ marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        {mode === 'recover' ? (
          <button
            onClick={handleRecover}
            disabled={isValidating || !email.trim()}
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isValidating ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin text-[15px]" />
                Searching...
              </>
            ) : (
              <>
                <Icon icon="lucide:search" className="text-[15px]" />
                Recover license
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleLogin}
            disabled={isValidating || !email.trim() || (mode === 'login' && !licenseKey.trim())}
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isValidating ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin text-[15px]" />
                Validating...
              </>
            ) : mode === 'login' ? (
              <>
                <Icon icon="lucide:log-in" className="text-[15px]" />
                Activate & Sign In
              </>
            ) : (
              <>
                <Icon icon="lucide:arrow-right" className="text-[15px]" />
                Continue with free plan
              </>
            )}
          </button>
        )}

        {/* Sub-links */}
        {mode === 'login' && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button
              onClick={handleGetLicense}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-2)',
                fontSize: 12,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Don't have a license key? Get one at pilos.net
            </button>
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => {
                  setMode('recover')
                  setRecoveredKey(null)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Lost your license key? Recover it
              </button>
            </div>
          </div>
        )}

        {mode === 'recover' && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button
              onClick={() => setMode('login')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                fontSize: 11.5,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Back to login
            </button>
          </div>
        )}

        {/* Tier comparison */}
        {mode !== 'recover' && (
          <>
            <div className="divider" />
            <div className="grid-cards gc-2">
              {TIER_FEATURES.map(({ tier, label, features }) => {
                const highlighted =
                  (mode === 'login' && tier === 'pro') || (mode === 'free' && tier === 'free')
                return (
                  <div key={tier} className={`tile${highlighted ? ' selected' : ''}`} style={{ padding: 14 }}>
                    <div style={{ marginBottom: 8 }}>
                      <span className={tier === 'pro' ? 'tag pro' : 'tag'}>{label}</span>
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {features.map((f) => (
                        <li
                          key={f}
                          className="row"
                          style={{ gap: 6, alignItems: 'flex-start', padding: '2px 0' }}
                        >
                          <Icon
                            icon="lucide:check"
                            className="text-[11px]"
                            style={{ color: 'var(--ok)', marginTop: 3, flex: 'none' }}
                          />
                          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <p
          className="muted"
          style={{ textAlign: 'center', fontSize: 10, marginTop: 18, fontFamily: 'var(--mono)' }}
        >
          Pilos Agents v{__APP_VERSION__}
        </p>
      </div>
    </div>
  )
}
