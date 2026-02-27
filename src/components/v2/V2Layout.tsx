import { NavigationSidebar } from './NavigationSidebar'
import { HeaderBar } from './HeaderBar'
import { ViewRouter } from './ViewRouter'
import { useAppStore } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useConversationStore } from '../../store/useConversationStore'

export function V2Layout() {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)

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
      case 'config':
        return {
          actionLabel: 'Save Changes',
          actionIcon: 'lucide:save',
          onAction: () => {},
        }
      case 'mcp':
        return {
          actionLabel: 'Add Server',
          actionIcon: 'lucide:plus',
          onAction: () => {},
        }
      default:
        return {}
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <NavigationSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <HeaderBar {...getActionProps()} />
        <ViewRouter view={activeView} />
      </main>
    </div>
  )
}
