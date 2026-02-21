import { useEffect, useMemo } from 'react'
import { useJiraStore } from '../stores/useJiraStore'
import { PmSetupWizard } from './PmSetupWizard'

export function JiraDashboardPanel() {
  const connected = useJiraStore((s) => s.connected)
  const sprints = useJiraStore((s) => s.sprints)
  const boardIssues = useJiraStore((s) => s.boardIssues)
  const selectedSprintId = useJiraStore((s) => s.selectedSprintId)
  const users = useJiraStore((s) => s.users)
  const selectedBoardId = useJiraStore((s) => s.selectedBoardId)
  const selectedProjectKey = useJiraStore((s) => s.selectedProjectKey)
  const loadSprints = useJiraStore((s) => s.loadSprints)
  const loadUsers = useJiraStore((s) => s.loadUsers)
  const checkConnection = useJiraStore((s) => s.checkConnection)

  useEffect(() => {
    checkConnection()
  }, [])

  useEffect(() => {
    if (connected && selectedBoardId && sprints.length === 0) {
      loadSprints(selectedBoardId)
    }
    if (connected && selectedProjectKey && users.length === 0) {
      loadUsers(selectedProjectKey)
    }
  }, [connected, selectedBoardId, selectedProjectKey])

  const activeSprint = sprints.find((s) => s.id === selectedSprintId)

  // Sprint progress
  const progress = useMemo(() => {
    const total = boardIssues.length
    const done = boardIssues.filter((i) => i.status.categoryKey === 'done').length
    const inProgress = boardIssues.filter((i) => i.status.categoryKey === 'indeterminate').length
    const todo = total - done - inProgress
    return { total, done, inProgress, todo, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
  }, [boardIssues])

  // Developer workload
  const workload = useMemo(() => {
    const map = new Map<string, { name: string; avatar?: string; total: number; done: number }>()
    for (const issue of boardIssues) {
      if (!issue.assignee) continue
      const key = issue.assignee.accountId
      if (!map.has(key)) {
        map.set(key, { name: issue.assignee.displayName, avatar: issue.assignee.avatarUrl, total: 0, done: 0 })
      }
      const entry = map.get(key)!
      entry.total++
      if (issue.status.categoryKey === 'done') entry.done++
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [boardIssues])

  // Sprint timeline
  const timeline = useMemo(() => {
    if (!activeSprint?.startDate || !activeSprint?.endDate) return null
    const start = new Date(activeSprint.startDate).getTime()
    const end = new Date(activeSprint.endDate).getTime()
    const now = Date.now()
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
    const elapsed = Math.ceil((now - start) / (1000 * 60 * 60 * 24))
    const remaining = Math.max(0, totalDays - elapsed)
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)))
    return { totalDays, elapsed, remaining, pct }
  }, [activeSprint])

  if (!connected || selectedBoardId === null) {
    return <PmSetupWizard onComplete={() => checkConnection()} />
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Sprint header */}
      <div>
        <h2 className="text-xl font-semibold text-white">{activeSprint?.name || 'Sprint Dashboard'}</h2>
        {activeSprint?.goal && (
          <p className="text-sm text-neutral-400 mt-1">{activeSprint.goal}</p>
        )}
      </div>

      {/* Sprint progress */}
      <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-neutral-300">Sprint Progress</h3>
          <span className="text-lg font-bold text-white">{progress.pct}%</span>
        </div>
        <div className="w-full h-3 bg-neutral-700 rounded-full overflow-hidden flex">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress.total > 0 ? (progress.inProgress / progress.total) * 100 : 0}%` }} />
        </div>
        <div className="flex gap-4 mt-2 text-xs">
          <span className="text-green-400">{progress.done} Done</span>
          <span className="text-blue-400">{progress.inProgress} In Progress</span>
          <span className="text-neutral-400">{progress.todo} To Do</span>
        </div>
      </div>

      {/* Timeline */}
      {timeline && (
        <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-800">
          <h3 className="text-sm font-medium text-neutral-300 mb-3">Timeline</h3>
          <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 transition-all rounded-full" style={{ width: `${timeline.pct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-neutral-500">
            <span>Day {timeline.elapsed} of {timeline.totalDays}</span>
            <span>{timeline.remaining} days remaining</span>
          </div>
        </div>
      )}

      {/* Developer workload */}
      <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-800">
        <h3 className="text-sm font-medium text-neutral-300 mb-3">Team Workload</h3>
        {workload.length === 0 ? (
          <p className="text-xs text-neutral-500">No assigned issues found.</p>
        ) : (
          <div className="space-y-3">
            {workload.map((dev) => (
              <div key={dev.name} className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-32 flex-shrink-0">
                  {dev.avatar ? (
                    <img src={dev.avatar} className="w-5 h-5 rounded-full" alt="" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-neutral-600 flex items-center justify-center text-[9px] text-white">
                      {dev.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-xs text-neutral-300 truncate">{dev.name.split(' ')[0]}</span>
                </div>
                <div className="flex-1 h-2 bg-neutral-700 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${dev.total > 0 ? (dev.done / dev.total) * 100 : 0}%` }}
                  />
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${dev.total > 0 ? ((dev.total - dev.done) / dev.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-neutral-500 tabular-nums w-12 text-right">
                  {dev.done}/{dev.total}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-800">
        <h3 className="text-sm font-medium text-neutral-300 mb-3">Recent Updates</h3>
        <div className="space-y-2">
          {boardIssues
            .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
            .slice(0, 8)
            .map((issue) => (
              <div key={issue.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-blue-400">{issue.key}</span>
                <span className="text-neutral-400 truncate flex-1">{issue.summary}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  issue.status.categoryKey === 'done' ? 'bg-green-500/10 text-green-400' :
                  issue.status.categoryKey === 'indeterminate' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-neutral-700 text-neutral-400'
                }`}>
                  {issue.status.name}
                </span>
              </div>
            ))}
          {boardIssues.length === 0 && (
            <p className="text-xs text-neutral-500">No issues to display.</p>
          )}
        </div>
      </div>
    </div>
  )
}
