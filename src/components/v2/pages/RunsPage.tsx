/**
 * Runs page — pixel-faithful port of pilos-handoff/app/screen_runs.jsx.
 *
 * Layout: header with stat cards + filter segmented control, then an `.rtable`
 * of past workflow runs (status dot, agents involved, duration, timestamp).
 * Wired to the real per-task execution history flattened from `useTaskStore`.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../../store/useAppStore'
import { useTaskStore, type Task, type TaskRun, type RunStatus } from '../../../store/useTaskStore'
import {
  IconRuns,
  IconSpark,
  IconCheckSm,
  IconClock,
  IconWorkflow,
} from '../PilosIcons'

interface FlattenedRun extends TaskRun {
  taskTitle: string
}

type StatusKey = RunStatus | 'running'
type FilterTab = 'All' | 'Success' | 'Partial' | 'Failed'

const STATUS_MAP: Record<StatusKey, { cls: string; dot: string; label: string }> = {
  success: { cls: 'ok', dot: 'dot-ok', label: 'Success' },
  partial: { cls: 'warn', dot: 'dot-warn', label: 'Partial' },
  failed: { cls: 'err', dot: 'dot-err', label: 'Failed' },
  running: { cls: 'accent', dot: 'dot-run', label: 'Running' },
}

function flatten(tasks: Task[]): FlattenedRun[] {
  const out: FlattenedRun[] = []
  for (const task of tasks) {
    for (const run of task.runs) {
      out.push({ ...run, taskTitle: task.title })
    }
  }
  out.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  return out
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

function whenStr(startedAt: string): string {
  const d = new Date(startedAt)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yest = new Date(now.getTime() - 86_400_000)
  const isYesterday = d.toDateString() === yest.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today · ${time}`
  if (isYesterday) return `Yesterday · ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + time
}

export default function RunsPage() {
  const tasks = useTaskStore((s) => s.tasks)
  const markResultsViewed = useAppStore((s) => s.markResultsViewed)

  useEffect(() => {
    markResultsViewed()
  }, [markResultsViewed])

  const allRuns = useMemo(() => flatten(tasks), [tasks])
  const [tab, setTab] = useState<FilterTab>('All')

  const visible = useMemo(() => {
    return allRuns.filter((r) => {
      if (tab === 'All') return true
      if (tab === 'Success') return r.status === 'success'
      if (tab === 'Partial') return r.status === 'partial'
      if (tab === 'Failed') return r.status === 'failed'
      return true
    })
  }, [allRuns, tab])

  // Summary stats
  const summary = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const runsToday = allRuns.filter((r) => new Date(r.startedAt).getTime() >= todayStart.getTime()).length
    const successes = allRuns.filter((r) => r.status === 'success').length
    const successRate = allRuns.length > 0 ? Math.round((successes / allRuns.length) * 100) : 0
    const completed = allRuns.filter((r) => r.duration !== null)
    const avgMs = completed.length > 0
      ? completed.reduce((sum, r) => sum + (r.duration || 0), 0) / completed.length
      : 0
    return {
      runsToday,
      successRate,
      avgDuration: fmtDuration(avgMs),
    }
  }, [allRuns])

  const headers = ['Workflow', 'Status', 'When', 'Steps', 'Duration']

  return (
    <div className="main">
      <div className="main-head">
        <div className="main-title">
          <IconRuns size={17} style={{ color: 'var(--ink-3)' }} />
          Run history
        </div>
        <div className="main-actions">
          <div className="seg">
            {(['All', 'Success', 'Partial', 'Failed'] as FilterTab[]).map((t) => (
              <button
                key={t}
                className={tab === t ? 'on' : ''}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="main-body scroll">
        <div className="pad">
          <div className="stat-grid" style={{ marginBottom: 18 }}>
            <div className="stat">
              <div className="sk">
                <IconSpark size={14} />
                Runs today
              </div>
              <div className="sv">{summary.runsToday}</div>
            </div>
            <div className="stat">
              <div className="sk">
                <IconCheckSm size={14} />
                Success rate
              </div>
              <div className="sv">{summary.successRate}<span className="unit">%</span></div>
            </div>
            <div className="stat">
              <div className="sk">
                <IconClock size={14} />
                Avg duration
              </div>
              <div className="sv">{summary.avgDuration}</div>
            </div>
          </div>

          <div className="tile" style={{ padding: '14px 4px 4px' }}>
            <table className="rtable">
              <thead>
                <tr>
                  {headers.map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={headers.length} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                      No runs yet — execute a workflow from the Workflows page to see results here.
                    </td>
                  </tr>
                ) : visible.map((r) => {
                  const stKey: StatusKey = r.status
                  const st = STATUS_MAP[stKey] || STATUS_MAP.success
                  const stepCount = r.stepResults?.length || 0
                  const completedSteps = (r.stepResults || []).filter((s) => s.status === 'completed').length
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="run-name">
                          <IconWorkflow size={15} style={{ color: 'var(--ink-3)' }} />
                          {r.taskTitle}
                        </div>
                      </td>
                      <td>
                        <span className={'tag ' + st.cls}>
                          <span className={'li-dot ' + st.dot} style={{ width: 6, height: 6 }} />
                          {st.label}
                        </span>
                      </td>
                      <td className="muted">{whenStr(r.startedAt)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                        {stepCount > 0 ? `${completedSteps}/${stepCount}` : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                        {fmtDuration(r.duration)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
