import { useState, useEffect, useCallback, type ComponentType } from 'react'
import { Icon } from '../../common/Icon'
import { FormInput } from '../components/FormInput'
import { FormSelect } from '../components/FormSelect'
import { FormToggle } from '../components/FormToggle'
import { useAppStore } from '../../../store/useAppStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { MCP_SERVER_TEMPLATES } from '../../../data/mcp-server-templates'
import { api } from '../../../api'
import type { StorageStats } from '../../../types'

function UpgradeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-pilos-card border border-pilos-border rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Upgrade to Pro</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Unlimited agents, MCP integrations & more</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <Icon icon="lucide:x" className="text-lg" />
          </button>
        </div>

        <div className="space-y-1 text-xs text-zinc-400">
          <div className="flex justify-between py-1.5 border-b border-pilos-border">
            <span>Pro · Monthly</span><span className="text-white font-semibold">$12/mo</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-pilos-border">
            <span>Pro · Annual</span><span className="text-white font-semibold">$96/yr <span className="text-green-400 text-[10px]">Save 33%</span></span>
          </div>
          <div className="flex justify-between py-1.5">
            <span>Teams · Monthly</span><span className="text-white font-semibold">$19/seat</span>
          </div>
        </div>

        <button
          onClick={() => { api.dialog.openExternal('https://pilos.net/pricing'); onClose() }}
          className="w-full px-3 py-2.5 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
        >
          <Icon icon="lucide:credit-card" className="text-sm" />
          Pay with Card — pilos.net/pricing
        </button>

        <p className="text-[10px] text-zinc-600 text-center">
          Secure checkout via Stripe. License key delivered to your email instantly.
        </p>
      </div>
    </div>
  )
}

// Lazy-load Jira integration card from PM package
let PmJiraIntegrationCard: ComponentType | null = null
let pmIntegrationAttempted = false

function loadPmIntegration() {
  if (pmIntegrationAttempted) return Promise.resolve()
  pmIntegrationAttempted = true
  return import('@pilos/agents-pm')
    .then((mod) => {
      PmJiraIntegrationCard = mod.JiraIntegrationCard
    })
    .catch(() => {})
}

// Lazy-load Jira store for OAuth connect
let jiraStoreRef: { useJiraStore: any } | null = null
async function loadJiraStore() {
  if (jiraStoreRef) return jiraStoreRef
  try {
    const mod = await import('@pilos/agents-pm')
    jiraStoreRef = { useJiraStore: mod.useJiraStore }
    return jiraStoreRef
  } catch {
    return null
  }
}

type SettingsNav = 'account' | 'general' | 'integrations' | 'devices' | 'security' | 'advanced'

const allNavItems: { id: SettingsNav; label: string; icon: string; featureFlag?: string }[] = [
  { id: 'account', label: 'Account', icon: 'lucide:user' },
  { id: 'general', label: 'General', icon: 'lucide:settings' },
  { id: 'integrations', label: 'Integrations', icon: 'lucide:plug-zap' },
  { id: 'devices', label: 'Devices', icon: 'lucide:smartphone', featureFlag: 'devices' },
  { id: 'security', label: 'Security', icon: 'lucide:shield-check' },
  { id: 'advanced', label: 'Advanced', icon: 'lucide:code' },
]

function AccountSection() {
  const cliVersion = useAppStore((s) => s.cliVersion)
  const email = useLicenseStore((s) => s.email)
  const tier = useLicenseStore((s) => s.tier)
  const licenseKey = useLicenseStore((s) => s.licenseKey)
  const isValidating = useLicenseStore((s) => s.isValidating)
  const error = useLicenseStore((s) => s.error)
  const machineMismatch = useLicenseStore((s) => s.machineMismatch)
  const activateLicense = useLicenseStore((s) => s.activateLicense)
  const deactivateLicense = useLicenseStore((s) => s.deactivateLicense)
  const logout = useLicenseStore((s) => s.logout)

  const [keyInput, setKeyInput] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const tierColors: Record<string, string> = {
    free: 'bg-zinc-700 text-zinc-400',
    pro: 'bg-amber-500/20 text-amber-400',
    teams: 'bg-purple-500/20 text-purple-400',
  }

  const handleActivate = async () => {
    if (!keyInput.trim()) return
    const result = await activateLicense(keyInput.trim())
    if (result.valid) {
      setKeyInput('')
      setShowKeyInput(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Account</h2>
        <p className="text-xs text-zinc-500">Your account information and subscription</p>
      </div>

      {/* User Profile */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600/20 to-indigo-700/20 rounded-full flex items-center justify-center border border-blue-500/20">
            <span className="text-lg font-bold text-blue-400">
              {email ? email[0].toUpperCase() : 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{email || 'Unknown'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${tierColors[tier] || tierColors.free}`}>
                {tier}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Workspace Setup */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Workspace Setup</h3>
            <p className="text-[10px] text-zinc-600 mt-1">Re-run the onboarding wizard to generate new role-based tasks and workflows</p>
          </div>
          <button
            onClick={async () => {
              await useAppStore.getState().resetWorkspaceSetup()
            }}
            className="px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Icon icon="lucide:refresh-cw" className="text-[10px]" />
            Re-run Setup
          </button>
        </div>
      </div>

      {/* License Management */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">License</h3>
          {licenseKey && (
            <button
              onClick={deactivateLicense}
              disabled={isValidating}
              className="text-[10px] text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              Deactivate
            </button>
          )}
        </div>

        {machineMismatch && licenseKey && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <Icon icon="lucide:alert-triangle" className="text-amber-400 text-sm flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-amber-300">License is active on another machine.</span>
              <button
                onClick={() => activateLicense(licenseKey)}
                disabled={isValidating}
                className="text-xs text-blue-400 hover:text-blue-300 ml-1 disabled:opacity-50"
              >
                Re-activate here
              </button>
            </div>
          </div>
        )}

        {licenseKey ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-zinc-500">License Key</span>
              <span className="text-xs font-mono text-zinc-300">
                {licenseKey.slice(0, 10)}...{licenseKey.slice(-4)}
              </span>
            </div>
            {!showKeyInput ? (
              <button
                onClick={() => setShowKeyInput(true)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Change license key
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="PILOS-XXXX-XXXX-XXXX"
                  className="flex-1 bg-pilos-bg text-white text-xs rounded-lg px-3 py-2 outline-none border border-pilos-border focus:border-blue-500 font-mono placeholder:text-zinc-600"
                  onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
                />
                <button
                  onClick={handleActivate}
                  disabled={isValidating || !keyInput.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {isValidating ? '...' : 'Activate'}
                </button>
                <button
                  onClick={() => { setShowKeyInput(false); setKeyInput('') }}
                  className="px-2 py-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Icon icon="lucide:x" className="text-xs" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">No license key activated. You're on the free plan.</p>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="w-full px-3 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <Icon icon="lucide:zap" className="text-sm" />
              Upgrade to Pro — from $12/mo
            </button>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="PILOS-XXXX-XXXX-XXXX"
                className="flex-1 bg-pilos-bg text-white text-xs rounded-lg px-3 py-2 outline-none border border-pilos-border focus:border-blue-500 font-mono placeholder:text-zinc-600"
                onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              />
              <button
                onClick={handleActivate}
                disabled={isValidating || !keyInput.trim()}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isValidating ? 'Validating...' : 'Activate Pro'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* Version Info */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-400">Claude CLI Version</p>
            <p className="text-sm font-bold text-white mt-0.5">{cliVersion || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400">App Version</p>
            <p className="text-sm font-bold text-white mt-0.5">2.1.0-alpha</p>
          </div>
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </div>
  )
}

function GeneralSection() {
  const activeTab = useProjectStore((s) => {
    const path = s.activeProjectPath
    return s.openProjects.find((p) => p.projectPath === path)
  })
  const setProjectModel = useProjectStore((s) => s.setProjectModel)
  const setProjectPermissionMode = useProjectStore((s) => s.setProjectPermissionMode)
  const setProjectMode = useProjectStore((s) => s.setProjectMode)
  const terminalFontSize = useAppStore((s) => s.terminalFontSize)
  const setTerminalFontSize = useAppStore((s) => s.setTerminalFontSize)

  const [backgroundMode, setBackgroundMode] = useState(true)
  const [notifications, setNotifications] = useState(true)

  useEffect(() => {
    api.settings.get('backgroundMode').then((v) => { if (v !== null && v !== undefined) setBackgroundMode(!!v) })
    api.settings.get('notificationsEnabled').then((v) => { if (v !== null && v !== undefined) setNotifications(!!v) })
  }, [])

  const model = activeTab?.model || 'sonnet'
  const permissionMode = activeTab?.permissionMode || 'default'
  const mode = activeTab?.mode || 'solo'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">General</h2>
        <p className="text-xs text-zinc-500">Application and project settings</p>
      </div>

      {activeTab && (
        <>
          <div>
            <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4">Project Settings</h3>
            <div className="space-y-4">
              <FormSelect
                label="Model"
                value={model}
                onChange={(e) => setProjectModel(e.target.value)}
                options={[
                  { value: 'sonnet', label: 'Claude Sonnet' },
                  { value: 'opus', label: 'Claude Opus' },
                  { value: 'haiku', label: 'Claude Haiku' },
                ]}
              />
              <FormSelect
                label="Permission Mode"
                value={permissionMode}
                onChange={(e) => setProjectPermissionMode(e.target.value)}
                options={[
                  { value: 'default', label: 'Default (Ask)' },
                  { value: 'bypass', label: 'Auto-approve' },
                  { value: 'plan', label: 'Plan Mode' },
                ]}
              />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-zinc-300">Team Mode</p>
                  <p className="text-[10px] text-zinc-600">Enable multi-agent collaboration</p>
                </div>
                <FormToggle
                  checked={mode === 'team'}
                  onChange={(checked) => setProjectMode(checked ? 'team' : 'solo')}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <div>
        <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4">Appearance</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-300">Terminal Font Size</p>
              <p className="text-[10px] text-zinc-600">{terminalFontSize}px</p>
            </div>
            <input
              type="range"
              min="10"
              max="20"
              value={terminalFontSize}
              onChange={(e) => setTerminalFontSize(Number(e.target.value))}
              className="w-32 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4">Background</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-300">Run in background</p>
              <p className="text-[10px] text-zinc-600">
                Keep running in the menu bar when the window is closed. Scheduled tasks continue automatically.
              </p>
            </div>
            <FormToggle
              checked={backgroundMode}
              onChange={(checked) => {
                setBackgroundMode(checked)
                api.settings.set('backgroundMode', checked)
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-300">Desktop notifications</p>
              <p className="text-[10px] text-zinc-600">
                Show notifications when scheduled tasks complete or fail
              </p>
            </div>
            <FormToggle
              checked={notifications}
              onChange={(checked) => {
                setNotifications(checked)
                api.settings.set('notificationsEnabled', checked)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function IntegrationsSection() {
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'
  const [jiraLoaded, setJiraLoaded] = useState(!!PmJiraIntegrationCard)
  const [jiraConnected, setJiraConnected] = useState(false)
  const [jiraConnecting, setJiraConnecting] = useState(false)

  // GitHub
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const addProjectMcpServer = useProjectStore((s) => s.addProjectMcpServer)
  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const mcpServers = activeTab?.mcpServers || []
  const githubServer = mcpServers.find((s) => s.name.toLowerCase().includes('github'))
  const githubConnected = !!githubServer?.enabled
  const [showGithubSetup, setShowGithubSetup] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [githubConnecting, setGithubConnecting] = useState(false)

  useEffect(() => {
    if (isPro && !PmJiraIntegrationCard) {
      loadPmIntegration().then(() => setJiraLoaded(!!PmJiraIntegrationCard))
    }
  }, [isPro])

  // Check Jira connection on mount
  useEffect(() => {
    loadJiraStore().then((mod) => {
      if (mod) {
        setJiraConnected(mod.useJiraStore.getState().connected)
      }
    })
  }, [])

  const handleJiraConnect = useCallback(async () => {
    const mod = await loadJiraStore()
    if (!mod) return
    setJiraConnecting(true)
    try {
      await mod.useJiraStore.getState().authorize()
      await mod.useJiraStore.getState().checkConnection()
      setJiraConnected(mod.useJiraStore.getState().connected)
    } catch {
      // cancelled
    } finally {
      setJiraConnecting(false)
    }
  }, [])

  const handleGithubConnect = useCallback(async () => {
    if (!githubToken.trim()) return
    setGithubConnecting(true)
    try {
      const tmpl = MCP_SERVER_TEMPLATES.find((t) => t.id === 'github')
      if (tmpl && tmpl.config.type === 'stdio') {
        addProjectMcpServer({
          id: crypto.randomUUID(),
          name: tmpl.name,
          icon: tmpl.icon,
          description: tmpl.description,
          enabled: true,
          config: {
            type: 'stdio',
            command: tmpl.config.command,
            args: tmpl.config.args,
            env: { ...tmpl.config.env, GITHUB_TOKEN: githubToken.trim() },
          },
        })
        setShowGithubSetup(false)
        setGithubToken('')
      }
    } finally {
      setGithubConnecting(false)
    }
  }, [githubToken, addProjectMcpServer])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Integrations</h2>
        <p className="text-xs text-zinc-500">Connect external services and MCP servers</p>
      </div>

      <div className="space-y-3">
        {/* Jira */}
        <div className="bg-pilos-card border border-pilos-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Icon icon="logos:jira" className="text-lg" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">Jira</p>
                <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">Pro</span>
              </div>
              <p className="text-[10px] text-zinc-500">Atlassian issue tracking</p>
            </div>
            {jiraConnected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
                <Icon icon="lucide:check-circle-2" className="text-xs" />
                Connected
              </span>
            ) : (
              <button
                onClick={isPro ? handleJiraConnect : undefined}
                disabled={!isPro || jiraConnecting}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                {jiraConnecting ? (
                  <>
                    <Icon icon="lucide:loader-2" className="text-xs animate-spin" />
                    Connecting...
                  </>
                ) : isPro ? (
                  'Connect'
                ) : (
                  'Upgrade'
                )}
              </button>
            )}
          </div>
          {isPro && jiraConnected && jiraLoaded && PmJiraIntegrationCard && (
            <div className="border-t border-pilos-border px-4 pb-4 pt-3">
              <PmJiraIntegrationCard />
            </div>
          )}
        </div>

        {/* GitHub */}
        <div className="bg-pilos-card border border-pilos-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <Icon icon="logos:github-icon" className="text-lg" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">GitHub</p>
              <p className="text-[10px] text-zinc-500">Issues, PRs, code search</p>
            </div>
            {githubConnected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
                <Icon icon="lucide:check-circle-2" className="text-xs" />
                Connected
              </span>
            ) : (
              <button
                onClick={() => setShowGithubSetup(!showGithubSetup)}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
              >
                Connect
              </button>
            )}
          </div>
          {showGithubSetup && !githubConnected && (
            <div className="border-t border-pilos-border px-4 pb-4 pt-3 space-y-3">
              <p className="text-[11px] text-zinc-500">
                Create a <span className="text-zinc-300">Personal Access Token</span> at GitHub &gt; Settings &gt; Developer settings &gt; Tokens (classic) with <span className="text-zinc-300">repo</span> scope.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="flex-1 bg-zinc-900 border border-pilos-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
                <button
                  onClick={handleGithubConnect}
                  disabled={!githubToken.trim() || githubConnecting}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {githubConnecting ? (
                    <Icon icon="lucide:loader-2" className="text-xs animate-spin" />
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Slack */}
        <div className="flex items-center gap-3 p-4 bg-pilos-card border border-pilos-border rounded-xl">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
            <Icon icon="logos:slack-icon" className="text-lg" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Slack</p>
            <p className="text-[10px] text-zinc-500">Team notifications</p>
          </div>
          <button className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors">
            Connect
          </button>
        </div>

        {/* Linear */}
        <div className="flex items-center gap-3 p-4 bg-pilos-card border border-pilos-border rounded-xl">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
            <Icon icon="logos:linear-icon" className="text-lg" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Linear</p>
            <p className="text-[10px] text-zinc-500">Issue tracking</p>
          </div>
          <button className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors">
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}

function DevicesSection() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrExpiry, setQrExpiry] = useState<number>(0)
  const [countdown, setCountdown] = useState('')
  const [devices, setDevices] = useState<Array<{ device_id: string; device_name: string; created_at: string; last_seen_at: string }>>([])
  const [pendingRequest, setPendingRequest] = useState<{ requestId: string; deviceName: string; deviceId: string } | null>(null)
  const [relayStatus, setRelayStatus] = useState<{ connected: boolean; mobileCount: number }>({ connected: false, mobileCount: 0 })
  const [revoking, setRevoking] = useState<string | null>(null)

  // Load devices & status on mount
  useEffect(() => {
    api.mobile.getStatus().then(setRelayStatus)
    api.mobile.listPairedDevices().then(setDevices).catch(() => {})

    const unsubStatus = api.mobile.onStatus(setRelayStatus)
    const unsubRequest = api.mobile.onPairingRequest((data) => {
      setPendingRequest(data)
    })
    const unsubApproved = api.mobile.onDeviceApproved(() => {
      api.mobile.listPairedDevices().then(setDevices).catch(() => {})
      setPendingRequest(null)
    })
    const unsubRevoked = api.mobile.onDeviceRevoked(({ deviceId }) => {
      setDevices((prev) => prev.filter((d) => d.device_id !== deviceId))
    })

    return () => {
      unsubStatus()
      unsubRequest()
      unsubApproved()
      unsubRevoked()
    }
  }, [])

  // Countdown timer for QR code
  useEffect(() => {
    if (!qrExpiry) return
    const tick = () => {
      const remaining = Math.max(0, qrExpiry - Date.now())
      if (remaining <= 0) {
        setCountdown('')
        setQrDataUrl(null)
        setQrExpiry(0)
        return
      }
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [qrExpiry])

  const generateQR = async () => {
    setQrLoading(true)
    try {
      const { token, expiresAt } = await api.mobile.requestPairingToken()
      const QRCode = (await import('qrcode')).default
      const qrPayload = JSON.stringify({ token, serverUrl: 'wss://license.pilos.net' })
      const dataUrl = await QRCode.toDataURL(qrPayload, {
        width: 256,
        margin: 2,
        color: { dark: '#ffffff', light: '#00000000' },
      })
      setQrDataUrl(dataUrl)
      setQrExpiry(expiresAt)
    } catch (err) {
      console.error('Failed to generate QR:', err)
    } finally {
      setQrLoading(false)
    }
  }

  const handleApprove = () => {
    if (pendingRequest) {
      api.mobile.approvePairing(pendingRequest.requestId)
    }
  }

  const handleDeny = () => {
    if (pendingRequest) {
      api.mobile.denyPairing(pendingRequest.requestId)
      setPendingRequest(null)
    }
  }

  const handleRevoke = async (deviceId: string) => {
    setRevoking(deviceId)
    await api.mobile.revokeDevice(deviceId)
    setRevoking(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Devices</h2>
        <p className="text-xs text-zinc-500">Pair and manage mobile devices</p>
      </div>

      {/* Connection status */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${relayStatus.connected ? 'bg-green-400' : 'bg-zinc-600'}`} />
          <div className="flex-1">
            <p className="text-sm text-white">{relayStatus.connected ? 'Relay Connected' : 'Relay Disconnected'}</p>
            <p className="text-[10px] text-zinc-500">
              {relayStatus.mobileCount > 0
                ? `${relayStatus.mobileCount} mobile device${relayStatus.mobileCount > 1 ? 's' : ''} online`
                : 'No mobile devices connected'}
            </p>
          </div>
        </div>
      </div>

      {/* Pairing Approval Dialog */}
      {pendingRequest && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Icon icon="lucide:smartphone" className="text-blue-400 text-lg" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Pairing Request</p>
              <p className="text-xs text-zinc-400">
                <span className="text-blue-300 font-medium">{pendingRequest.deviceName}</span> wants to connect
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
            >
              Approve
            </button>
            <button
              onClick={handleDeny}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-lg transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {/* QR Code Pairing */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl space-y-4">
        <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Pair New Device</h3>
        <p className="text-xs text-zinc-500">
          Open the Pilos Agents mobile app and scan this QR code to pair your device.
        </p>

        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-zinc-900 rounded-xl border border-pilos-border">
              <img src={qrDataUrl} alt="Pairing QR Code" width={200} height={200} />
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Icon icon="lucide:clock" className="text-xs" />
              <span>Expires in {countdown}</span>
            </div>
            <button
              onClick={generateQR}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Regenerate
            </button>
          </div>
        ) : (
          <button
            onClick={generateQR}
            disabled={qrLoading || !relayStatus.connected}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {qrLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="text-sm animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Icon icon="lucide:qr-code" className="text-sm" />
                Generate QR Code
              </>
            )}
          </button>
        )}
        {!relayStatus.connected && (
          <p className="text-[10px] text-amber-400">Relay server must be connected to generate pairing codes.</p>
        )}
      </div>

      {/* Paired Devices List */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Paired Devices</h3>
          <button
            onClick={() => api.mobile.listPairedDevices().then(setDevices).catch(() => {})}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Refresh
          </button>
        </div>

        {devices.length === 0 ? (
          <p className="text-xs text-zinc-600 py-2">No devices paired yet.</p>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.device_id}
                className="flex items-center gap-3 p-3 bg-zinc-900 rounded-lg border border-pilos-border"
              >
                <Icon icon="lucide:smartphone" className="text-zinc-400 text-base flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{device.device_name}</p>
                  <p className="text-[10px] text-zinc-500">
                    Paired {new Date(device.created_at).toLocaleDateString()}
                    {device.last_seen_at && ` \u00b7 Last seen ${new Date(device.last_seen_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(device.device_id)}
                  disabled={revoking === device.device_id}
                  className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-colors disabled:opacity-50"
                >
                  {revoking === device.device_id ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SecuritySection() {
  const [autoApproveReads, setAutoApproveReads] = useState(true)
  const [requireConfirmDestructive, setRequireConfirmDestructive] = useState(true)
  const [sandboxMode, setSandboxMode] = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState('30')
  const [telemetry, setTelemetry] = useState(false)

  // Load persisted values
  useEffect(() => {
    Promise.all([
      api.settings.get('security_autoApproveReads'),
      api.settings.get('security_requireConfirmDestructive'),
      api.settings.get('security_sandboxMode'),
      api.settings.get('security_sessionTimeout'),
      api.settings.get('security_telemetry'),
    ]).then(([reads, destructive, sandbox, timeout, telem]) => {
      if (reads !== undefined) setAutoApproveReads(reads as boolean)
      if (destructive !== undefined) setRequireConfirmDestructive(destructive as boolean)
      if (sandbox !== undefined) setSandboxMode(sandbox as boolean)
      if (timeout !== undefined) setSessionTimeout(timeout as string)
      if (telem !== undefined) setTelemetry(telem as boolean)
    })
  }, [])

  const toggle = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value)
    api.settings.set(`security_${key}`, value)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Security</h2>
        <p className="text-xs text-zinc-500">Permissions, access control, and privacy</p>
      </div>

      {/* Permissions */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl space-y-4">
        <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Permissions</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white">Auto-approve read-only operations</p>
            <p className="text-[10px] text-zinc-500">File reads, searches, and git status run without confirmation</p>
          </div>
          <FormToggle
            checked={autoApproveReads}
            onChange={(v) => toggle('autoApproveReads', v, setAutoApproveReads)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white">Confirm destructive actions</p>
            <p className="text-[10px] text-zinc-500">Require confirmation for file deletes, git push, and resets</p>
          </div>
          <FormToggle
            checked={requireConfirmDestructive}
            onChange={(v) => toggle('requireConfirmDestructive', v, setRequireConfirmDestructive)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white">Sandbox mode</p>
            <p className="text-[10px] text-zinc-500">Restrict shell commands to project directory only</p>
          </div>
          <FormToggle
            checked={sandboxMode}
            onChange={(v) => toggle('sandboxMode', v, setSandboxMode)}
          />
        </div>
      </div>

      {/* Session */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl space-y-4">
        <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Session</h3>

        <div>
          <FormSelect
            label="Session timeout"
            value={sessionTimeout}
            onChange={(e) => {
              setSessionTimeout(e.target.value)
              api.settings.set('security_sessionTimeout', e.target.value)
            }}
            options={[
              { value: '15', label: '15 minutes' },
              { value: '30', label: '30 minutes' },
              { value: '60', label: '1 hour' },
              { value: '120', label: '2 hours' },
              { value: '0', label: 'Never' },
            ]}
          />
          <p className="text-[10px] text-zinc-600 mt-1">Auto-lock agent sessions after inactivity</p>
        </div>
      </div>

      {/* Privacy */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl space-y-4">
        <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Privacy</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white">Usage telemetry</p>
            <p className="text-[10px] text-zinc-500">Send anonymous usage data to help improve the product</p>
          </div>
          <FormToggle
            checked={telemetry}
            onChange={(v) => toggle('telemetry', v, setTelemetry)}
          />
        </div>
      </div>

      {/* Allowed Paths info */}
      <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl space-y-3">
        <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Access Control</h3>
        <div className="flex items-start gap-3">
          <Icon icon="lucide:shield-check" className="text-green-400 text-lg mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-white mb-1">Path-based access</p>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Agents can only access files within their configured allowed paths. Configure per-agent
              file access in the agent settings under Capabilities &gt; Allowed Paths.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Icon icon="lucide:key-round" className="text-blue-400 text-lg mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-white mb-1">MCP server permissions</p>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Each MCP server runs in its own process with scoped access. Manage connected servers
              in Settings &gt; Integrations.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdvancedSection() {
  const [stats, setStats] = useState<StorageStats | null>(null)

  useEffect(() => {
    api.storage.getStats().then(setStats)
  }, [])

  const handleClearConversations = async () => {
    await api.storage.clearConversations()
    const newStats = await api.storage.getStats()
    setStats(newStats)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Advanced</h2>
        <p className="text-xs text-zinc-500">Storage management and debug options</p>
      </div>

      {stats && (
        <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl space-y-3">
          <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Storage</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-zinc-500">Conversations</p>
              <p className="text-sm font-bold text-white">{stats.conversations}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">Messages</p>
              <p className="text-sm font-bold text-white">{stats.messages}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">Database Size</p>
              <p className="text-sm font-bold text-white">{(stats.dbSizeBytes / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">Stories</p>
              <p className="text-sm font-bold text-white">{stats.stories}</p>
            </div>
          </div>
          <button
            onClick={handleClearConversations}
            className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-lg transition-all"
          >
            Clear All Conversations
          </button>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const storeSection = useAppStore((s) => s.activeSettingsSection)
  const setStoreSection = useAppStore((s) => s.setActiveSettingsSection)
  const enabledFeatures = useLicenseStore((s) => s.flags.enabledFeatures)

  // Filter nav items based on feature flags
  const navItems = allNavItems.filter((item) =>
    !item.featureFlag || enabledFeatures.includes(item.featureFlag)
  )

  // Map store section to local nav — default to 'account' for sections not in our nav
  const validNavIds = navItems.map((n) => n.id) as string[]
  const initialNav = validNavIds.includes(storeSection) ? (storeSection as SettingsNav) : 'account'
  const [activeNav, setActiveNavLocal] = useState<SettingsNav>(initialNav)

  // Sync when store section changes (e.g. navigated from another page)
  useEffect(() => {
    if (validNavIds.includes(storeSection)) {
      setActiveNavLocal(storeSection as SettingsNav)
    }
  }, [storeSection])

  // Update both local and store state
  const setActiveNav = (nav: SettingsNav) => {
    setActiveNavLocal(nav)
    setStoreSection(nav as any)
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Settings Nav */}
      <div className="w-56 border-r border-pilos-border bg-pilos-bg p-3 flex-shrink-0">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeNav === item.id
                  ? 'bg-pilos-card text-pilos-blue'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Icon icon={item.icon} className={activeNav === item.id ? 'text-pilos-blue' : 'text-zinc-500'} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-pilos-border space-y-0.5">
          <button
            onClick={() => api.dialog.openExternal('https://pilos.net/docs')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
          >
            <Icon icon="lucide:book-open" className="text-zinc-600" />
            Documentation
          </button>
          <button
            onClick={() => api.dialog.openExternal('mailto:support@pilos.net')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
          >
            <Icon icon="lucide:life-buoy" className="text-zinc-600" />
            Support
          </button>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-xl p-8">
          {activeNav === 'account' && <AccountSection />}
          {activeNav === 'general' && <GeneralSection />}
          {activeNav === 'integrations' && <IntegrationsSection />}
          {activeNav === 'devices' && <DevicesSection />}
          {activeNav === 'security' && <SecuritySection />}
          {activeNav === 'advanced' && <AdvancedSection />}
        </div>
      </div>
    </div>
  )
}
