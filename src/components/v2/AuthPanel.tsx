import { useState, type FormEvent } from 'react'
import { Icon } from '../common/Icon'
import { useLicenseStore } from '../../store/useLicenseStore'

type Mode = 'signup' | 'signin' | 'reset'

interface Props {
  /** Copy shown above the form. */
  title?: string
  subtitle?: string
  /** Which form to show first. Sign-up leads, since most people arrive new. */
  initialMode?: Mode
  onDone?: () => void
}

const MIN_PASSWORD = 8

/**
 * Email + password sign-up / sign-in.
 *
 * Creating an account is free and unlocks nothing on its own — Pilos is free
 * either way. It exists so cloud-backed features (hosted Reporter, device
 * pairing, cross-device usage sync) have an identity to attach to, which is why
 * this is never a launch blocker: the app is fully usable signed out.
 */
export function AuthPanel({ title, subtitle, initialMode = 'signup', onDone }: Props) {
  const registerAccount = useLicenseStore((s) => s.registerAccount)
  const loginAccount = useLicenseStore((s) => s.loginAccount)
  const requestPasswordReset = useLicenseStore((s) => s.requestPasswordReset)
  const isValidating = useLicenseStore((s) => s.isValidating)

  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const trimmedEmail = email.trim()
  const canSubmit =
    mode === 'reset'
      ? !!trimmedEmail
      : !!trimmedEmail && password.length >= MIN_PASSWORD

  const switchMode = (next: Mode) => {
    setMode(next)
    setLocalError(null)
    setNotice(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || isValidating) return
    setLocalError(null)
    setNotice(null)

    if (mode === 'reset') {
      const result = await requestPasswordReset(trimmedEmail)
      if (result.ok) {
        setNotice('If that email has an account, a reset link is on its way.')
      } else {
        setLocalError(result.error || 'Could not send the reset email')
      }
      return
    }

    const result =
      mode === 'signup'
        ? await registerAccount(trimmedEmail, password)
        : await loginAccount(trimmedEmail, password)

    if (result.ok) {
      setPassword('')
      onDone?.()
    } else {
      setLocalError(result.error || 'Something went wrong')
    }
  }

  const heading =
    title ?? (mode === 'signup' ? 'Create your free account' : mode === 'signin' ? 'Sign in' : 'Reset your password')

  const sub =
    subtitle ??
    (mode === 'reset'
      ? "We'll email you a link to choose a new password."
      : 'Pilos Agents is free — an account just syncs your work across devices.')

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 className="section-label" style={{ margin: 0 }}>{heading}</h3>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 6, marginBottom: 0 }}>{sub}</p>
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        autoComplete="email"
        className="control"
      />

      {mode !== 'reset' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? `Password (min ${MIN_PASSWORD} characters)` : 'Password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="control"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="btn sm ghost icon"
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} style={{ fontSize: 13 }} />
          </button>
        </div>
      )}

      {localError && <p style={{ fontSize: 12, color: 'var(--err)', margin: 0 }}>{localError}</p>}
      {notice && <p style={{ fontSize: 12, color: 'var(--ok)', margin: 0 }}>{notice}</p>}

      <button
        type="submit"
        disabled={!canSubmit || isValidating}
        className="btn primary"
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {isValidating
          ? 'Working...'
          : mode === 'signup'
            ? 'Create free account'
            : mode === 'signin'
              ? 'Sign in'
              : 'Send reset link'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
        {mode === 'signup' ? (
          <button type="button" className="btn sm ghost" onClick={() => switchMode('signin')}>
            I already have an account
          </button>
        ) : (
          <button type="button" className="btn sm ghost" onClick={() => switchMode('signup')}>
            Create an account
          </button>
        )}
        {mode !== 'reset' && (
          <button type="button" className="btn sm ghost" onClick={() => switchMode('reset')}>
            Forgot password?
          </button>
        )}
      </div>
    </form>
  )
}
