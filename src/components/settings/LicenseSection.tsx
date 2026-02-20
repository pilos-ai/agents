import { useState } from 'react'
import { useLicenseStore } from '../../store/useLicenseStore'

const TIER_COLORS: Record<string, string> = {
  free: 'bg-neutral-700 text-neutral-300',
  pro: 'bg-amber-500/20 text-amber-400',
  teams: 'bg-purple-500/20 text-purple-400',
}

export function LicenseSection() {
  const tier = useLicenseStore((s) => s.tier)
  const licenseKey = useLicenseStore((s) => s.licenseKey)
  const email = useLicenseStore((s) => s.email)
  const isValidating = useLicenseStore((s) => s.isValidating)
  const error = useLicenseStore((s) => s.error)
  const activateLicense = useLicenseStore((s) => s.activateLicense)
  const deactivateLicense = useLicenseStore((s) => s.deactivateLicense)

  const [keyInput, setKeyInput] = useState('')

  const handleActivate = async () => {
    if (!keyInput.trim()) return
    const result = await activateLicense(keyInput.trim())
    if (result.valid) setKeyInput('')
  }

  return (
    <div className="space-y-3">
      {/* Current tier */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">Current plan:</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${TIER_COLORS[tier] || TIER_COLORS.free}`}>
          {tier}
        </span>
      </div>

      {/* Licensed state */}
      {licenseKey ? (
        <div className="space-y-2">
          <div className="p-3 rounded-lg border border-neutral-700 bg-neutral-800/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">License key</span>
              <span className="text-xs font-mono text-neutral-300">
                {licenseKey.slice(0, 10)}...{licenseKey.slice(-4)}
              </span>
            </div>
            {email && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Email</span>
                <span className="text-xs text-neutral-300">{email}</span>
              </div>
            )}
          </div>
          <button
            onClick={deactivateLicense}
            disabled={isValidating}
            className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            {isValidating ? 'Deactivating...' : 'Deactivate License'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="PILOS-PRO-XXXX-XXXX"
              className="flex-1 bg-neutral-800 text-neutral-100 text-xs rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500 font-mono placeholder:text-neutral-600"
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
            />
            <button
              onClick={handleActivate}
              disabled={isValidating || !keyInput.trim()}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isValidating ? 'Validating...' : 'Activate'}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-1">
            <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Free tier includes</p>
            <p className="text-xs text-neutral-400">Solo mode, up to 3 agents, 3 MCP servers</p>
            <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider mt-2">Pro unlocks</p>
            <p className="text-xs text-neutral-400">Unlimited agents & MCP servers, team mode, premium templates</p>
          </div>
        </div>
      )}
    </div>
  )
}
