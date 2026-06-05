import { useEffect, useState } from 'react'
import { Icon } from '../../common/Icon'
import { StatusDot } from './StatusDot'
import { useAppStore } from '../../../store/useAppStore'
import { useTaskStore, type Task, type ActiveExecution } from '../../../store/useTaskStore'
import { useWorkflowStore } from '../../../store/useWorkflowStore'

function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
}

interface Props {
  task: Task
  execution: ActiveExecution | undefined
}

export function ActiveTaskCard({ task, execution }: Props) {
  const setActiveView = useAppStore((s) => s.setActiveView)
  const selectTask = useTaskStore((s) => s.selectTask)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (execution?.status !== 'running') return
    const iv = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(iv)
  }, [execution?.status])

  const isRunning = execution?.status === 'running'
  const isCompleted = execution?.status === 'completed'
  const isFailed = execution?.status === 'failed'
  const totalSteps = execution?.totalSteps || 0
  const currentStep = execution?.currentStep || 0
  const progress = totalSteps > 0 ? Math.min(100, Math.round((currentStep / totalSteps) * 100)) : 0
  const logs = execution?.logs || []
  const lastLogs = logs.slice(-3)

  const handleClick = () => {
    selectTask(task.id)
    setActiveView('workflows')
  }

  const handleViewResults = (e: React.MouseEvent) => {
    e.stopPropagation()
    const store = useWorkflowStore.getState()
    store.setEditingTaskId(task.id)
    store.setResultsCanvasOpen(true)
    setActiveView('workflows')
  }

  const statusTag = isRunning ? 'tag warn' : isCompleted ? 'tag ok' : isFailed ? 'tag err' : 'tag'

  return (
    <button
      type="button"
      onClick={handleClick}
      className="tile hover"
      style={{ width: '100%', display: 'block', cursor: 'pointer' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <StatusDot
            color={isRunning ? 'orange' : isCompleted ? 'green' : 'gray'}
            pulse={isRunning}
          />
          <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
        </div>
        <span className={statusTag}>
          {isRunning ? 'Running' : isCompleted ? 'Completed' : isFailed ? 'Failed' : task.status}
        </span>
      </div>

      {execution && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              Step {currentStep} of {totalSteps}
              {execution.currentNodeLabel && (
                <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>: {execution.currentNodeLabel}</span>
              )}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{progress}%</span>
          </div>

          <div className="meter" style={{ marginBottom: 12 }}>
            <div
              className="fill"
              style={{
                width: `${progress}%`,
                background: isCompleted ? 'var(--ok)' : isFailed ? 'var(--err)' : undefined,
              }}
            />
          </div>

          {lastLogs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
              {lastLogs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--mono)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    lineHeight: 1.55,
                    color: log.includes('[WARN]') ? 'var(--warn)'
                      : log.includes('[ERROR]') ? 'var(--err)'
                      : log.includes('[DEBUG]') ? 'var(--info)'
                      : 'var(--muted)',
                    opacity: 0.8,
                  }}
                >
                  {log}
                </div>
              ))}
            </div>
          )}

          {isRunning && execution.startedAt && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, color: 'var(--muted)' }}>
              <Icon icon="lucide:timer" style={{ fontSize: 10 }} />
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>{formatElapsed(execution.startedAt)}</span>
            </div>
          )}
          {(isCompleted || isFailed) && (
            <div
              role="button"
              tabIndex={0}
              onClick={handleViewResults}
              onKeyDown={(e) => { if (e.key === 'Enter') handleViewResults(e as unknown as React.MouseEvent) }}
              className="btn sm primary"
              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
            >
              <Icon icon="lucide:layout-dashboard" style={{ fontSize: 11 }} />
              View Results
            </div>
          )}
        </>
      )}
    </button>
  )
}
