import { Icon } from '../common/Icon'
import { useAppStore, type AppView } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { api } from '../../api'

interface NavItem {
  id: AppView
  label: string
  icon: string
  badge?: number
}

function NavSection({ label, items }: { label: string; items: NavItem[] }) {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)

  return (
    <div className="mb-2">
      <div className="px-4 py-2">
        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{label}</span>
      </div>
      <div className="space-y-0.5 px-2">
        {items.map((item) => {
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors titlebar-no-drag ${
                isActive
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <Icon icon={item.icon} className={isActive ? 'text-blue-400' : 'text-zinc-500'} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function NavigationSidebar() {
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProject = useProjectStore((s) => s.openProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const setActiveView = useAppStore((s) => s.setActiveView)

  const activeProject = openProjects.find((p) => p.projectPath === activeProjectPath)
  const agentCount = activeProject?.agents.length || 0
  const mcpCount = (activeProject?.mcpServers || []).filter((s) => s.enabled).length

  const workspaceItems: NavItem[] = [
    { id: 'dashboard', label: 'Command Center', icon: 'lucide:layout-dashboard' },
    { id: 'config', label: 'Agent Swarm', icon: 'lucide:bot', badge: agentCount },
    { id: 'tasks', label: 'Tasks', icon: 'lucide:list-checks' },
    { id: 'terminal', label: 'Terminal', icon: 'lucide:terminal' },
  ]

  const advancedItems: NavItem[] = [
    { id: 'analytics', label: 'Performance', icon: 'lucide:activity' },
    { id: 'mcp', label: 'MCP Registry', icon: 'lucide:puzzle', badge: mcpCount },
    { id: 'settings', label: 'Settings', icon: 'lucide:settings' },
  ]

  const handleOpenProject = async () => {
    const dir = await api.dialog.openDirectory()
    if (dir) openProject(dir)
  }

  return (
    <div className="w-64 h-full border-r border-pilos-border bg-pilos-bg flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="p-4 pb-2 titlebar-drag">
        <div className="flex items-center gap-2.5 titlebar-no-drag">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center">
            <Icon icon="lucide:cpu" className="text-white text-sm" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Pilos Agents</h1>
          </div>
        </div>
      </div>

      {/* Project Selector */}
      <div className="px-3 py-2 titlebar-no-drag">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (openProjects.length > 1) {
                const currentIdx = openProjects.findIndex((p) => p.projectPath === activeProjectPath)
                const nextIdx = (currentIdx + 1) % openProjects.length
                setActiveProject(openProjects[nextIdx].projectPath)
              }
            }}
            className="flex-1 flex items-center gap-2 px-3 py-2 bg-pilos-card border border-pilos-border rounded-lg text-left hover:border-zinc-600 transition-colors"
          >
            <Icon icon="lucide:folder" className="text-zinc-500 text-xs" />
            <span className="text-xs text-zinc-300 truncate flex-1">{activeProject?.projectName || 'No Project'}</span>
            {openProjects.length > 1 && (
              <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{openProjects.length}</span>
            )}
          </button>
          <button
            onClick={handleOpenProject}
            className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            title="Open project"
          >
            <Icon icon="lucide:plus" className="text-sm" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2 titlebar-no-drag">
        <NavSection label="Workspace" items={workspaceItems} />
        <NavSection label="Advanced" items={advancedItems} />
      </nav>

      {/* Footer */}
      <div className="border-t border-pilos-border p-3 titlebar-no-drag">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600/20 to-indigo-700/20 rounded-full flex items-center justify-center border border-blue-500/20">
            <span className="text-[10px] font-bold text-blue-400">JD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-300 truncate">Dev Instance</p>
            <p className="text-[10px] text-zinc-600">v2.1.0-alpha</p>
          </div>
          <button
            onClick={() => setActiveView('settings')}
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <Icon icon="lucide:settings" className="text-sm" />
          </button>
        </div>
      </div>
    </div>
  )
}
