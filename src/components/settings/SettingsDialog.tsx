import { useState, useEffect, type ComponentType } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { SettingsSection } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useLicenseStore } from '../../store/useLicenseStore'
import type { ProjectMode } from '../../types'
import { AgentManager } from '../agents/AgentManager'
import { McpServerManager } from '../mcp/McpServerManager'
import { LicenseSection } from './LicenseSection'
import { ProBadge } from '../common/ProBadge'

// Lazily loaded PM integration card
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

const NAV_ITEMS: { key: SettingsSection; label: string; icon: React.ReactNode; teamOnly?: boolean }[] = [
  {
    key: 'project',
    label: 'Project',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
  },
  {
    key: 'agents',
    label: 'Agents',
    teamOnly: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    key: 'mcp',
    label: 'MCP Servers',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    key: 'integrations',
    label: 'Integrations',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
  },
  {
    key: 'license',
    label: 'License',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    key: 'general',
    label: 'General',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

export function SettingsDialog() {
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const activeSection = useAppStore((s) => s.activeSettingsSection)
  const setActiveSection = useAppStore((s) => s.setActiveSettingsSection)
  const accountEmail = useAppStore((s) => s.accountEmail)
  const accountPlan = useAppStore((s) => s.accountPlan)
  const cliVersion = useAppStore((s) => s.cliVersion)

  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const setProjectModel = useProjectStore((s) => s.setProjectModel)
  const setProjectPermissionMode = useProjectStore((s) => s.setProjectPermissionMode)
  const setProjectMode = useProjectStore((s) => s.setProjectMode)
  const setProjectAgents = useProjectStore((s) => s.setProjectAgents)
  const addProjectAgent = useProjectStore((s) => s.addProjectAgent)
  const removeProjectAgent = useProjectStore((s) => s.removeProjectAgent)
  const updateProjectAgent = useProjectStore((s) => s.updateProjectAgent)
  const addProjectMcpServer = useProjectStore((s) => s.addProjectMcpServer)
  const removeProjectMcpServer = useProjectStore((s) => s.removeProjectMcpServer)
  const updateProjectMcpServer = useProjectStore((s) => s.updateProjectMcpServer)
  const toggleProjectMcpServer = useProjectStore((s) => s.toggleProjectMcpServer)

  const flags = useLicenseStore((s) => s.flags)

  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const isTeamMode = activeTab?.mode === 'team'

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.teamOnly && !isTeamMode) return false
    return true
  })

  return (
    <div className="flex h-full bg-neutral-950">
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 border-r border-neutral-800 flex flex-col">
        {/* Back button */}
        <button
          onClick={() => setSettingsOpen(false)}
          className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to chat
        </button>

        <div className="border-b border-neutral-800" />

        {/* Nav items */}
        <nav className="flex-1 py-2 px-2 space-y-0.5">
          {visibleNav.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === item.key
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl px-8 py-6">
          {activeSection === 'project' && activeTab && <ProjectSection
            activeTab={activeTab}
            flags={flags}
            setProjectModel={setProjectModel}
            setProjectPermissionMode={setProjectPermissionMode}
            setProjectMode={setProjectMode}
          />}

          {activeSection === 'agents' && activeTab && <AgentsSection
            activeTab={activeTab}
            setProjectAgents={setProjectAgents}
            addProjectAgent={addProjectAgent}
            removeProjectAgent={removeProjectAgent}
            updateProjectAgent={updateProjectAgent}
            addProjectMcpServer={addProjectMcpServer}
          />}

          {activeSection === 'mcp' && activeTab && <McpSection
            activeTab={activeTab}
            addProjectMcpServer={addProjectMcpServer}
            removeProjectMcpServer={removeProjectMcpServer}
            updateProjectMcpServer={updateProjectMcpServer}
            toggleProjectMcpServer={toggleProjectMcpServer}
          />}

          {activeSection === 'integrations' && <IntegrationsSection />}

          {activeSection === 'license' && <LicenseSettingsSection />}

          {activeSection === 'general' && <GeneralSection
            accountEmail={accountEmail}
            accountPlan={accountPlan}
            cliVersion={cliVersion}
          />}
        </div>
      </div>
    </div>
  )
}

/* ─── Section Components ─── */

function ProjectSection({ activeTab, flags, setProjectModel, setProjectPermissionMode, setProjectMode }: {
  activeTab: { projectName: string; model: string; permissionMode: string; mode: string }
  flags: { teamMode: boolean }
  setProjectModel: (model: string) => void
  setProjectPermissionMode: (mode: string) => void
  setProjectMode: (mode: ProjectMode) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Project</h2>
        <p className="text-sm text-neutral-400 mt-1">{activeTab.projectName}</p>
      </div>

      {/* Model */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">Model</label>
        <select
          value={activeTab.model}
          onChange={(e) => setProjectModel(e.target.value)}
          className="w-full bg-neutral-800 text-neutral-100 text-sm rounded-lg px-3 py-2.5 outline-none border border-neutral-700 focus:border-blue-500"
        >
          <option value="sonnet">Sonnet</option>
          <option value="opus">Opus</option>
          <option value="haiku">Haiku</option>
        </select>
      </div>

      {/* Permission Mode */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">Permission Mode</label>
        <div className="space-y-2">
          {[
            {
              value: 'bypass',
              label: 'Auto-approve all',
              desc: 'Pilos can do everything without asking',
              color: 'text-green-400',
            },
            {
              value: 'supervised',
              label: 'Ask',
              desc: 'Approve/deny each write or command (like the terminal)',
              color: 'text-yellow-400',
            },
            {
              value: 'plan',
              label: 'Auto-approve reads',
              desc: 'Pilos can only read files — no edits, no commands',
              color: 'text-red-400',
            },
          ].map((mode) => (
            <label
              key={mode.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                activeTab.permissionMode === mode.value
                  ? 'border-blue-500/50 bg-blue-500/10'
                  : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600'
              }`}
            >
              <input
                type="radio"
                name="permissionMode"
                value={mode.value}
                checked={activeTab.permissionMode === mode.value}
                onChange={(e) => setProjectPermissionMode(e.target.value)}
                className="mt-0.5 accent-blue-500"
              />
              <div>
                <span className={`text-sm font-medium ${mode.color}`}>{mode.label}</span>
                <p className="text-xs text-neutral-500 mt-0.5">{mode.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs text-neutral-500 mt-2 italic">
          Changes apply to new sessions. Restart the chat after changing.
        </p>
      </div>

      {/* Mode Toggle */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">Mode</label>
        <div className="flex gap-2">
          {([
            { value: 'solo', label: 'Solo', desc: 'Single AI assistant', requiresPro: false },
            { value: 'team', label: 'Team', desc: 'Multi-agent collaboration', requiresPro: true },
          ] as const).map((m) => {
            const locked = m.requiresPro && !flags.teamMode
            return (
              <button
                key={m.value}
                onClick={() => !locked && setProjectMode(m.value)}
                disabled={locked}
                className={`flex-1 p-3 rounded-lg border text-left transition-colors ${
                  locked
                    ? 'border-neutral-800 bg-neutral-900/50 opacity-60 cursor-not-allowed'
                    : activeTab.mode === m.value
                      ? 'border-blue-500/50 bg-blue-500/10'
                      : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-200">{m.label}</span>
                  {locked && <ProBadge label="Upgrade to Pro to unlock team mode" />}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">{m.desc}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AgentsSection({ activeTab, setProjectAgents, addProjectAgent, removeProjectAgent, updateProjectAgent, addProjectMcpServer }: {
  activeTab: { agents: any[]; mcpServers?: any[] }
  setProjectAgents: (agents: any[]) => void
  addProjectAgent: (agent: any) => void
  removeProjectAgent: (id: string) => void
  updateProjectAgent: (id: string, updates: any) => void
  addProjectMcpServer: (server: any) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Agents</h2>
        <p className="text-sm text-neutral-400 mt-1">Manage your team of AI agents</p>
      </div>

      <AgentManager
        agents={activeTab.agents}
        onSetAgents={setProjectAgents}
        onAddAgent={addProjectAgent}
        onRemoveAgent={removeProjectAgent}
        onUpdateAgent={updateProjectAgent}
        onAddMcpServer={addProjectMcpServer}
        existingMcpServerIds={new Set(activeTab.mcpServers?.map((s) => s.id) || [])}
      />
    </div>
  )
}

function McpSection({ activeTab, addProjectMcpServer, removeProjectMcpServer, updateProjectMcpServer, toggleProjectMcpServer }: {
  activeTab: { mcpServers?: any[] }
  addProjectMcpServer: (server: any) => void
  removeProjectMcpServer: (id: string) => void
  updateProjectMcpServer: (id: string, updates: any) => void
  toggleProjectMcpServer: (id: string) => void
}) {
  const mcpEnabledCount = activeTab.mcpServers?.filter((s) => s.enabled).length || 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">MCP Servers</h2>
        <p className="text-sm text-neutral-400 mt-1">
          Model Context Protocol servers
          {mcpEnabledCount > 0 && (
            <span className="ml-2 text-green-400">{mcpEnabledCount} active</span>
          )}
        </p>
      </div>

      <McpServerManager
        servers={activeTab.mcpServers || []}
        onAdd={addProjectMcpServer}
        onRemove={removeProjectMcpServer}
        onUpdate={(id, updates) => updateProjectMcpServer(id, updates)}
        onToggle={toggleProjectMcpServer}
      />
    </div>
  )
}

function LicenseSettingsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">License</h2>
        <p className="text-sm text-neutral-400 mt-1">Manage your Pilos license and subscription</p>
      </div>

      <LicenseSection />
    </div>
  )
}

function IntegrationsSection() {
  const [, forceUpdate] = useState(0)
  const { flags } = useLicenseStore()
  const isPro = flags.tier === 'pro' || flags.tier === 'teams'

  useEffect(() => {
    if (isPro) {
      loadPmIntegration().then(() => forceUpdate((n) => n + 1))
    }
  }, [isPro])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Integrations</h2>
        <p className="text-sm text-neutral-400 mt-1">Connect project management and collaboration tools</p>
      </div>

      {isPro && PmJiraIntegrationCard && <PmJiraIntegrationCard />}

      {!isPro && (
        <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/50 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded bg-[#1868DB]/20 flex items-center justify-center">
              <svg className="w-[18px] h-[18px]" viewBox="0 0 256 256" fill="none">
                <defs>
                  <linearGradient id="jira-lock-grad-1" x1="98.03%" y1="0.16%" x2="58.89%" y2="40.77%">
                    <stop stopColor="#0052CC" offset="18%" />
                    <stop stopColor="#2684FF" offset="100%" />
                  </linearGradient>
                  <linearGradient id="jira-lock-grad-2" x1="100.67%" y1="0.46%" x2="55.40%" y2="44.73%">
                    <stop stopColor="#0052CC" offset="18%" />
                    <stop stopColor="#2684FF" offset="100%" />
                  </linearGradient>
                </defs>
                <path d="M244.658 0H121.707c0 14.72 5.847 28.837 16.256 39.246 10.409 10.409 24.526 16.256 39.246 16.256h22.649v21.867c.02 30.625 24.841 55.447 55.467 55.467V10.667C255.324 4.776 250.549 0 244.658 0z" fill="#2684FF" />
                <path d="M183.822 61.262H60.871c.02 30.625 24.841 55.447 55.467 55.467h22.649v21.938c.039 30.625 24.877 55.431 55.502 55.431V71.929c0-5.891-4.776-10.667-10.667-10.667z" fill="url(#jira-lock-grad-1)" />
                <path d="M122.951 122.489H0c0 30.653 24.849 55.502 55.502 55.502h22.72v21.867c.02 30.596 24.798 55.406 55.396 55.467V133.156c0-5.892-4.776-10.667-10.667-10.667z" fill="url(#jira-lock-grad-2)" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">Jira</span>
                <ProBadge />
              </div>
              <p className="text-xs text-neutral-400">Atlassian issue tracking</p>
            </div>
          </div>
          <p className="text-xs text-neutral-500 mb-3">Push stories as epics, view boards, and track progress.</p>
          <span className="text-xs text-neutral-500 italic">Upgrade to Pro to connect Jira</span>
        </div>
      )}

      {/* Future integrations */}
      {[
        {
          name: 'Linear',
          desc: 'Issue tracking for modern teams',
          logo: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.03509 12.9431C3.24245 14.9227 4.10472 16.8468 5.62188 18.364C7.13904 19.8811 9.0631 20.7434 11.0428 20.9508L3.03509 12.9431Z" />
              <path d="M3 11.4938L12.4921 20.9858C13.2976 20.9407 14.0981 20.7879 14.8704 20.5273L3.4585 9.11548C3.19793 9.88771 3.0451 10.6883 3 11.4938Z" />
              <path d="M3.86722 8.10999L15.8758 20.1186C16.4988 19.8201 17.0946 19.4458 17.6493 18.9956L4.99021 6.33659C4.54006 6.89125 4.16573 7.487 3.86722 8.10999Z" />
              <path d="M5.66301 5.59517C9.18091 2.12137 14.8488 2.135 18.3498 5.63604C21.8508 9.13708 21.8645 14.8049 18.3907 18.3228L5.66301 5.59517Z" />
            </svg>
          ),
        },
        {
          name: 'GitHub Issues',
          desc: 'Track issues alongside your code',
          logo: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
            </svg>
          ),
        },
        {
          name: 'Notion',
          desc: 'Docs, wikis, and project management',
          logo: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.56 2.47c-.42-.326-.98-.7-2.055-.607L3.62 2.931c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.886c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.747 0-.933-.234-1.494-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.513.28-.886.747-.933zM2.332 1.166l13.542-1c1.634-.14 2.054-.046 3.08.7l4.25 2.986c.7.513.933.653.933 1.213v16.378c0 1.026-.373 1.632-1.68 1.726l-15.458.933c-.98.047-1.448-.093-1.961-.747l-3.127-4.066c-.56-.747-.793-1.306-.793-1.96V2.913c0-.82.373-1.586 1.214-1.746z" />
            </svg>
          ),
        },
      ].map((tool) => (
        <div key={tool.name} className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 opacity-40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center text-neutral-500">
              {tool.logo}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-400">{tool.name}</p>
              <p className="text-xs text-neutral-600">{tool.desc}</p>
            </div>
            <span className="text-[10px] text-neutral-600 border border-neutral-800 rounded px-1.5 py-0.5">Coming soon</span>
          </div>
        </div>
      ))}
    </div>
  )
}

declare const __APP_VERSION__: string

function GeneralSection({ accountEmail, accountPlan, cliVersion }: {
  accountEmail?: string
  accountPlan?: string
  cliVersion?: string
}) {
  const planLabel = accountPlan
    ? accountPlan.charAt(0).toUpperCase() + accountPlan.slice(1)
    : 'Unknown'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">General</h2>
        <p className="text-sm text-neutral-400 mt-1">Account and application info</p>
      </div>

      {/* Claude Account */}
      <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/50 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-semibold text-sm">
            {accountEmail ? accountEmail.charAt(0).toUpperCase() : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{accountEmail || 'Not signed in'}</p>
            <p className="text-xs text-neutral-400">Claude account</p>
          </div>
        </div>

        {/* Plan */}
        <div className="flex items-center justify-between py-3 border-t border-neutral-700/50">
          <div>
            <p className="text-sm text-neutral-300">Plan</p>
            <p className="text-xs text-neutral-500 mt-0.5">Current Claude subscription</p>
          </div>
          <span className="text-sm font-medium text-white bg-neutral-700/50 px-3 py-1 rounded-full">
            {planLabel}
          </span>
        </div>

        {/* Usage link */}
        <div className="flex items-center justify-between py-3 border-t border-neutral-700/50">
          <div>
            <p className="text-sm text-neutral-300">Usage</p>
            <p className="text-xs text-neutral-500 mt-0.5">View plan limits and usage details</p>
          </div>
          <button
            onClick={() => window.api?.dialog?.openExternal('https://claude.ai/settings/billing')}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            View on claude.ai
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </button>
        </div>
      </div>

      {/* App Version */}
      <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/50 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-300">Pilos Agents</p>
            <p className="text-xs text-neutral-500 mt-0.5">Application version</p>
          </div>
          <span className="text-sm text-neutral-400 font-mono">v{__APP_VERSION__}</span>
        </div>

        {cliVersion && (
          <div className="flex items-center justify-between pt-3 border-t border-neutral-700/50">
            <div>
              <p className="text-sm text-neutral-300">Claude CLI</p>
              <p className="text-xs text-neutral-500 mt-0.5">Installed CLI version</p>
            </div>
            <span className="text-sm text-neutral-400 font-mono">{cliVersion}</span>
          </div>
        )}
      </div>
    </div>
  )
}
