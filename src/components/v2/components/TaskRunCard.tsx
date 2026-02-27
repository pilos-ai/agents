import { useState } from 'react'
import { Icon } from '../../common/Icon'
import { StatusDot } from './StatusDot'
import type { TaskRun, RunAction } from '../../../store/useTaskStore'

const runStatusColors: Record<string, 'green' | 'orange' | 'gray'> = {
  success: 'green',
  partial: 'orange',
  failed: 'gray',
}

const actionIcons: Record<RunAction['type'], { icon: string; color: string }> = {
  ticket_created: { icon: 'lucide:plus-circle', color: 'text-green-400' },
  ticket_assigned: { icon: 'lucide:user-check', color: 'text-blue-400' },
  comment_analyzed: { icon: 'lucide:message-circle', color: 'text-zinc-400' },
  notification_sent: { icon: 'lucide:bell', color: 'text-blue-400' },
  error: { icon: 'lucide:alert-circle', color: 'text-red-400' },
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}m`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface TaskRunCardProps {
  run: TaskRun
  index: number
}

export function TaskRunCard({ run, index }: TaskRunCardProps) {
  const [expanded, setExpanded] = useState(index === 0)

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
        {run.actions.length > 0 && (
          <span className="text-[10px] text-zinc-600">{run.actions.length} actions</span>
        )}
        <Icon
          icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
          className="text-zinc-600 text-xs flex-shrink-0"
        />
      </button>

      {expanded && (
        <div className="border-t border-pilos-border bg-zinc-900/50 px-3 py-2.5 space-y-2">
          {run.actions.length > 0 ? (
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
            <p className="text-xs text-zinc-600 italic">No actions recorded</p>
          )}

          {run.summary && (
            <p className="text-[11px] text-zinc-500 pt-1 border-t border-pilos-border">{run.summary}</p>
          )}
        </div>
      )}
    </div>
  )
}
