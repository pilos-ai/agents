import { useProjectStore } from '../../store/useProjectStore'
import { useAppStore } from '../../store/useAppStore'

export function ProjectTabBar() {
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const closeProject = useProjectStore((s) => s.closeProject)

  return (
    <div className="flex items-center bg-neutral-900/80 border-b border-neutral-800 px-1 h-8 flex-shrink-0 overflow-x-auto">
      {openProjects.map((tab) => {
        const isActive = tab.projectPath === activeProjectPath
        const isBackgroundBusy = !isActive && (
          tab.snapshot?.isWaitingForResponse || tab.snapshot?.streaming.isStreaming
        )
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
            {/* Activity indicator for background tabs with running sessions */}
            {isBackgroundBusy && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            )}
            <span className="truncate">{tab.projectName}</span>
            {/* Unread message badge */}
            {!isActive && tab.unreadCount > 0 && (
              <span className="flex items-center justify-center min-w-[16px] h-4 px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full shrink-0">
                {tab.unreadCount > 99 ? '99+' : tab.unreadCount}
              </span>
            )}
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

      {/* Add project button — show project picker */}
      <button
        onClick={() => {
          useProjectStore.setState({ activeProjectPath: null })
          useAppStore.getState().setActiveView('dashboard')
        }}
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
