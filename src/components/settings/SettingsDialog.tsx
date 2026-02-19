import { useAppStore } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { AgentManager } from '../agents/AgentManager'
import { McpServerManager } from '../mcp/McpServerManager'

export function SettingsDialog() {
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
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

  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const mcpEnabledCount = activeTab?.mcpServers?.filter((s) => s.enabled).length || 0

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5">
          {/* ── Project Settings ── */}
          {activeTab && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Project: {activeTab.projectName}</h3>
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Model</label>
                <select
                  value={activeTab.model}
                  onChange={(e) => setProjectModel(e.target.value)}
                  className="w-full bg-neutral-800 text-neutral-100 text-sm rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500"
                >
                  <option value="sonnet">Sonnet</option>
                  <option value="opus">Opus</option>
                  <option value="haiku">Haiku</option>
                </select>
              </div>

              {/* Permission Mode */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Permission Mode</label>
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
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Mode</label>
                <div className="flex gap-2">
                  {([
                    { value: 'solo', label: 'Solo', desc: 'Single AI assistant' },
                    { value: 'team', label: 'Team', desc: 'Multi-agent collaboration' },
                  ] as const).map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setProjectMode(m.value)}
                      className={`flex-1 p-3 rounded-lg border text-left transition-colors ${
                        activeTab.mode === m.value
                          ? 'border-blue-500/50 bg-blue-500/10'
                          : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600'
                      }`}
                    >
                      <div className="text-sm font-medium text-neutral-200">{m.label}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Agent Manager (team mode only) */}
              {activeTab.mode === 'team' && (
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5">Team Agents</label>
                  <AgentManager
                    agents={activeTab.agents}
                    onSetAgents={setProjectAgents}
                    onAddAgent={addProjectAgent}
                    onRemoveAgent={removeProjectAgent}
                    onUpdateAgent={updateProjectAgent}
                  />
                </div>
              )}

              {/* MCP Servers */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                  MCP Servers
                  {mcpEnabledCount > 0 && (
                    <span className="ml-2 text-green-400">{mcpEnabledCount} active</span>
                  )}
                </label>
                <McpServerManager
                  servers={activeTab.mcpServers || []}
                  onAdd={addProjectMcpServer}
                  onRemove={removeProjectMcpServer}
                  onUpdate={(id, updates) => updateProjectMcpServer(id, updates)}
                  onToggle={toggleProjectMcpServer}
                />
              </div>

              <p className="text-xs text-neutral-500 italic">
                Changes apply to new sessions. Restart the chat after changing.
              </p>

              <div className="border-t border-neutral-800 pt-4" />
            </>
          )}

          {/* ── Global Settings ── */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Global</h3>
          </div>

          {/* Terminal Font Size */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">
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

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-800 flex justify-end">
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
