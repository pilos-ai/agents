import { Icon } from '../../common/Icon'
import { McpServerManager } from '../../mcp/McpServerManager'
import { useProjectStore } from '../../../store/useProjectStore'
import type { McpServer } from '../../../types'

export default function McpPage() {
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const addProjectMcpServer = useProjectStore((s) => s.addProjectMcpServer)
  const removeProjectMcpServer = useProjectStore((s) => s.removeProjectMcpServer)
  const updateProjectMcpServer = useProjectStore((s) => s.updateProjectMcpServer)
  const toggleProjectMcpServer = useProjectStore((s) => s.toggleProjectMcpServer)

  const activeProject = openProjects.find((p) => p.projectPath === activeProjectPath)
  const mcpServers = activeProject?.mcpServers || []
  const enabledCount = mcpServers.filter((s) => s.enabled).length

  if (!activeProjectPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Icon icon="lucide:folder-open" className="text-zinc-800 text-3xl mx-auto mb-3" />
          <h3 className="text-sm font-medium text-zinc-500 mb-1">No project open</h3>
          <p className="text-xs text-zinc-600">Open a project to manage MCP servers</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl flex items-center justify-center">
              <Icon icon="lucide:puzzle" className="text-white text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">MCP Registry</h1>
              <p className="text-xs text-zinc-500">Model Context Protocol servers extend what Claude can do</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg">
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Total Servers</span>
            <span className="text-xl font-bold text-white font-mono">{mcpServers.length}</span>
          </div>
          <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg">
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Active</span>
            <span className="text-xl font-bold text-emerald-400 font-mono">{enabledCount}</span>
          </div>
          <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg">
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">Disabled</span>
            <span className="text-xl font-bold text-zinc-500 font-mono">{mcpServers.length - enabledCount}</span>
          </div>
        </div>

        {/* Auto-injected info */}
        <div className="mb-6 p-3 bg-blue-500/5 border border-blue-500/15 rounded-lg">
          <div className="flex items-start gap-2.5">
            <Icon icon="lucide:zap" className="text-blue-400 text-sm mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-blue-300 mb-1">Auto-Injected Tools</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Jira MCP is automatically available when connected via Integrations. Computer Use MCP activates when enabled in Settings. These don't appear in the list below — they're injected at runtime.
              </p>
            </div>
          </div>
        </div>

        {/* Server Manager */}
        <div className="bg-pilos-card border border-pilos-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Configured Servers</h2>
            <span className="text-[10px] text-zinc-500">
              Project: <span className="text-zinc-300">{activeProject?.projectName}</span>
            </span>
          </div>
          <McpServerManager
            servers={mcpServers}
            onAdd={(server: McpServer) => addProjectMcpServer(server)}
            onRemove={(id: string) => removeProjectMcpServer(id)}
            onUpdate={(id: string, updates: Partial<McpServer>) => updateProjectMcpServer(id, updates)}
            onToggle={(id: string) => toggleProjectMcpServer(id)}
          />
        </div>

        {/* How it works */}
        <div className="mt-6 p-4 bg-pilos-card border border-pilos-border rounded-xl">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">How MCP Works</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-blue-400">1</span>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-300">Add a server</p>
                <p className="text-[10px] text-zinc-500">Pick from templates (GitHub, Supabase, Filesystem) or add a custom stdio/http server</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-blue-400">2</span>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-300">Configure credentials</p>
                <p className="text-[10px] text-zinc-500">Set API keys, tokens, or connection details. These are stored per-project.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-blue-400">3</span>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-300">Tools become available</p>
                <p className="text-[10px] text-zinc-500">Claude discovers tools from enabled servers automatically. Use them in conversations and workflows.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
