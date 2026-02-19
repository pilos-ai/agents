import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useProjectStore } from '../../store/useProjectStore'
import { api } from '../../api'

export function ProjectTabBar() {
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const closeProject = useProjectStore((s) => s.closeProject)
  const openProject = useProjectStore((s) => s.openProject)
  const loadRecentProjects = useProjectStore((s) => s.loadRecentProjects)

  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const toggleMenu = useCallback(() => {
    setShowMenu((prev) => {
      if (!prev && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect()
        setMenuPos({ top: rect.bottom + 4, left: rect.left })
      }
      return !prev
    })
  }, [])

  // Load recents when menu opens
  useEffect(() => {
    if (showMenu) loadRecentProjects()
  }, [showMenu, loadRecentProjects])

  // Close on click outside or Escape
  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showMenu])

  const handleBrowse = async () => {
    setShowMenu(false)
    const dir = await api.dialog.openDirectory()
    if (dir) openProject(dir)
  }

  const handleOpenRecent = (path: string) => {
    setShowMenu(false)
    openProject(path)
  }

  // Filter out already-open projects from recents
  const openPaths = new Set(openProjects.map((p) => p.projectPath))
  const filteredRecents = recentProjects.filter((p) => !openPaths.has(p.path))

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
        ref={btnRef}
        onClick={toggleMenu}
        className="p-1 mx-1 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors shrink-0"
        title="Open project"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Dropdown rendered via portal to escape overflow clipping */}
      {showMenu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-64 border border-neutral-700 rounded-lg shadow-xl overflow-hidden"
          style={{ top: menuPos.top, left: menuPos.left, backgroundColor: '#1a1a1a' }}
        >
          {filteredRecents.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                Recent
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredRecents.map((project) => (
                  <button
                    key={project.path}
                    onClick={() => handleOpenRecent(project.path)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700/60 transition-colors text-left"
                  >
                    <svg className="w-3.5 h-3.5 text-neutral-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{project.name}</div>
                      <div className="truncate text-[10px] text-neutral-500">{project.path}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t border-neutral-700/50" />
            </>
          )}

          <button
            onClick={handleBrowse}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-700/60 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <span className="font-medium">Browse...</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
