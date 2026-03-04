import { useState, useMemo, useEffect } from 'react'
import { Icon } from '../../common/Icon'
import { StatCard } from '../components/StatCard'
import { StatusDot } from '../components/StatusDot'
import { SmartDataRenderer } from '../components/SmartDataRenderer'
import {
  StepResultCard,
  actionIcons,
  formatDuration,
  timeAgo,
  runStatusColors,
} from '../components/TaskRunCard'
import { useAppStore } from '../../../store/useAppStore'
import { useTaskStore, type Task, type TaskRun, type RunStatus } from '../../../store/useTaskStore'
import type { WorkflowNodeData } from '../../../types/workflow'
import type { Node } from '@xyflow/react'

// ── Types ──

interface FlattenedRun extends TaskRun {
  taskTitle: string
  taskTemplate: string
  workflowNodes: Node<WorkflowNodeData>[]
}

type TimeGroup = 'Today' | 'Yesterday' | 'This Week' | 'Older'

interface ResultsFilter {
  taskId: string | null
  status: RunStatus | 'all'
  trigger: 'manual' | 'scheduled' | 'all'
  search: string
}

// ── Helpers ──

function flattenRuns(tasks: Task[]): FlattenedRun[] {
  const all: FlattenedRun[] = []
  for (const task of tasks) {
    for (const run of task.runs) {
      all.push({
        ...run,
        taskTitle: task.title,
        taskTemplate: task.template,
        workflowNodes: task.workflow?.nodes || [],
      })
    }
  }
  all.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  return all
}

function groupByTimePeriod(runs: FlattenedRun[]): Map<TimeGroup, FlattenedRun[]> {
  const groups = new Map<TimeGroup, FlattenedRun[]>([
    ['Today', []], ['Yesterday', []], ['This Week', []], ['Older', []],
  ])
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000
  const weekStart = todayStart - 6 * 86_400_000

  for (const run of runs) {
    const t = new Date(run.startedAt).getTime()
    if (t >= todayStart) groups.get('Today')!.push(run)
    else if (t >= yesterdayStart) groups.get('Yesterday')!.push(run)
    else if (t >= weekStart) groups.get('This Week')!.push(run)
    else groups.get('Older')!.push(run)
  }
  return groups
}

function computeStats(runs: FlattenedRun[]) {
  const total = runs.length
  const successes = runs.filter((r) => r.status === 'success').length
  const successRate = total > 0 ? (successes / total) * 100 : 0
  const completedRuns = runs.filter((r) => r.duration !== null)
  const avgDuration = completedRuns.length > 0
    ? completedRuns.reduce((sum, r) => sum + (r.duration || 0), 0) / completedRuns.length
    : 0

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const runsToday = runs.filter((r) => new Date(r.startedAt).getTime() >= todayStart.getTime()).length

  return { total, successRate, avgDuration, runsToday }
}

const statusBadgeStyles: Record<RunStatus, { bg: string; text: string }> = {
  success: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  partial: { bg: 'bg-orange-500/10', text: 'text-orange-400' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-400' },
}

// ── Filter Bar ──

function ResultFilterBar({ filter, onChange, taskOptions }: {
  filter: ResultsFilter
  onChange: (f: ResultsFilter) => void
  taskOptions: { id: string; title: string }[]
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="relative flex-1">
        <Icon icon="lucide:search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs" />
        <input
          type="text"
          placeholder="Search results..."
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          className="w-full pl-8 pr-3 py-1.5 bg-zinc-800/80 border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500 transition-colors"
        />
      </div>
      <select
        value={filter.taskId || ''}
        onChange={(e) => onChange({ ...filter, taskId: e.target.value || null })}
        className="bg-zinc-800/80 border border-pilos-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-blue-500 cursor-pointer"
      >
        <option value="">All Tasks</option>
        {taskOptions.map((t) => (
          <option key={t.id} value={t.id}>{t.title}</option>
        ))}
      </select>
      <select
        value={filter.status}
        onChange={(e) => onChange({ ...filter, status: e.target.value as RunStatus | 'all' })}
        className="bg-zinc-800/80 border border-pilos-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-blue-500 cursor-pointer"
      >
        <option value="all">All Status</option>
        <option value="success">Success</option>
        <option value="partial">Partial</option>
        <option value="failed">Failed</option>
      </select>
      <select
        value={filter.trigger}
        onChange={(e) => onChange({ ...filter, trigger: e.target.value as 'manual' | 'scheduled' | 'all' })}
        className="bg-zinc-800/80 border border-pilos-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-blue-500 cursor-pointer"
      >
        <option value="all">All Triggers</option>
        <option value="manual">Manual</option>
        <option value="scheduled">Scheduled</option>
      </select>
    </div>
  )
}

// ── Feed Card ──

function ResultFeedCard({ run }: { run: FlattenedRun }) {
  const [expanded, setExpanded] = useState(false)

  const stepResults = run.stepResults || []
  const completedCount = stepResults.filter((r) => r.status === 'completed').length
  const nodeMap = new Map(run.workflowNodes.map((n) => [n.id, n.data]))
  const nodeLabels = new Map(run.workflowNodes.map((n) => [n.id, n.data.label]))
  const badge = statusBadgeStyles[run.status]

  // Find results_display output for this run
  const structuredResult = useMemo(() => {
    for (const r of [...stepResults].reverse()) {
      const nodeData = nodeMap.get(r.nodeId)
      if (nodeData?.type === 'results_display' && r.status === 'completed' && r.output != null) {
        return { output: r.output, title: nodeData.displayTitle || nodeData.label }
      }
    }
    return null
  }, [stepResults, nodeMap])

  return (
    <div className="border border-pilos-border rounded-xl overflow-hidden hover:border-zinc-600/50 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors text-left"
      >
        <StatusDot color={runStatusColors[run.status] || 'gray'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-white truncate">{run.taskTitle}</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
              {run.status}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 truncate select-text">{run.summary}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-zinc-500 font-mono">{formatDuration(run.duration)}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            run.trigger === 'scheduled' ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-500'
          }`}>
            {run.trigger}
          </span>
          <span className="text-[10px] text-zinc-600">{timeAgo(run.startedAt)}</span>
          {stepResults.length > 0 && (
            <span className="text-[10px] text-zinc-600">
              {completedCount}/{stepResults.length}
            </span>
          )}
          <Icon
            icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
            className="text-zinc-600 text-xs"
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-pilos-border bg-zinc-900/30 px-4 py-3 space-y-4">
          {/* Structured Result */}
          {structuredResult && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Icon icon="lucide:layout-dashboard" className="text-cyan-400 text-[10px]" />
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{structuredResult.title}</span>
              </div>
              <div className="rounded-lg border border-pilos-border/50 bg-zinc-900/40 p-3 max-h-[300px] overflow-y-auto custom-scrollbar select-text">
                <SmartDataRenderer data={structuredResult.output} />
              </div>
            </div>
          )}

          {/* Full Summary */}
          {run.summary && (
            <div>
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block mb-1.5">Summary</span>
              <p className="text-xs text-zinc-400 leading-relaxed select-text">{run.summary}</p>
            </div>
          )}

          {/* Step Results */}
          {stepResults.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Steps</span>
                <span className="text-[9px] text-emerald-500">{completedCount} passed</span>
                {stepResults.filter((r) => r.status === 'failed').length > 0 && (
                  <span className="text-[9px] text-red-400">
                    {stepResults.filter((r) => r.status === 'failed').length} failed
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {stepResults.map((result, i) => (
                  <StepResultCard
                    key={`${result.nodeId}-${i}`}
                    result={result}
                    label={nodeLabels.get(result.nodeId) || result.nodeId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {run.actions.length > 0 && (
            <div>
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block mb-2">
                Actions ({run.actions.length})
              </span>
              <div className="space-y-1.5">
                {run.actions.map((action, i) => {
                  const iconCfg = actionIcons[action.type] || actionIcons.error
                  return (
                    <div key={i} className="flex items-start gap-2 p-2 bg-pilos-card border border-pilos-border rounded-lg">
                      <Icon icon={iconCfg.icon} className={`${iconCfg.color} text-xs mt-0.5 flex-shrink-0`} />
                      <div className="min-w-0 select-text">
                        <span className="text-[11px] text-zinc-300">{action.description}</span>
                        {action.metadata && Object.keys(action.metadata).length > 0 && (
                          <div className="mt-0.5 text-[10px] text-zinc-600 font-mono truncate">
                            {Object.entries(action.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Logs */}
          {run.logs && run.logs.length > 0 && (
            <details className="pt-1 border-t border-pilos-border">
              <summary className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest cursor-pointer hover:text-zinc-400">
                Logs ({run.logs.length})
              </summary>
              <pre className="mt-1.5 text-[10px] text-zinc-500 leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto custom-scrollbar select-text">
                {run.logs.join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

// ── Timeline Group ──

function ResultTimelineGroup({ label, runs }: { label: string; runs: FlattenedRun[] }) {
  if (runs.length === 0) return null
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{label}</span>
        <span className="text-[10px] text-zinc-700">({runs.length})</span>
        <div className="flex-1 h-px bg-pilos-border" />
      </div>
      <div className="space-y-2">
        {runs.map((run) => (
          <ResultFeedCard key={run.id} run={run} />
        ))}
      </div>
    </div>
  )
}

// ── Main Page ──

export default function ResultsPage() {
  const tasks = useTaskStore((s) => s.tasks)
  const markResultsViewed = useAppStore((s) => s.markResultsViewed)

  // Mark results as viewed when page mounts (resets badge counter)
  useEffect(() => {
    markResultsViewed()
  }, [markResultsViewed])

  const [filter, setFilter] = useState<ResultsFilter>({
    taskId: null,
    status: 'all',
    trigger: 'all',
    search: '',
  })

  const allRuns = useMemo(() => flattenRuns(tasks), [tasks])

  const filteredRuns = useMemo(() => {
    return allRuns.filter((r) => {
      if (filter.taskId && r.taskId !== filter.taskId) return false
      if (filter.status !== 'all' && r.status !== filter.status) return false
      if (filter.trigger !== 'all' && r.trigger !== filter.trigger) return false
      if (filter.search) {
        const q = filter.search.toLowerCase()
        if (!r.taskTitle.toLowerCase().includes(q) && !r.summary.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allRuns, filter])

  const stats = useMemo(() => computeStats(allRuns), [allRuns])
  const grouped = useMemo(() => groupByTimePeriod(filteredRuns), [filteredRuns])

  const taskOptions = useMemo(() =>
    tasks.map((t) => ({ id: t.id, title: t.title })), [tasks]
  )

  // Find the latest structured result (from a results_display node)
  const latestStructuredResult = useMemo(() => {
    for (const run of allRuns) {
      const stepResults = run.stepResults || []
      if (!stepResults.length) continue
      const nodeMap = new Map(run.workflowNodes.map((n) => [n.id, n.data]))
      // Look for results_display node output
      for (const r of [...stepResults].reverse()) {
        const nodeData = nodeMap.get(r.nodeId)
        if (nodeData?.type === 'results_display' && r.status === 'completed' && r.output != null) {
          return {
            output: r.output,
            title: nodeData.displayTitle || nodeData.label,
            taskTitle: run.taskTitle,
            runId: run.id,
            startedAt: run.startedAt,
          }
        }
      }
    }
    return null
  }, [allRuns])

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-bold text-white mb-1">Results</h1>
          <p className="text-xs text-zinc-500">Task execution history across all routines</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Runs" value={stats.total} icon="lucide:play-circle" />
          <StatCard label="Success Rate" value={`${stats.successRate.toFixed(1)}%`} icon="lucide:check-circle-2" />
          <StatCard label="Avg Duration" value={formatDuration(stats.avgDuration)} icon="lucide:timer" />
          <StatCard label="Runs Today" value={stats.runsToday} icon="lucide:calendar" />
        </div>

        {/* Latest Structured Result */}
        {latestStructuredResult && (
          <div className="mb-6 rounded-xl border border-pilos-border overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-zinc-800/40 border-b border-pilos-border">
              <Icon icon="lucide:layout-dashboard" className="text-cyan-400 text-sm" />
              <span className="text-xs font-bold text-white">{latestStructuredResult.title}</span>
              <span className="text-[10px] text-zinc-600 ml-auto">{latestStructuredResult.taskTitle} · {timeAgo(latestStructuredResult.startedAt)}</span>
            </div>
            <div className="px-5 py-4 max-h-[400px] overflow-y-auto custom-scrollbar">
              <SmartDataRenderer data={latestStructuredResult.output} />
            </div>
          </div>
        )}

        {/* Filters */}
        <ResultFilterBar filter={filter} onChange={setFilter} taskOptions={taskOptions} />

        {/* Timeline */}
        {filteredRuns.length > 0 ? (
          <>
            {(['Today', 'Yesterday', 'This Week', 'Older'] as TimeGroup[]).map((group) => (
              <ResultTimelineGroup key={group} label={group} runs={grouped.get(group) || []} />
            ))}
          </>
        ) : allRuns.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon icon="lucide:filter-x" className="text-zinc-800 text-3xl mb-3" />
            <h3 className="text-sm font-medium text-zinc-500 mb-1">No matching results</h3>
            <p className="text-xs text-zinc-600">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon icon="lucide:file-check-2" className="text-zinc-800 text-3xl mb-3" />
            <h3 className="text-sm font-medium text-zinc-500 mb-1">No results yet</h3>
            <p className="text-xs text-zinc-600">Run tasks from the Tasks page to see results here</p>
          </div>
        )}
      </div>
    </div>
  )
}
