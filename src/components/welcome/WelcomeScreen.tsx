import { useProjectStore } from '../../store/useProjectStore'
import { api } from '../../api'

export function WelcomeScreen() {
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const openProject = useProjectStore((s) => s.openProject)
  const removeRecentProject = useProjectStore((s) => s.removeRecentProject)

  const handleOpenProject = async () => {
    const dir = await api.dialog.openDirectory()
    if (dir) openProject(dir)
  }

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso)
      const now = new Date()
      const diffMs = now.getTime() - d.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays === 0) return 'Today'
      if (diffDays === 1) return 'Yesterday'
      if (diffDays < 7) return `${diffDays} days ago`
      return d.toLocaleDateString()
    } catch {
      return ''
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="max-w-md w-full">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <svg className="w-14 h-14 mx-auto mb-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          <h1 className="text-lg font-semibold text-neutral-200">Pilos Agents</h1>
          <p className="text-sm text-neutral-500 mt-1">Open a project directory to get started</p>
        </div>

        {/* Open Project Button */}
        <button
          onClick={handleOpenProject}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors mb-6"
        >
          Open Project...
        </button>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div>
            <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Recent Projects</h2>
            <div className="space-y-1">
              {recentProjects.map((project) => (
                <div
                  key={project.path}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-800/60 cursor-pointer transition-colors"
                  onClick={() => openProject(project.path)}
                >
                  <svg className="w-4 h-4 text-neutral-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-200 truncate">{project.name}</p>
                    <p className="text-xs text-neutral-500 truncate">{project.path}</p>
                  </div>
                  <span className="text-xs text-neutral-600 shrink-0">{formatDate(project.lastOpened)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecentProject(project.path)
                    }}
                    className="p-1 text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Remove from recent"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
