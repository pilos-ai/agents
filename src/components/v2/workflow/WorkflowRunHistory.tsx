import { useState } from 'react'
import { Icon } from '../../common/Icon'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { useTaskStore } from '../../../store/useTaskStore'
import type { TaskRun } from '../../../store/useTaskStore'

function formatDuration(ms: number | null): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function RunRow({ run, isExpanded, onToggle, nodes }: { run: TaskRun; isExpanded: boolean; onToggle: () => void; nodes: { id: string; data: { label: string } }[] }) {
  const statusIcon = run.status === 'success' ? 'lucide:check-circle-2'
    : run.status === 'failed' ? 'lucide:x-circle'
    : 'lucide:alert-circle'
  const statusColor = run.status === 'success' ? 'text-emerald-400'
    : run.status === 'failed' ? 'text-red-400'
    : 'text-orange-400'

  const stepCount = run.stepResults?.length || 0
  const successCount = run.stepResults?.filter((r) => r.status === 'completed').length || 0

  return (
    <div className="border-b border-pilos-border last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors text-left"
      >
        <Icon icon={statusIcon} className={`text-sm ${statusColor} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white font-medium truncate">{run.summary}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-zinc-600">{formatTime(run.startedAt)}</span>
            <span className="text-[10px] text-zinc-600">{formatDuration(run.duration)}</span>
            {stepCount > 0 && (
              <span className="text-[10px] text-zinc-600">{successCount}/{stepCount} steps</span>
            )}
          </div>
        </div>
        <Icon icon={isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-xs text-zinc-600 flex-shrink-0" />
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-1.5">
          {run.stepResults && run.stepResults.length > 0 ? (
            run.stepResults.map((r, i) => {
              const dur = r.duration < 1000 ? `${r.duration}ms` : `${(r.duration / 1000).toFixed(1)}s`
              const sColor = r.status === 'completed' ? 'text-emerald-400'
                : r.status === 'failed' ? 'text-red-400' : 'text-zinc-500'
              return (
                <div key={i} className="flex items-center gap-2 pl-2">
                  <Icon
                    icon={r.status === 'completed' ? 'lucide:check' : r.status === 'failed' ? 'lucide:x' : 'lucide:skip-forward'}
                    className={`text-[10px] ${sColor} flex-shrink-0`}
                  />
                  <span className="text-[10px] text-zinc-400 truncate flex-1">{getNodeLabel(r.nodeId, nodes)}</span>
                  <span className="text-[10px] text-zinc-600 font-mono flex-shrink-0">{dur}</span>
                  <span className={`text-[10px] font-bold uppercase ${sColor} flex-shrink-0`}>{r.status}</span>
                </div>
              )
            })
          ) : (
            <p className="text-[10px] text-zinc-700 pl-2">No step details available</p>
          )}
          {run.stepResults?.some((r) => r.status === 'failed' && r.error) && (
            <div className="mt-2 pl-2 space-y-1">
              {run.stepResults.filter((r) => r.status === 'failed' && r.error).map((r, i) => (
                <div key={i} className="text-[10px] text-red-400/70 bg-red-500/5 px-2 py-1 rounded">
                  <span className="font-bold">{getNodeLabel(r.nodeId, nodes)}:</span> {r.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getNodeLabel(nodeId: string, nodes: { id: string; data: { label: string } }[]): string {
  return nodes.find((n) => n.id === nodeId)?.data.label || nodeId
}

export function WorkflowRunHistory({ onClose }: { onClose: () => void }) {
  const editingTaskId = useWorkflowStore((s) => s.editingTaskId)
  const nodes = useWorkflowStore((s) => s.nodes)
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === editingTaskId))
  const runs = task?.runs || []
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="w-80 border-l border-pilos-border flex flex-col bg-pilos-bg flex-shrink-0">
      <div className="px-4 py-3 border-b border-pilos-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Run History</p>
            <p className="text-xs text-zinc-400 mt-0.5">{runs.length} run{runs.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <Icon icon="lucide:x" className="text-sm" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Icon icon="lucide:history" className="text-zinc-800 text-2xl mb-2" />
            <p className="text-xs text-zinc-600">No runs yet</p>
            <p className="text-[10px] text-zinc-700 mt-1">Run the workflow to see history here</p>
          </div>
        ) : (
          runs.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              isExpanded={expandedId === run.id}
              onToggle={() => setExpandedId(expandedId === run.id ? null : run.id)}
              nodes={nodes}
            />
          ))
        )}
      </div>
    </div>
  )
}
