import { useState, useRef, useEffect } from 'react'
import { Icon } from '../common/Icon'
import { useAppStore, type AppView } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useLicenseStore } from '../../store/useLicenseStore'

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

const TIER_BADGE: Record<string, { bg: string; text: string }> = {
  free: { bg: 'bg-zinc-700', text: 'text-zinc-400' },
  pro: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  teams: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
}

function SidebarFooter() {
  const setActiveView = useAppStore((s) => s.setActiveView)
  const email = useLicenseStore((s) => s.email)
  const tier = useLicenseStore((s) => s.tier)
  const logout = useLicenseStore((s) => s.logout)

  const initials = email
    ? email.split('@')[0].slice(0, 2).toUpperCase()
    : '??'

  const badge = TIER_BADGE[tier] || TIER_BADGE.free

  return (
    <div className="border-t border-pilos-border p-3 titlebar-no-drag">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-600/20 to-indigo-700/20 rounded-full flex items-center justify-center border border-blue-500/20">
          <span className="text-[10px] font-bold text-blue-400">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-zinc-300 truncate">{email || 'Unknown'}</p>
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${badge.bg} ${badge.text}`}>
              {tier}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600">v2.1.0-alpha</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveView('settings')}
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Settings"
          >
            <Icon icon="lucide:settings" className="text-sm" />
          </button>
          <button
            onClick={logout}
            className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
            title="Sign out"
          >
            <Icon icon="lucide:log-out" className="text-sm" />
          </button>
        </div>
      </div>
    </div>
  )
}

function ProjectSelector({ openProjects, activeProjectPath, activeProject, setActiveProject, onNewProject }: {
  openProjects: { projectPath: string; projectName: string }[]
  activeProjectPath: string | null
  activeProject?: { projectName: string }
  setActiveProject: (path: string) => Promise<void>
  onNewProject: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="px-3 py-2 titlebar-no-drag relative" ref={ref}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 flex items-center gap-2 px-3 py-2 bg-pilos-card border border-pilos-border rounded-lg text-left hover:border-zinc-600 transition-colors"
        >
          <Icon icon="lucide:folder" className="text-zinc-500 text-xs" />
          <span className="text-xs text-zinc-300 truncate flex-1">{activeProject?.projectName || 'No Project'}</span>
          <Icon icon="lucide:chevron-down" className={`text-zinc-600 text-[10px] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={onNewProject}
          className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          title="Open project"
        >
          <Icon icon="lucide:plus" className="text-sm" />
        </button>
      </div>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-pilos-card border border-pilos-border rounded-lg shadow-xl z-50 overflow-hidden">
          {openProjects.map((p) => (
            <button
              key={p.projectPath}
              onClick={() => { setActiveProject(p.projectPath); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                p.projectPath === activeProjectPath
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'text-zinc-300 hover:bg-zinc-800/60'
              }`}
            >
              <Icon icon="lucide:folder" className={`text-xs ${p.projectPath === activeProjectPath ? 'text-blue-400' : 'text-zinc-600'}`} />
              <span className="truncate">{p.projectName}</span>
              {p.projectPath === activeProjectPath && (
                <Icon icon="lucide:check" className="text-blue-400 text-xs ml-auto" />
              )}
            </button>
          ))}
        </div>
      )}
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

  const handleOpenProject = () => {
    useProjectStore.setState({ activeProjectPath: null })
    setActiveView('dashboard')
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
      <ProjectSelector
        openProjects={openProjects}
        activeProjectPath={activeProjectPath}
        activeProject={activeProject}
        setActiveProject={setActiveProject}
        onNewProject={handleOpenProject}
      />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2 titlebar-no-drag">
        <NavSection label="Workspace" items={workspaceItems} />
        <NavSection label="Advanced" items={advancedItems} />
      </nav>

      {/* Footer — User Account */}
      <SidebarFooter />
    </div>
  )
}
