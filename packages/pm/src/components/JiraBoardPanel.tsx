import { useEffect, useMemo } from 'react'
import { useJiraStore } from '../stores/useJiraStore'
import { JiraIssueCard } from './JiraIssueCard'
import { PmSetupWizard } from './PmSetupWizard'

const COLUMNS = [
  { key: 'new', label: 'TO DO', color: 'text-neutral-400' },
  { key: 'indeterminate', label: 'IN PROGRESS', color: 'text-blue-400' },
  { key: 'done', label: 'DONE', color: 'text-green-400' },
]

export function JiraBoardPanel() {
  const connected = useJiraStore((s) => s.connected)
  const sprints = useJiraStore((s) => s.sprints)
  const boardIssues = useJiraStore((s) => s.boardIssues)
  const selectedSprintId = useJiraStore((s) => s.selectedSprintId)
  const selectedBoardId = useJiraStore((s) => s.selectedBoardId)
  const isKanban = useJiraStore((s) => s.isKanban)
  const loadSprints = useJiraStore((s) => s.loadSprints)
  const loadSprintIssues = useJiraStore((s) => s.loadSprintIssues)
  const selectSprint = useJiraStore((s) => s.selectSprint)
  const loadingIssues = useJiraStore((s) => s.loadingIssues)
  const refreshBoard = useJiraStore((s) => s.refreshBoard)
  const checkConnection = useJiraStore((s) => s.checkConnection)

  useEffect(() => {
    checkConnection()
  }, [])

  // Auto-load when connected and board selected
  useEffect(() => {
    if (connected && selectedBoardId !== null) {
      console.log('[JiraBoardPanel] Loading board data for boardId:', selectedBoardId)
      loadSprints(selectedBoardId)
    }
  }, [connected, selectedBoardId])

  const columns = useMemo(() => {
    return COLUMNS.map((col) => ({
      ...col,
      issues: boardIssues.filter((i) => i.status.categoryKey === col.key),
    }))
  }, [boardIssues])

  if (!connected || selectedBoardId === null) {
    return <PmSetupWizard onComplete={() => checkConnection()} />
  }

  const activeSprint = sprints.find((s) => s.id === selectedSprintId)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-neutral-800">
        {isKanban ? (
          <span className="text-sm text-neutral-300 font-medium">Kanban Board</span>
        ) : (
          <select
            value={selectedSprintId || ''}
            onChange={(e) => {
              const id = Number(e.target.value)
              selectSprint(id)
              loadSprintIssues(id)
            }}
            className="bg-neutral-800 text-sm text-neutral-200 rounded px-2 py-1 border border-neutral-700 outline-none"
          >
            {sprints.length === 0 && (
              <option value="">No sprints</option>
            )}
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.state})
              </option>
            ))}
          </select>
        )}
        {activeSprint?.goal && (
          <span className="text-xs text-neutral-500 truncate">{activeSprint.goal}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={refreshBoard}
          disabled={loadingIssues}
          className="px-3 py-1 text-xs text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
        >
          {loadingIssues ? 'Loading...' : 'Refresh'}
        </button>
        <span className="text-xs text-neutral-500">{boardIssues.length} issues</span>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto p-3">
        <div className="flex gap-3 h-full min-w-max">
          {columns.map((col) => (
            <div key={col.key} className="w-72 flex-shrink-0 flex flex-col">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className={`text-xs font-semibold uppercase tracking-wider ${col.color}`}>
                  {col.label}
                </span>
                <span className="text-[10px] text-neutral-600 bg-neutral-800 rounded-full px-1.5">
                  {col.issues.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {col.issues.map((issue) => (
                  <JiraIssueCard key={issue.id} issue={issue} />
                ))}
                {col.issues.length === 0 && (
                  <div className="text-xs text-neutral-600 text-center py-4">No issues</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
