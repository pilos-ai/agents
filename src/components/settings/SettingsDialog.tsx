import { useAppStore } from '../../store/useAppStore'
import type { SettingsSection } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useLicenseStore } from '../../store/useLicenseStore'
import type { ProjectMode } from '../../types'
import { AgentManager } from '../agents/AgentManager'
import { McpServerManager } from '../mcp/McpServerManager'
import { LicenseSection } from './LicenseSection'
import { ProBadge } from '../common/ProBadge'

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
  const terminalFontSize = useAppStore((s) => s.terminalFontSize)
  const setTerminalFontSize = useAppStore((s) => s.setTerminalFontSize)

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

          {activeSection === 'license' && <LicenseSettingsSection />}

          {activeSection === 'general' && <GeneralSection
            terminalFontSize={terminalFontSize}
            setTerminalFontSize={setTerminalFontSize}
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
              label: 'Full access',
              desc: 'Pilos can do everything without asking',
              color: 'text-green-400',
            },
            {
              value: 'supervised',
              label: 'Ask before changes',
              desc: 'Approve/deny each write or command (like the terminal)',
              color: 'text-yellow-400',
            },
            {
              value: 'plan',
              label: 'Read only',
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

function GeneralSection({ terminalFontSize, setTerminalFontSize }: {
  terminalFontSize: number
  setTerminalFontSize: (size: number) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">General</h2>
        <p className="text-sm text-neutral-400 mt-1">Global application settings</p>
      </div>

      {/* Terminal Font Size */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Terminal Font Size: {terminalFontSize}px
        </label>
        <input
          type="range"
          min={10}
          max={20}
          value={terminalFontSize}
          onChange={(e) => setTerminalFontSize(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>
    </div>
  )
}
