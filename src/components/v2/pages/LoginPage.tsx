import { useState } from 'react'
import { Icon } from '../../common/Icon'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { api } from '../../../api'

const TIER_FEATURES = [
  { tier: 'free', features: ['Up to 3 agents', 'Up to 3 MCP servers', 'Solo mode', 'Workflow builder'] },
  { tier: 'pro', features: ['Unlimited agents & MCP servers', 'Team mode', 'Premium agent templates', 'Priority support'] },
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
    <div className="flex-1 flex items-center justify-center overflow-y-auto">
      <div className="w-full max-w-md mx-4">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-xl shadow-blue-600/20 mb-5">
            <Icon icon="lucide:bot" className="text-white text-3xl" />
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-1">Welcome to Pilos</h1>
          <p className="text-sm text-zinc-500">
            {mode === 'recover' ? 'Recover your license key' : 'Sign in to start managing your AI agents'}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-pilos-card border border-pilos-border rounded-xl overflow-hidden">
          {/* Tab Selector — hidden in recover mode */}
          {mode !== 'recover' && (
            <div className="flex border-b border-pilos-border">
              <button
                onClick={() => setMode('login')}
                className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${
                  mode === 'login'
                    ? 'text-white bg-pilos-bg border-b-2 border-blue-500'
                    : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                License Key
              </button>
              <button
                onClick={() => setMode('free')}
                className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${
                  mode === 'free'
                    ? 'text-white bg-pilos-bg border-b-2 border-blue-500'
                    : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                Free Plan
              </button>
            </div>
          )}

          {/* Recover mode header */}
          {mode === 'recover' && (
            <div className="flex items-center gap-2 px-6 pt-5 pb-2">
              <Icon icon="lucide:search" className="text-blue-400 text-sm" />
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Recover License</span>
            </div>
          )}

          <div className="p-6 space-y-4">
            {/* Recovered key success banner */}
            {recoveredKey && mode === 'login' && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <Icon icon="lucide:check-circle" className="text-emerald-400 text-sm flex-shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-300">
                  License key recovered! Click "Activate & Sign In" to continue.
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">
                Email Address
              </label>
              <div className="relative">
                <Icon icon="lucide:mail" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  disabled={isValidating}
                  className="w-full pl-9 pr-3 py-2.5 bg-pilos-bg border border-pilos-border rounded-lg text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && (mode === 'recover' ? handleRecover() : handleLogin())}
                />
              </div>
            </div>

            {/* License Key — only in login mode */}
            {mode === 'login' && (
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">
                  License Key
                </label>
                <div className="relative">
                  <Icon icon="lucide:key-round" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm" />
                  <input
                    type="text"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    placeholder="PILOS-XXXX-XXXX-XXXX"
                    disabled={isValidating}
                    className="w-full pl-9 pr-3 py-2.5 bg-pilos-bg border border-pilos-border rounded-lg text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500 disabled:opacity-50 font-mono transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>
              </div>
            )}

            {/* Recovery info text */}
            {mode === 'recover' && (
              <p className="text-xs text-zinc-500">
                Enter the email address associated with your license. If a valid license is found, your key will be recovered.
              </p>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                <Icon icon="lucide:alert-circle" className="text-red-400 text-sm flex-shrink-0 mt-0.5" />
                <span className="text-xs text-red-300">{error}</span>
              </div>
            )}

            {/* Submit */}
            {mode === 'recover' ? (
              <button
                onClick={handleRecover}
                disabled={isValidating || !email.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                {isValidating ? (
                  <>
                    <Icon icon="lucide:loader-2" className="text-sm animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Icon icon="lucide:search" className="text-sm" />
                    Recover License
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleLogin}
                disabled={isValidating || !email.trim() || (mode === 'login' && !licenseKey.trim())}
                className="w-full py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                {isValidating ? (
                  <>
                    <Icon icon="lucide:loader-2" className="text-sm animate-spin" />
                    Validating...
                  </>
                ) : mode === 'login' ? (
                  <>
                    <Icon icon="lucide:log-in" className="text-sm" />
                    Activate & Sign In
                  </>
                ) : (
                  <>
                    <Icon icon="lucide:arrow-right" className="text-sm" />
                    Continue with Free Plan
                  </>
                )}
              </button>
            )}

            {/* Links */}
            {mode === 'login' && (
              <div className="text-center space-y-1.5">
                <button
                  onClick={handleGetLicense}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Don't have a license key? Get one at pilos.net
                </button>
                <button
                  onClick={() => { setMode('recover'); setRecoveredKey(null) }}
                  className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors block mx-auto"
                >
                  Lost your license key? Recover it
                </button>
              </div>
            )}

            {mode === 'recover' && (
              <div className="text-center">
                <button
                  onClick={() => setMode('login')}
                  className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
                >
                  Back to login
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Feature comparison — hidden in recover mode */}
        {mode !== 'recover' && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {TIER_FEATURES.map(({ tier, features }) => (
              <div
                key={tier}
                className={`p-4 rounded-xl border transition-colors ${
                  (mode === 'login' && tier === 'pro') || (mode === 'free' && tier === 'free')
                    ? 'border-blue-500/30 bg-blue-500/5'
                    : 'border-pilos-border bg-pilos-card'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                    tier === 'pro'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {tier}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Icon icon="lucide:check" className="text-emerald-500 text-[10px] mt-0.5 flex-shrink-0" />
                      <span className="text-[11px] text-zinc-400">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Version */}
        <p className="text-center text-[10px] text-zinc-700 mt-6">
          Pilos Agents v2.1.0-alpha
        </p>
      </div>
    </div>
  )
}
