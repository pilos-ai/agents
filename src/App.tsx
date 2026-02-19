import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ProjectTabBar } from './components/layout/ProjectTabBar'
import { WelcomeScreen } from './components/welcome/WelcomeScreen'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { useProjectStore } from './store/useProjectStore'
import { useAppStore } from './store/useAppStore'
import { api } from './api'
import type { ClaudeEvent } from './types'

export default function App() {
  const loadRecentProjects = useProjectStore((s) => s.loadRecentProjects)
  const routeClaudeEvent = useProjectStore((s) => s.routeClaudeEvent)
  const openProjects = useProjectStore((s) => s.openProjects)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const settingsOpen = useAppStore((s) => s.settingsOpen)

  const hasOpenProjects = openProjects.length > 0

  useEffect(() => {
    loadSettings()
    loadRecentProjects()

    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      routeClaudeEvent(event)
    })

    return unsub
  }, [])

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* macOS drag region */}
      <div className="titlebar-drag h-8 flex-shrink-0" />

      {hasOpenProjects ? (
        <>
          <ProjectTabBar />
          <AppShell />
        </>
      ) : (
        <WelcomeScreen />
      )}

      {settingsOpen && <SettingsDialog />}
    </div>
  )
}
