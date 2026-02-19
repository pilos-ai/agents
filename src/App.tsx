import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { useConversationStore } from './store/useConversationStore'
import { useAppStore } from './store/useAppStore'
import { api } from './api'
import type { ClaudeEvent } from './types'

export default function App() {
  const loadConversations = useConversationStore((s) => s.loadConversations)
  const handleClaudeEvent = useConversationStore((s) => s.handleClaudeEvent)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const settingsOpen = useAppStore((s) => s.settingsOpen)

  useEffect(() => {
    loadSettings()
    loadConversations()

    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      handleClaudeEvent(event)
    })

    return unsub
  }, [])

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* macOS drag region */}
      <div className="titlebar-drag h-8 flex-shrink-0" />
      <AppShell />
      {settingsOpen && <SettingsDialog />}
    </div>
  )
}
