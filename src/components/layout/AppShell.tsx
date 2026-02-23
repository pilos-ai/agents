import { useState, useEffect, type ComponentType } from 'react'
import { Sidebar } from './Sidebar'
import { ResizablePanel } from './ResizablePanel'
import { ChatPanel } from '../chat/ChatPanel'
import { SearchPanel } from '../chat/SearchPanel'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { SessionInfoPanel } from '../session/SessionInfoPanel'
import { useAppStore } from '../../store/useAppStore'
import { useLicenseStore } from '../../store/useLicenseStore'
import { useSearchStore } from '../../store/useSearchStore'

// Lazily loaded PM components
let PmStoriesPanel: ComponentType | null = null
let PmBoardPanel: ComponentType | null = null
let PmDashboardPanel: ComponentType | null = null
let pmLoaded = false

function loadPmComponents(): Promise<void> {
  if (pmLoaded) return Promise.resolve()
  return import('@pilos/agents-pm')
    .then((mod) => {
      PmStoriesPanel = mod.StoriesPanel
      PmBoardPanel = mod.JiraBoardPanel
      PmDashboardPanel = mod.JiraDashboardPanel
      pmLoaded = true
    })
    .catch(() => {
      pmLoaded = true // Don't retry
    })
}

export function AppShell() {
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const rightPanelWidth = useAppStore((s) => s.rightPanelWidth)
  const setRightPanelWidth = useAppStore((s) => s.setRightPanelWidth)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const activeRightTab = useAppStore((s) => s.activeRightTab)
  const setActiveRightTab = useAppStore((s) => s.setActiveRightTab)
  const activeView = useAppStore((s) => s.activeView)
  const tier = useLicenseStore((s) => s.flags.tier)
  const isPro = tier === 'pro' || tier === 'teams'

  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (isPro && activeView !== 'chat' && !pmLoaded) {
      loadPmComponents().then(() => forceUpdate((n) => n + 1))
    }
  }, [activeView, isPro])

  // Cmd+Shift+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
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

  const renderMainPanel = () => {
    switch (activeView) {
      case 'stories': return PmStoriesPanel ? <PmStoriesPanel /> : null
      case 'board': return PmBoardPanel ? <PmBoardPanel /> : null
      case 'dashboard': return PmDashboardPanel ? <PmDashboardPanel /> : null
      default: return <ChatPanel />
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Search overlay */}
      <SearchPanel />

      {/* Sidebar */}
      <div style={{ width: sidebarWidth, minWidth: 180, maxWidth: 360 }} className="flex-shrink-0">
        <Sidebar />
      </div>

      <ResizablePanel
        width={sidebarWidth}
        onResize={setSidebarWidth}
        minWidth={180}
        maxWidth={360}
        side="left"
      />

      {/* Main Content Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {renderMainPanel()}
      </div>

      {/* Right Panel */}
      {rightPanelOpen && (
        <>
          <ResizablePanel
            width={rightPanelWidth}
            onResize={setRightPanelWidth}
            minWidth={280}
            maxWidth={600}
            side="right"
          />
          <div
            style={{ width: rightPanelWidth, minWidth: 280, maxWidth: 600 }}
            className="flex-shrink-0 flex flex-col border-l border-neutral-800"
          >
            {/* Tab bar */}
            <div className="flex border-b border-neutral-800 bg-neutral-900/50">
              <button
                onClick={() => setActiveRightTab('terminal')}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  activeRightTab === 'terminal'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Terminal
              </button>
              <button
                onClick={() => setActiveRightTab('session')}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  activeRightTab === 'session'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Session
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {activeRightTab === 'terminal' && <TerminalPanel />}
              {activeRightTab === 'session' && <SessionInfoPanel />}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
