import { useEffect, lazy, Suspense } from 'react'
import { V2Layout } from './components/v2/V2Layout'
import { useProjectStore } from './store/useProjectStore'
import { useConversationStore } from './store/useConversationStore'
import { useAppStore } from './store/useAppStore'
import { useTaskStore } from './store/useTaskStore'
import { useLicenseStore } from './store/useLicenseStore'
import { UpdateNotification } from './components/UpdateNotification'
import { api } from './api'
import { loadPmModule } from './lib/pm'
import type { ClaudeEvent } from './types'

const OnboardingPage = lazy(() => import('./components/v2/pages/OnboardingPage'))
const LoginPage = lazy(() => import('./components/v2/pages/LoginPage'))
const RoleWizardPage = lazy(() => import('./components/v2/pages/RoleWizardPage'))

export default function App() {
  const loadRecentProjects = useProjectStore((s) => s.loadRecentProjects)
  const routeClaudeEvent = useProjectStore((s) => s.routeClaudeEvent)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const setupStatus = useAppStore((s) => s.setupStatus)
  const checkDependencies = useAppStore((s) => s.checkDependencies)
  const isAuthenticated = useLicenseStore((s) => s.isAuthenticated)
  const authLoaded = useLicenseStore((s) => s.authLoaded)
  const workspaceSetupLoaded = useAppStore((s) => s.workspaceSetupLoaded)
  const workspaceSetupComplete = useAppStore((s) => s.workspaceSetupComplete)

  useEffect(() => {
    checkDependencies()
    loadSettings()
    loadRecentProjects()
    useLicenseStore.getState().loadAuthState()
    useAppStore.getState().loadWorkspaceSetup()

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
          useAppStore.getState().setActiveView('settings')
          break
        case 'menu:openProject':
          api.dialog.openDirectory().then((dir) => {
            if (dir) useProjectStore.getState().openProject(dir)
          })
          break
        case 'menu:newConversation':
          if (useProjectStore.getState().activeProjectPath) {
            useAppStore.getState().setActiveView('terminal')
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
          useAppStore.getState().setActiveView('settings')
          break
        case 'menu:toggleRightPanel':
          useAppStore.getState().toggleRightPanel()
          break
      }
    })
  }, [])

  // Listen for scheduled task triggers from main process (background scheduler)
  useEffect(() => {
    if (!api.scheduler) return

    const unsubTrigger = api.scheduler.onTriggerTask(async ({ taskId }) => {
      const store = useTaskStore.getState()
      const task = store.tasks.find((t) => t.id === taskId)
      if (!task || store.activeExecutions[taskId]) return

      api.scheduler!.reportTaskStarted({ taskId, taskTitle: task.title })

      try {
        await store.runTaskWorkflow(taskId, 'scheduled')
      } finally {
        const updated = useTaskStore.getState().tasks.find((t) => t.id === taskId)
        const latestRun = updated?.runs[0]
        api.scheduler!.reportTaskCompleted({
          taskId,
          status: latestRun?.status || 'failed',
          summary: latestRun?.summary || 'Unknown result',
          taskTitle: task.title,
        })
      }
    })

    const unsubNav = api.scheduler.onNavigateToTask((taskId) => {
      useAppStore.getState().setActiveView('tasks')
      useTaskStore.getState().selectTask(taskId)
    })

    return () => { unsubTrigger(); unsubNav() }
  }, [])

  return (
    <div className="h-screen w-screen bg-pilos-bg text-[#fafafa] font-sans flex flex-col overflow-hidden">
      {/* macOS drag region */}
      <div className="titlebar-drag h-8 flex-shrink-0" />

      {setupStatus !== 'ready' ? (
        <Suspense fallback={<div className="flex-1" />}>
          <OnboardingPage />
        </Suspense>
      ) : !authLoaded ? (
        <div className="flex-1" />
      ) : !isAuthenticated ? (
        <Suspense fallback={<div className="flex-1" />}>
          <LoginPage />
        </Suspense>
      ) : workspaceSetupLoaded && !workspaceSetupComplete ? (
        <Suspense fallback={<div className="flex-1" />}>
          <RoleWizardPage />
        </Suspense>
      ) : (
        <V2Layout />
      )}
      <UpdateNotification />
    </div>
  )
}
