import { lazy, Suspense, useRef } from 'react'
import { useAppStore, type AppView } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { CliGate } from './CliGate'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage'))
const TerminalPage = lazy(() => import('./pages/TerminalPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const AgentsPage = lazy(() => import('./pages/AgentsPage'))
const McpPage = lazy(() => import('./pages/McpPage'))
const RunsPage = lazy(() => import('./pages/RunsPage'))
const ReporterPage = lazy(() => import('./pages/ReporterPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function ViewLoading() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-pilos-blue border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// Map legacy persisted view keys (also handled at the store layer) so any direct
// callers stay safe.
function migrate(view: AppView): AppView {
  if (view === 'tasks') return 'workflows'
  if (view === 'results') return 'runs'
  if (view === 'config') return 'agents'
  return view
}

export function ViewRouter({ view }: { view: AppView }) {
  const hasProject = useProjectStore((s) => !!s.activeProjectPath)
  // Dashboard is the no-project landing only. Once a project is open, dashboard
  // routes to chat (guards against stale per-project view memory and any
  // openProject path that didn't go through the store-layer migration).
  const v = hasProject && migrate(view) === 'dashboard' ? 'chat' : migrate(view)

  // Agents workspace requires the Claude CLI. If it isn't connected, show the
  // CLI gate in place of the (CLI-dependent) view — never blocks the Reporter.
  const workspace = useAppStore((s) => s.workspace)
  const cliReady = useAppStore((s) => s.cliStatus === 'ready')
  if (workspace === 'agents' && !cliReady && v !== 'settings') {
    return <CliGate />
  }

  // Terminal must persist its xterm.js instance across tab switches — otherwise
  // tearing it down kills the renderer-side display state (scrollback, prompt,
  // in-flight output) even though the PTY in main process keeps running. We
  // mount it lazily on first visit, then keep it in the tree behind display:none.
  const terminalVisited = useRef(false)
  if (v === 'terminal') terminalVisited.current = true

  return (
    <Suspense fallback={<ViewLoading />}>
      {v === 'dashboard' && <DashboardPage />}
      {v === 'chat' && <ChatPage />}
      {v === 'workflows' && <WorkflowsPage />}
      {terminalVisited.current && (
        <div
          className="flex flex-col"
          style={{
            flex: v === 'terminal' ? '1 1 0' : '0 0 0',
            minHeight: 0,
            display: v === 'terminal' ? 'flex' : 'none',
          }}
        >
          <TerminalPage />
        </div>
      )}
      {v === 'analytics' && <AnalyticsPage />}
      {v === 'agents' && <AgentsPage />}
      {v === 'mcp' && <McpPage />}
      {v === 'runs' && <RunsPage />}
      {v === 'reporter' && <ReporterPage />}
      {v === 'settings' && <SettingsPage />}
    </Suspense>
  )
}
