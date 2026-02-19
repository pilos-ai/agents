import { useProjectStore } from '../../store/useProjectStore'
import { api } from '../../api'

export function ProjectTabBar() {
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const closeProject = useProjectStore((s) => s.closeProject)
  const openProject = useProjectStore((s) => s.openProject)

  const handleAddProject = async () => {
    const dir = await api.dialog.openDirectory()
    if (dir) openProject(dir)
  }

  return (
    <div className="flex items-center bg-neutral-900/80 border-b border-neutral-800 px-1 h-8 flex-shrink-0 overflow-x-auto">
      {openProjects.map((tab) => {
        const isActive = tab.projectPath === activeProjectPath
        return (
          <div
            key={tab.projectPath}
            className={`group flex items-center gap-1.5 px-3 py-1 rounded-t-md text-xs cursor-pointer transition-colors shrink-0 max-w-[180px] ${
              isActive
                ? 'bg-neutral-800 text-neutral-100 border-b-2 border-blue-500'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
            }`}
            onClick={() => setActiveProject(tab.projectPath)}
          >
            <span className="truncate">{tab.projectName}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeProject(tab.projectPath)
              }}
              className="p-0.5 text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
              title="Close project"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}

      {/* Add project button */}
      <button
        onClick={handleAddProject}
        className="p-1 mx-1 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors shrink-0"
        title="Open project"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  )
}
