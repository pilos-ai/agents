import { useState, useEffect, useCallback } from 'react'
import { NavigationSidebar } from './NavigationSidebar'
import { HeaderBar } from './HeaderBar'
import { ViewRouter } from './ViewRouter'
import { CommandPalette } from './CommandPalette'
import { SearchPanel } from '../chat/SearchPanel'
import { useSearchStore } from '../../store/useSearchStore'
import { useAppStore } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useConversationStore } from '../../store/useConversationStore'
import { useUsageStore } from '../../store/useUsageStore'

export function V2Layout() {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)

  // Start usage polling
  useEffect(() => {
    useUsageStore.getState().startPolling()
    return () => useUsageStore.getState().stopPolling()
  }, [])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  // ⌘+K / Ctrl+K to toggle command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ⌘+F / Ctrl+F to toggle search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        const store = useSearchStore.getState()
        if (store.isOpen) {
          store.close()
        } else {
          store.open()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Determine action button based on current view
  const getActionProps = () => {
    switch (activeView) {
      case 'dashboard':
        return {
          actionLabel: openProjects.length > 0 ? 'New Chat' : 'Open Project',
          actionIcon: openProjects.length > 0 ? 'lucide:plus' : 'lucide:folder-open',
          onAction: () => {
            if (openProjects.length > 0) {
              setActiveView('terminal')
              if (activeProjectPath) {
                useConversationStore.getState().createConversation()
              }
            }
          },
        }
      case 'terminal':
        return {
          actionLabel: 'New Chat',
          actionIcon: 'lucide:plus',
          onAction: () => {
            if (activeProjectPath) {
              useConversationStore.getState().createConversation()
            }
          },
        }
      case 'mcp':
        return {
          actionLabel: 'Add Server',
          actionIcon: 'lucide:plus',
          onAction: () => {},
        }
      case 'tasks':
        return {
          actionLabel: 'New Task',
          actionIcon: 'lucide:plus',
          onAction: () => {
            window.dispatchEvent(new CustomEvent('pilos:new-task'))
          },
        }
      case 'config':
        return {
          actionLabel: 'New Agent',
          actionIcon: 'lucide:plus',
          onAction: () => {
            window.dispatchEvent(new CustomEvent('pilos:new-agent'))
          },
        }
      case 'results':
        return {
          actionLabel: 'View Tasks',
          actionIcon: 'lucide:list-checks',
          onAction: () => setActiveView('tasks'),
        }
      default:
        return {}
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <NavigationSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <HeaderBar {...getActionProps()} onOpenPalette={openPalette} />
        <ViewRouter view={activeView} />
      </main>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <SearchPanel />
    </div>
  )
}
