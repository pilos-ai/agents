import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ProjectTabBar } from './components/layout/ProjectTabBar'
import { WelcomeScreen } from './components/welcome/WelcomeScreen'
import { SetupScreen } from './components/setup/SetupScreen'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { useProjectStore } from './store/useProjectStore'
import { useConversationStore } from './store/useConversationStore'
import { useAppStore } from './store/useAppStore'
import { useLicenseStore } from './store/useLicenseStore'
import { UpdateNotification } from './components/UpdateNotification'
import { api } from './api'
import { loadPmModule } from './lib/pm'
import type { ClaudeEvent } from './types'

export default function App() {
  const loadRecentProjects = useProjectStore((s) => s.loadRecentProjects)
  const routeClaudeEvent = useProjectStore((s) => s.routeClaudeEvent)
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const cliStatus = useAppStore((s) => s.cliStatus)
  const checkCli = useAppStore((s) => s.checkCli)

  const hasOpenProjects = openProjects.length > 0

  useEffect(() => {
    checkCli()
    loadSettings()
    loadRecentProjects()
    useLicenseStore.getState().checkLicense()

    // Dynamically initialize PM module if available
    loadPmModule().then((pm) => {
      if (pm) {
        pm.initPmStores({
          api: {
            jira: api.jira!,
            stories: api.stories!,
          },
          getProjectPath: () => useProjectStore.getState().activeProjectPath || '',
          setActiveView: (view) => useAppStore.getState().setActiveView(view),
          subscribeProjectPath: (callback) => {
            let lastPath: string | null = null
            return useProjectStore.subscribe((state) => {
              const currentPath = state.activeProjectPath
              if (currentPath !== lastPath) {
                lastPath = currentPath
                callback(currentPath)
              }
            })
          },
        })
        pm.useJiraStore.getState().checkConnection()
      }
    })

    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      routeClaudeEvent(event)
    })

    return unsub
  }, [])

  // Sync active project to menu
  useEffect(() => {
    if (activeProjectPath) {
      const name = activeProjectPath.split('/').pop() || activeProjectPath
      api.menu.setActiveProject({ path: activeProjectPath, name })
    } else {
      api.menu.setActiveProject(null)
    }
  }, [activeProjectPath])

  // Listen for menu actions from main process
  useEffect(() => {
    return api.menu.onMenuAction((action: string, ...args: unknown[]) => {
      switch (action) {
        case 'menu:openSettings':
          useAppStore.getState().setSettingsOpen(true)
          break
        case 'menu:openProject':
          api.dialog.openDirectory().then((dir) => {
            if (dir) useProjectStore.getState().openProject(dir)
          })
          break
        case 'menu:newConversation':
          if (useProjectStore.getState().activeProjectPath) {
            useConversationStore.getState().createConversation()
          }
          break
        case 'menu:openRecentProject':
          if (args[0]) useProjectStore.getState().openProject(args[0] as string)
          break
        case 'menu:closeProject': {
          const closePath = args[0] as string | undefined
          if (closePath) useProjectStore.getState().closeProject(closePath)
          break
        }
        case 'menu:openProjectSettings':
          useAppStore.getState().setSettingsOpen(true)
          break
        case 'menu:toggleRightPanel':
          useAppStore.getState().toggleRightPanel()
          break
      }
    })
  }, [])

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* macOS drag region */}
      <div className="titlebar-drag h-8 flex-shrink-0" />

      {cliStatus !== 'ready' ? (
        <SetupScreen />
      ) : settingsOpen ? (
        <SettingsDialog />
      ) : hasOpenProjects ? (
        <>
          <ProjectTabBar />
          <AppShell />
        </>
      ) : (
        <WelcomeScreen />
      )}
      <UpdateNotification />
    </div>
  )
}
