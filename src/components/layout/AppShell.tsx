import { Sidebar } from './Sidebar'
import { ResizablePanel } from './ResizablePanel'
import { ChatPanel } from '../chat/ChatPanel'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { ProcessPanel } from '../processes/ProcessPanel'
import { useAppStore } from '../../store/useAppStore'

export function AppShell() {
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const rightPanelWidth = useAppStore((s) => s.rightPanelWidth)
  const setRightPanelWidth = useAppStore((s) => s.setRightPanelWidth)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const activeRightTab = useAppStore((s) => s.activeRightTab)
  const setActiveRightTab = useAppStore((s) => s.setActiveRightTab)

  return (
    <div className="flex flex-1 overflow-hidden">
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

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatPanel />
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
                onClick={() => setActiveRightTab('processes')}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  activeRightTab === 'processes'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Processes
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {activeRightTab === 'terminal' ? <TerminalPanel /> : <ProcessPanel />}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
