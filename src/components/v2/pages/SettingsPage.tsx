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
import { PluginsSection } from '../../settings/PluginsSection'
import type { StorageStats } from '../../../types'

function UpgradeModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="tile"
        style={{ width: '100%', maxWidth: 380, margin: 16, display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Upgrade to Pro</h3>
            <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 0' }}>Unlimited agents, MCP integrations &amp; more</p>
          </div>
          <button type="button" onClick={onClose} className="mini-ico">
            <Icon icon="lucide:x" style={{ fontSize: 16 }} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: 'var(--ink-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-2)' }}>
            <span>Pro · Monthly</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>$12/mo</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-2)' }}>
            <span>Pro · Annual</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>$96/yr <span style={{ color: 'var(--ok)', fontSize: 10 }}>Save 33%</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span>Teams · Monthly</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>$19/seat</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { api.dialog.openExternal('https://pilos.net/pricing'); onClose() }}
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          <Icon icon="lucide:credit-card" style={{ fontSize: 14 }} />
          Pay with Card — pilos.net/pricing
        </button>

        <p className="muted" style={{ fontSize: 10.5, textAlign: 'center', margin: 0 }}>
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

type SettingsNav = 'account' | 'general' | 'project' | 'integrations' | 'plugins' | 'devices' | 'security' | 'advanced'

const allNavItems: { id: SettingsNav; label: string; icon: string; featureFlag?: string }[] = [
  { id: 'account', label: 'Account', icon: 'lucide:user' },
  { id: 'general', label: 'General', icon: 'lucide:settings' },
  { id: 'project', label: 'Project', icon: 'lucide:folder' },
  { id: 'integrations', label: 'Integrations', icon: 'lucide:plug-zap' },
  { id: 'plugins', label: 'Plugins', icon: 'lucide:puzzle' },
  { id: 'devices', label: 'Devices', icon: 'lucide:smartphone', featureFlag: 'devices' },
  { id: 'security', label: 'Security', icon: 'lucide:shield-check' },
  { id: 'advanced', label: 'Advanced', icon: 'lucide:code' },
]

// ── Project section — formerly the Project settings inside ConfigPage ──
function ProjectSection() {
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const activeProject = useProjectStore((s) => {
    const path = s.activeProjectPath
    return s.openProjects.find((p) => p.projectPath === path)
  })
  const setProjectModel = useProjectStore((s) => s.setProjectModel)
  const setProjectPermissionMode = useProjectStore((s) => s.setProjectPermissionMode)

  if (!activeProjectPath || !activeProject) {
    return (
      <div className="set-sec">
        <h2 className="h2">Project</h2>
        <p className="muted" style={{ fontSize: 12.5 }}>Open a project to configure project-level settings.</p>
      </div>
    )
  }

  return (
    <div className="set-sec">
      <h2 className="h2">Project</h2>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 12 }}>
        Settings for <span style={{ color: 'var(--ink)' }}>{activeProject.projectName}</span>
      </p>

      <div className="set-row">
        <div className="info">
          <div className="t">Path</div>
          <div className="d" style={{ fontFamily: 'var(--mono)' }}>{activeProject.projectPath}</div>
        </div>
      </div>

      <div className="set-row">
        <div className="info">
          <div className="t">Default model</div>
          <div className="d">Model used for new conversations in this project</div>
        </div>
        <div style={{ width: 200 }}>
          <FormSelect
            value={activeProject.model || 'sonnet'}
            onChange={(e) => setProjectModel(e.target.value)}
            options={[
              { value: 'sonnet', label: 'Claude Sonnet' },
              { value: 'opus', label: 'Claude Opus' },
              { value: 'haiku', label: 'Claude Haiku' },
            ]}
          />
        </div>
      </div>

      <div className="set-row">
        <div className="info">
          <div className="t">Permission mode</div>
          <div className="d">How agents handle tool approvals in this project</div>
        </div>
        <div style={{ width: 200 }}>
          <FormSelect
            value={activeProject.permissionMode || 'default'}
            onChange={(e) => setProjectPermissionMode(e.target.value)}
            options={[
              { value: 'default', label: 'Default (Ask)' },
              { value: 'bypass', label: 'Auto-approve' },
              { value: 'plan', label: 'Plan Mode' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}

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
  const recoverLicense = useLicenseStore((s) => s.recoverLicense)
  const pendingActivation = useLicenseStore((s) => s.pendingActivation)
  const setPendingActivation = useLicenseStore((s) => s.setPendingActivation)

  const [keyInput, setKeyInput] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [showRecover, setShowRecover] = useState(false)
  const [recoverEmail, setRecoverEmail] = useState('')
  const [recoverMsg, setRecoverMsg] = useState<string | null>(null)

  const tierTagClass: Record<string, string> = {
    free: 'tag',
    pro: 'tag warn',
    teams: 'tag pro',
  }

  // Deep link pre-fill — user opened the app via pilos://activate?key=X while
  // already signed in. App.tsx stores the key in pendingActivation and routes
  // to Settings; here we reveal the key input, pre-fill it, then clear pending.
  useEffect(() => {
    if (pendingActivation?.key) {
      setKeyInput(pendingActivation.key)
      setShowKeyInput(true)
      setPendingActivation(null)
    }
  }, [pendingActivation, setPendingActivation])

  const handleActivate = async () => {
    if (!keyInput.trim()) return
    const result = await activateLicense(keyInput.trim())
    if (result.valid) {
      setKeyInput('')
      setShowKeyInput(false)
    }
  }

  const handleRecover = async () => {
    const target = (recoverEmail.trim() || email || '').trim()
    if (!target) return
    setRecoverMsg(null)
    const result = await recoverLicense(target)
    if (result.found && result.key) {
      setKeyInput(result.key)
      setShowKeyInput(true)
      setShowRecover(false)
      setRecoverEmail('')
      setRecoverMsg(null)
    } else {
      setRecoverMsg(result.error || 'No license found for that email.')
    }
  }

  const handleManageSubscription = async () => {
    if (!licenseKey) return
    setPortalLoading(true)
    try {
      const res = await fetch('https://license.pilos.net/v1/licenses/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey }),
      })
      const data = await res.json()
      if (data.url) api.dialog.openExternal(data.url)
    } catch {
      // silently fail
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <div className="set-sec">
      <h2 className="h2">Account</h2>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 18 }}>
        Your account information and subscription
      </p>

      {/* User Profile */}
      <div className="tile" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="cav cav-grad-claude" style={{ width: 44, height: 44, borderRadius: 12, fontSize: 16 }}>
            {email ? email[0].toUpperCase() : 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email || 'Unknown'}</div>
            <div style={{ marginTop: 4 }}>
              <span className={tierTagClass[tier] || tierTagClass.free}>{tier}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="btn sm"
            style={{ color: 'var(--err)' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Workspace Setup */}
      <div className="tile" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 className="section-label" style={{ margin: 0 }}>Workspace Setup</h3>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Re-run the onboarding wizard to generate new role-based tasks and workflows</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await useAppStore.getState().resetWorkspaceSetup()
            }}
            className="btn sm"
          >
            <Icon icon="lucide:refresh-cw" style={{ fontSize: 11 }} />
            Re-run Setup
          </button>
        </div>
      </div>

      {/* License Management */}
      <div className="tile" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className="section-label" style={{ margin: 0 }}>License</h3>
          {licenseKey && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {tier !== 'free' && (
                <button
                  type="button"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="btn sm ghost"
                  style={{ height: 22, padding: '0 8px', fontSize: 11 }}
                >
                  {portalLoading ? 'Loading...' : 'Manage subscription'}
                </button>
              )}
              <button
                type="button"
                onClick={deactivateLicense}
                disabled={isValidating}
                className="btn sm ghost"
                style={{ height: 22, padding: '0 8px', fontSize: 11, color: 'var(--err)' }}
              >
                Deactivate
              </button>
            </div>
          )}
        </div>

        {machineMismatch && licenseKey && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <Icon icon="lucide:alert-triangle" style={{ fontSize: 14, color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12, color: 'var(--warn)' }}>
              License is active on another machine.
              <button
                type="button"
                onClick={() => activateLicense(licenseKey)}
                disabled={isValidating}
                className="btn sm ghost"
                style={{ height: 20, padding: '0 6px', fontSize: 11, marginLeft: 6 }}
              >
                Re-activate here
              </button>
            </div>
          </div>
        )}

        {licenseKey ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>License Key</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>
                {licenseKey.slice(0, 10)}...{licenseKey.slice(-4)}
              </span>
            </div>
            {!showKeyInput ? (
              <button
                type="button"
                onClick={() => setShowKeyInput(true)}
                className="btn sm ghost"
                style={{ alignSelf: 'flex-start' }}
              >
                Change license key
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="PILOS-XXXX-XXXX-XXXX"
                  className="control"
                  style={{ flex: 1, fontFamily: 'var(--mono)' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
                />
                <button
                  type="button"
                  onClick={handleActivate}
                  disabled={isValidating || !keyInput.trim()}
                  className="btn sm primary"
                >
                  {isValidating ? '...' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowKeyInput(false); setKeyInput('') }}
                  className="btn sm ghost icon"
                >
                  <Icon icon="lucide:x" style={{ fontSize: 12 }} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>No license key activated. You're on the free plan.</p>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="btn primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Icon icon="lucide:zap" style={{ fontSize: 14 }} />
              Upgrade to Pro — from $12/mo
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="PILOS-XXXX-XXXX-XXXX"
                className="control"
                style={{ flex: 1, fontFamily: 'var(--mono)' }}
                onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              />
              <button
                type="button"
                onClick={handleActivate}
                disabled={isValidating || !keyInput.trim()}
                className="btn sm primary"
              >
                {isValidating ? 'Validating...' : 'Activate Pro'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: 'var(--err)', margin: 0 }}>{error}</p>
        )}

        {/* Recover license — for users who lost their key. The license-server
            emails point here ("Settings > Account > Recover License"). */}
        {!licenseKey && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!showRecover ? (
              <button
                type="button"
                onClick={() => { setShowRecover(true); setRecoverMsg(null) }}
                className="btn sm ghost"
                style={{ alignSelf: 'flex-start', height: 22, padding: '0 8px', fontSize: 11 }}
              >
                Recover license
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="muted" style={{ fontSize: 11, margin: 0 }}>
                  Enter the email associated with your license. If a valid license is found, your key will be recovered.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="email"
                    value={recoverEmail || email || ''}
                    onChange={(e) => setRecoverEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="control"
                    style={{ flex: 1 }}
                    onKeyDown={(e) => e.key === 'Enter' && handleRecover()}
                  />
                  <button
                    type="button"
                    onClick={handleRecover}
                    disabled={isValidating || !(recoverEmail.trim() || email)}
                    className="btn sm primary"
                  >
                    {isValidating ? '...' : 'Recover'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowRecover(false); setRecoverEmail(''); setRecoverMsg(null) }}
                    className="btn sm ghost icon"
                  >
                    <Icon icon="lucide:x" style={{ fontSize: 12 }} />
                  </button>
                </div>
                {recoverMsg && (
                  <p style={{ fontSize: 12, color: 'var(--err)', margin: 0 }}>{recoverMsg}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Version Info */}
      <div className="tile">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <p className="muted" style={{ fontSize: 11.5, margin: 0, fontWeight: 500 }}>Claude CLI Version</p>
            <p style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)', marginTop: 4, marginBottom: 0 }}>{cliVersion || 'Unknown'}</p>
          </div>
          <div>
            <p className="muted" style={{ fontSize: 11.5, margin: 0, fontWeight: 500 }}>App Version</p>
            <p style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)', marginTop: 4, marginBottom: 0 }}>v{__APP_VERSION__}</p>
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

  return (
    <div className="set-sec">
      <h2 className="h2">General</h2>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 18 }}>
        Application and project settings
      </p>

      {activeTab && (
        <>
          <h3 className="section-label" style={{ marginTop: 18, marginBottom: 12 }}>Project Settings</h3>
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
        </>
      )}

      <h3 className="section-label" style={{ marginTop: 22, marginBottom: 12 }}>Appearance</h3>
      <div className="set-row">
        <div className="info">
          <div className="t">Terminal Font Size</div>
          <div className="d">{terminalFontSize}px</div>
        </div>
        <input
          type="range"
          min="10"
          max="20"
          value={terminalFontSize}
          onChange={(e) => setTerminalFontSize(Number(e.target.value))}
          style={{ width: 140, accentColor: 'var(--accent)' }}
        />
      </div>

      <h3 className="section-label" style={{ marginTop: 22, marginBottom: 12 }}>Background</h3>
      <div className="set-row">
        <div className="info">
          <div className="t">Run in background</div>
          <div className="d">Keep running in the menu bar when the window is closed. Scheduled tasks continue automatically.</div>
        </div>
        <FormToggle
          checked={backgroundMode}
          onChange={(checked) => {
            setBackgroundMode(checked)
            api.settings.set('backgroundMode', checked)
          }}
        />
      </div>
      <div className="set-row">
        <div className="info">
          <div className="t">Desktop notifications</div>
          <div className="d">Show notifications when scheduled tasks complete or fail</div>
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
    <div className="set-sec">
      <h2 className="h2">Integrations</h2>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 18 }}>
        Connect external services and MCP servers
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Jira */}
        <div className="tile" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
            <div className="tile-logo" style={{ width: 36, height: 36 }}>
              <Icon icon="logos:jira" style={{ fontSize: 18 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Jira</span>
                <span className="tag pro">Pro</span>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>Atlassian issue tracking</div>
            </div>
            {jiraConnected ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--ok)' }}>
                <Icon icon="lucide:check-circle-2" style={{ fontSize: 12 }} />
                Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={isPro ? handleJiraConnect : undefined}
                disabled={!isPro || jiraConnecting}
                className="btn sm"
              >
                {jiraConnecting ? (
                  <>
                    <Icon icon="lucide:loader-2" style={{ fontSize: 12, animation: 'spin 1s linear infinite' }} />
                    Connecting...
                  </>
                ) : isPro ? 'Connect' : 'Upgrade'}
              </button>
            )}
          </div>
          {isPro && jiraConnected && jiraLoaded && PmJiraIntegrationCard && (
            <div style={{ borderTop: '1px solid var(--line-2)', padding: 14 }}>
              <PmJiraIntegrationCard />
            </div>
          )}
        </div>

        {/* GitHub */}
        <div className="tile" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
            <div className="tile-logo" style={{ width: 36, height: 36 }}>
              <Icon icon="logos:github-icon" style={{ fontSize: 18 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>GitHub</div>
              <div className="muted" style={{ fontSize: 11 }}>Issues, PRs, code search</div>
            </div>
            {githubConnected ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--ok)' }}>
                <Icon icon="lucide:check-circle-2" style={{ fontSize: 12 }} />
                Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowGithubSetup(!showGithubSetup)}
                className="btn sm"
              >
                Connect
              </button>
            )}
          </div>
          {showGithubSetup && !githubConnected && (
            <div style={{ borderTop: '1px solid var(--line-2)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="muted" style={{ fontSize: 11, margin: 0 }}>
                Create a <span style={{ color: 'var(--ink-2)' }}>Personal Access Token</span> at GitHub &gt; Settings &gt; Developer settings &gt; Tokens (classic) with <span style={{ color: 'var(--ink-2)' }}>repo</span> scope.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="control"
                  style={{ flex: 1, fontFamily: 'var(--mono)' }}
                />
                <button
                  type="button"
                  onClick={handleGithubConnect}
                  disabled={!githubToken.trim() || githubConnecting}
                  className="btn sm primary"
                >
                  {githubConnecting ? (
                    <Icon icon="lucide:loader-2" style={{ fontSize: 12, animation: 'spin 1s linear infinite' }} />
                  ) : 'Connect'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Slack */}
        <div className="tile" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="tile-logo" style={{ width: 36, height: 36 }}>
            <Icon icon="logos:slack-icon" style={{ fontSize: 18 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Slack</div>
            <div className="muted" style={{ fontSize: 11 }}>Team notifications</div>
          </div>
          <button type="button" className="btn sm">Connect</button>
        </div>

        {/* Linear */}
        <div className="tile" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="tile-logo" style={{ width: 36, height: 36 }}>
            <Icon icon="logos:linear-icon" style={{ fontSize: 18 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Linear</div>
            <div className="muted" style={{ fontSize: 11 }}>Issue tracking</div>
          </div>
          <button type="button" className="btn sm">Connect</button>
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
    <div className="set-sec">
      <h2 className="h2">Devices</h2>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 18 }}>
        Pair and manage mobile devices
      </p>

      {/* Connection status */}
      <div className="tile" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={'li-dot ' + (relayStatus.connected ? 'dot-ok' : 'dot-idle')} style={{ width: 10, height: 10 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--ink)' }}>{relayStatus.connected ? 'Relay Connected' : 'Relay Disconnected'}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              {relayStatus.mobileCount > 0
                ? `${relayStatus.mobileCount} mobile device${relayStatus.mobileCount > 1 ? 's' : ''} online`
                : 'No mobile devices connected'}
            </div>
          </div>
        </div>
      </div>

      {/* Pairing Approval Dialog */}
      {pendingRequest && (
        <div className="msg-tile accent" style={{ marginBottom: 14 }}>
          <div className="msg-tile-head">
            <Icon icon="lucide:smartphone" style={{ fontSize: 16, color: 'var(--accent-2)' }} />
            Pairing Request
          </div>
          <div className="msg-tile-body">
            <span className="muted" style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--accent-2)', fontWeight: 600 }}>{pendingRequest.deviceName}</span> wants to connect
            </span>
          </div>
          <div className="msg-tile-foot">
            <button type="button" onClick={handleApprove} className="btn sm primary" style={{ flex: 1, justifyContent: 'center' }}>
              Approve
            </button>
            <button type="button" onClick={handleDeny} className="btn sm" style={{ flex: 1, justifyContent: 'center' }}>
              Deny
            </button>
          </div>
        </div>
      )}

      {/* QR Code Pairing */}
      <div className="tile" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 className="section-label" style={{ margin: 0 }}>Pair New Device</h3>
        <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
          Open the Pilos Agents mobile app and scan this QR code to pair your device.
        </p>

        {qrDataUrl ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 16, background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)' }}>
              <img src={qrDataUrl} alt="Pairing QR Code" width={200} height={200} />
            </div>
            <div className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon icon="lucide:clock" style={{ fontSize: 11 }} />
              Expires in {countdown}
            </div>
            <button type="button" onClick={generateQR} className="btn sm ghost">Regenerate</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={generateQR}
            disabled={qrLoading || !relayStatus.connected}
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {qrLoading ? (
              <>
                <Icon icon="lucide:loader-2" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }} />
                Generating...
              </>
            ) : (
              <>
                <Icon icon="lucide:qr-code" style={{ fontSize: 14 }} />
                Generate QR Code
              </>
            )}
          </button>
        )}
        {!relayStatus.connected && (
          <p style={{ fontSize: 10.5, color: 'var(--warn)', margin: 0 }}>Relay server must be connected to generate pairing codes.</p>
        )}
      </div>

      {/* Paired Devices List */}
      <div className="tile" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className="section-label" style={{ margin: 0 }}>Paired Devices</h3>
          <button
            type="button"
            onClick={() => api.mobile.listPairedDevices().then(setDevices).catch(() => {})}
            className="btn sm ghost"
            style={{ height: 22, padding: '0 8px', fontSize: 11 }}
          >
            Refresh
          </button>
        </div>

        {devices.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, padding: '6px 0' }}>No devices paired yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {devices.map((device) => (
              <div
                key={device.device_id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--line)' }}
              >
                <Icon icon="lucide:smartphone" style={{ fontSize: 16, color: 'var(--ink-3)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.device_name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    Paired {new Date(device.created_at).toLocaleDateString()}
                    {device.last_seen_at && ` \u00b7 Last seen ${new Date(device.last_seen_at).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(device.device_id)}
                  disabled={revoking === device.device_id}
                  className="btn sm"
                  style={{ color: 'var(--err)', borderColor: 'rgba(251,111,111,0.3)' }}
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
    <div className="set-sec">
      <h2 className="h2">Security</h2>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 18 }}>
        Permissions, access control, and privacy
      </p>

      <h3 className="section-label" style={{ marginTop: 18 }}>Permissions</h3>
      <div className="set-row">
        <div className="info">
          <div className="t">Auto-approve read-only operations</div>
          <div className="d">File reads, searches, and git status run without confirmation</div>
        </div>
        <FormToggle
          checked={autoApproveReads}
          onChange={(v) => toggle('autoApproveReads', v, setAutoApproveReads)}
        />
      </div>
      <div className="set-row">
        <div className="info">
          <div className="t">Confirm destructive actions</div>
          <div className="d">Require confirmation for file deletes, git push, and resets</div>
        </div>
        <FormToggle
          checked={requireConfirmDestructive}
          onChange={(v) => toggle('requireConfirmDestructive', v, setRequireConfirmDestructive)}
        />
      </div>
      <div className="set-row">
        <div className="info">
          <div className="t">Sandbox mode</div>
          <div className="d">Restrict shell commands to project directory only</div>
        </div>
        <FormToggle
          checked={sandboxMode}
          onChange={(v) => toggle('sandboxMode', v, setSandboxMode)}
        />
      </div>

      <h3 className="section-label" style={{ marginTop: 22 }}>Session</h3>
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
      <p className="muted" style={{ fontSize: 11, marginTop: -8 }}>Auto-lock agent sessions after inactivity</p>

      <h3 className="section-label" style={{ marginTop: 22 }}>Privacy</h3>
      <div className="set-row">
        <div className="info">
          <div className="t">Usage telemetry</div>
          <div className="d">Send anonymous usage data to help improve the product</div>
        </div>
        <FormToggle
          checked={telemetry}
          onChange={(v) => toggle('telemetry', v, setTelemetry)}
        />
      </div>

      <h3 className="section-label" style={{ marginTop: 22 }}>Access Control</h3>
      <div className="tile" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Icon icon="lucide:shield-check" style={{ fontSize: 18, color: 'var(--ok)', marginTop: 2, flexShrink: 0 }} />
          <div>
            <div className="t" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Path-based access</div>
            <div className="muted" style={{ fontSize: 11, lineHeight: 1.55 }}>
              Agents can only access files within their configured allowed paths. Configure per-agent
              file access in the agent settings under Capabilities &gt; Allowed Paths.
            </div>
          </div>
        </div>
      </div>
      <div className="tile">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Icon icon="lucide:key-round" style={{ fontSize: 18, color: 'var(--info)', marginTop: 2, flexShrink: 0 }} />
          <div>
            <div className="t" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>MCP server permissions</div>
            <div className="muted" style={{ fontSize: 11, lineHeight: 1.55 }}>
              Each MCP server runs in its own process with scoped access. Manage connected servers
              in Settings &gt; Integrations.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PluginsSectionWrapper() {
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  if (!activeProjectPath) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>Open a project to manage plugins.</div>
    )
  }
  return <PluginsSection projectPath={activeProjectPath} />
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
    <div className="set-sec">
      <h2 className="h2">Advanced</h2>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 18 }}>
        Storage management and debug options
      </p>

      {stats && (
        <div className="tile" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 className="section-label" style={{ margin: 0 }}>Storage</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div>
              <p className="muted" style={{ fontSize: 11, margin: 0 }}>Conversations</p>
              <p style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)', marginTop: 4, marginBottom: 0 }}>{stats.conversations}</p>
            </div>
            <div>
              <p className="muted" style={{ fontSize: 11, margin: 0 }}>Messages</p>
              <p style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)', marginTop: 4, marginBottom: 0 }}>{stats.messages}</p>
            </div>
            <div>
              <p className="muted" style={{ fontSize: 11, margin: 0 }}>Database Size</p>
              <p style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)', marginTop: 4, marginBottom: 0 }}>{(stats.dbSizeBytes / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <div>
              <p className="muted" style={{ fontSize: 11, margin: 0 }}>Stories</p>
              <p style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)', marginTop: 4, marginBottom: 0 }}>{stats.stories}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearConversations}
            className="btn sm"
            style={{ width: '100%', justifyContent: 'center', color: 'var(--err)', borderColor: 'rgba(251,111,111,0.3)' }}
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
    <div className="set-wrap">
      {/* Settings Nav — matches prototype .set-nav */}
      <div className="set-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id)}
            className={'set-nav-item' + (activeNav === item.id ? ' on' : '')}
          >
            <Icon icon={item.icon} />
            {item.label}
          </button>
        ))}

        <div className="divider" style={{ margin: '16px 4px' }} />

        <button
          className="set-nav-item"
          onClick={() => api.dialog.openExternal('https://pilos.net/docs')}
        >
          <Icon icon="lucide:book-open" />
          Documentation
        </button>
        <button
          className="set-nav-item"
          onClick={() => api.dialog.openExternal('mailto:support@pilos.net')}
        >
          <Icon icon="lucide:life-buoy" />
          Support
        </button>
      </div>

      {/* Settings Content */}
      <div className="set-body">
        {activeNav === 'account' && <AccountSection />}
        {activeNav === 'general' && <GeneralSection />}
        {activeNav === 'project' && <ProjectSection />}
        {activeNav === 'integrations' && <IntegrationsSection />}
        {activeNav === 'plugins' && <PluginsSectionWrapper />}
        {activeNav === 'devices' && <DevicesSection />}
        {activeNav === 'security' && <SecuritySection />}
        {activeNav === 'advanced' && <AdvancedSection />}
      </div>
    </div>
  )
}
