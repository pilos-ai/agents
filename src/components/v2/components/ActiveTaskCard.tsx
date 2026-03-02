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

  // Tick every second for the timer
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
    setActiveView('tasks')
  }

  const handleViewResults = (e: React.MouseEvent) => {
    e.stopPropagation()
    const store = useWorkflowStore.getState()
    store.setEditingTaskId(task.id)
    store.setResultsCanvasOpen(true)
    setActiveView('tasks')
  }

  return (
    <button
      onClick={handleClick}
      className="w-full p-4 bg-pilos-card border border-pilos-border rounded-xl hover:border-zinc-600 transition-all text-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusDot
            color={isRunning ? 'orange' : isCompleted ? 'green' : 'gray'}
            pulse={isRunning}
          />
          <span className="text-sm font-bold text-white truncate">{task.title}</span>
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
          isRunning ? 'bg-orange-500/10 text-orange-400'
          : isCompleted ? 'bg-emerald-500/10 text-emerald-400'
          : isFailed ? 'bg-red-500/10 text-red-400'
          : 'bg-zinc-700/30 text-zinc-500'
        }`}>
          {isRunning ? 'Running' : isCompleted ? 'Completed' : isFailed ? 'Failed' : task.status}
        </span>
      </div>

      {/* Step progress */}
      {execution && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-zinc-400">
              Step {currentStep} of {totalSteps}
              {execution.currentNodeLabel && (
                <span className="text-zinc-300 font-medium">: {execution.currentNodeLabel}</span>
              )}
            </span>
            <span className="text-[11px] text-zinc-500 font-mono">{progress}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Log tail */}
          {lastLogs.length > 0 && (
            <div className="space-y-0.5 mb-2">
              {lastLogs.map((log, i) => (
                <div
                  key={i}
                  className={`text-[10px] font-mono truncate leading-relaxed ${
                    log.includes('[WARN]') ? 'text-orange-400/70'
                    : log.includes('[ERROR]') ? 'text-red-400/70'
                    : log.includes('[DEBUG]') ? 'text-blue-400/60'
                    : 'text-zinc-600'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
          )}

          {/* Footer: elapsed time or View Results */}
          {isRunning && execution.startedAt && (
            <div className="flex items-center justify-end gap-1.5 text-zinc-600">
              <Icon icon="lucide:timer" className="text-[10px]" />
              <span className="text-[10px] font-mono">{formatElapsed(execution.startedAt)}</span>
            </div>
          )}
          {(isCompleted || isFailed) && (
            <div
              role="button"
              tabIndex={0}
              onClick={handleViewResults}
              onKeyDown={(e) => { if (e.key === 'Enter') handleViewResults(e as unknown as React.MouseEvent) }}
              className="flex items-center justify-center gap-1.5 mt-1 px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold rounded-lg hover:bg-cyan-600/30 transition-colors"
            >
              <Icon icon="lucide:layout-dashboard" className="text-[10px]" />
              View Results
            </div>
          )}
        </>
      )}
    </button>
  )
}
