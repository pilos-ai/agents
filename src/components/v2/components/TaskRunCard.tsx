import { useState } from 'react'
import { Icon } from '../../common/Icon'
import { StatusDot } from './StatusDot'
import { SmartDataRenderer } from './SmartDataRenderer'
import type { TaskRun, RunAction } from '../../../store/useTaskStore'
import type { WorkflowStepResult } from '../../../types/workflow'

export const runStatusColors: Record<string, 'green' | 'orange' | 'gray'> = {
  success: 'green',
  partial: 'orange',
  failed: 'gray',
}

export const actionIcons: Record<RunAction['type'], { icon: string; color: string }> = {
  ticket_created: { icon: 'lucide:plus-circle', color: 'text-green-400' },
  ticket_assigned: { icon: 'lucide:user-check', color: 'text-blue-400' },
  comment_analyzed: { icon: 'lucide:message-circle', color: 'text-zinc-400' },
  notification_sent: { icon: 'lucide:bell', color: 'text-blue-400' },
  error: { icon: 'lucide:alert-circle', color: 'text-red-400' },
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '--'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}m`
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function formatOutput(output: unknown): string {
  if (output === undefined || output === null) return ''
  if (typeof output === 'string') return output
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

export function StepResultCard({ result, label }: { result: WorkflowStepResult; label: string }) {
  const [showOutput, setShowOutput] = useState(false)
  const isCompleted = result.status === 'completed'
  const isFailed = result.status === 'failed'
  const hasOutput = isFailed ? !!result.error : result.output != null

  return (
    <div className={`rounded-lg border ${
      isCompleted ? 'border-emerald-500/20' : isFailed ? 'border-red-500/20' : 'border-pilos-border'
    }`}>
      <button
        onClick={() => hasOutput && setShowOutput(!showOutput)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 text-left ${hasOutput ? 'cursor-pointer hover:bg-zinc-800/50' : 'cursor-default'}`}
      >
        <Icon
          icon={isCompleted ? 'lucide:check-circle-2' : isFailed ? 'lucide:x-circle' : 'lucide:circle'}
          className={`text-[10px] flex-shrink-0 ${
            isCompleted ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-zinc-600'
          }`}
        />
        <span className="text-[11px] text-zinc-300 truncate flex-1">{label}</span>
        <span className="text-[9px] text-zinc-600 font-mono flex-shrink-0">{formatDuration(result.duration)}</span>
        {hasOutput && (
          <Icon
            icon={showOutput ? 'lucide:chevron-up' : 'lucide:chevron-down'}
            className="text-zinc-600 text-[10px] flex-shrink-0"
          />
        )}
      </button>

      {showOutput && hasOutput && (
        <div className="border-t border-pilos-border px-2.5 py-2 max-h-64 overflow-y-auto custom-scrollbar">
          {isFailed ? (
            <pre className="text-[10px] text-red-400/80 leading-relaxed whitespace-pre-wrap break-words">
              {result.error || 'Unknown error'}
            </pre>
          ) : (
            <SmartDataRenderer data={result.output} />
          )}
        </div>
      )}
    </div>
  )
}

interface TaskRunCardProps {
  run: TaskRun
  index: number
  nodeLabels?: Map<string, string>
}

export function TaskRunCard({ run, index, nodeLabels }: TaskRunCardProps) {
  const [expanded, setExpanded] = useState(index === 0)

  const stepResults = run.stepResults || []
  const completedCount = stepResults.filter((r) => r.status === 'completed').length
  const failedCount = stepResults.filter((r) => r.status === 'failed').length

  return (
    <div className="border border-pilos-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/50 transition-colors text-left"
      >
        <StatusDot color={runStatusColors[run.status] || 'gray'} />
        <span className="text-xs text-zinc-300 font-medium">Run #{index + 1}</span>
        <span className="text-[10px] text-zinc-600">{timeAgo(run.startedAt)}</span>
        <span className="text-[10px] text-zinc-600">{formatDuration(run.duration)}</span>
        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
          run.trigger === 'scheduled' ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-500'
        }`}>
          {run.trigger}
        </span>
        {stepResults.length > 0 && (
          <span className="text-[10px] text-zinc-600">
            {completedCount}/{stepResults.length} steps
          </span>
        )}
        <Icon
          icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
          className="text-zinc-600 text-xs flex-shrink-0"
        />
      </button>

      {expanded && (
        <div className="border-t border-pilos-border bg-zinc-900/50 px-3 py-2.5 space-y-2">
          {/* Summary */}
          {run.summary && (
            <p className="text-[11px] text-zinc-500">{run.summary}</p>
          )}

          {/* Step results with expandable output */}
          {stepResults.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Step Results</span>
                {completedCount > 0 && (
                  <span className="text-[9px] text-emerald-500">{completedCount} passed</span>
                )}
                {failedCount > 0 && (
                  <span className="text-[9px] text-red-400">{failedCount} failed</span>
                )}
              </div>
              {stepResults.map((result, i) => (
                <StepResultCard
                  key={`${result.nodeId}-${i}`}
                  result={result}
                  label={nodeLabels?.get(result.nodeId) || result.nodeId}
                />
              ))}
            </div>
          ) : run.actions.length > 0 ? (
            <div className="space-y-1.5">
              {run.actions.map((action, i) => {
                const { icon, color } = actionIcons[action.type] || actionIcons.error
                return (
                  <div key={i} className="flex items-start gap-2">
                    <Icon icon={icon} className={`${color} text-xs mt-0.5 flex-shrink-0`} />
                    <span className="text-xs text-zinc-400">{action.description}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-zinc-600 italic">No results recorded</p>
          )}

          {/* Logs */}
          {run.logs && run.logs.length > 0 && (
            <details className="pt-1 border-t border-pilos-border">
              <summary className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest cursor-pointer hover:text-zinc-400">
                Logs ({run.logs.length})
              </summary>
              <pre className="mt-1.5 text-[10px] text-zinc-500 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto custom-scrollbar">
                {run.logs.join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
