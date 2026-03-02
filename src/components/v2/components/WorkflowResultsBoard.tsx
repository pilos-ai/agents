import { Icon } from '../../common/Icon'
import type { WorkflowStepResult, WorkflowNodeData } from '../../../types/workflow'
import type { Node } from '@xyflow/react'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}m`
}

function formatOutput(output: unknown): string {
  if (output === undefined || output === null) return ''
  if (typeof output === 'string') return output.slice(0, 120)
  try {
    const str = JSON.stringify(output)
    return str.slice(0, 120) + (str.length > 120 ? '...' : '')
  } catch {
    return String(output).slice(0, 120)
  }
}

interface ResultCardProps {
  result: WorkflowStepResult
  label: string
  nodeType?: string
}

function ResultCard({ result, label, nodeType }: ResultCardProps) {
  const isCompleted = result.status === 'completed'
  const isFailed = result.status === 'failed'
  const preview = isFailed ? result.error || 'Unknown error' : formatOutput(result.output)

  return (
    <div className={`p-3 rounded-lg border transition-colors ${
      isCompleted ? 'bg-emerald-500/5 border-emerald-500/20'
      : isFailed ? 'bg-red-500/5 border-red-500/20'
      : 'bg-zinc-800/50 border-pilos-border'
    }`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon
          icon={isCompleted ? 'lucide:check-circle-2' : isFailed ? 'lucide:x-circle' : 'lucide:circle'}
          className={`text-xs flex-shrink-0 ${
            isCompleted ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-zinc-600'
          }`}
        />
        <span className="text-xs font-medium text-white truncate">{label}</span>
      </div>

      {nodeType && (
        <span className="text-[9px] text-zinc-600 uppercase tracking-wider ml-5">{nodeType}</span>
      )}

      {preview && (
        <p className={`text-[10px] mt-1.5 ml-5 leading-relaxed line-clamp-3 ${
          isFailed ? 'text-red-400/70' : 'text-zinc-500'
        }`}>
          {preview}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-2 ml-5">
        <Icon icon="lucide:timer" className="text-[9px] text-zinc-700" />
        <span className="text-[10px] text-zinc-600 font-mono">{formatDuration(result.duration)}</span>
      </div>
    </div>
  )
}

interface Props {
  stepResults: WorkflowStepResult[]
  nodes: Node<WorkflowNodeData>[]
  onAiFix?: () => void
  isFixing?: boolean
}

export function WorkflowResultsBoard({ stepResults, nodes, onAiFix, isFixing }: Props) {
  // Build node label lookup
  const nodeLabels = new Map(nodes.map((n) => [n.id, n.data.label]))
  const nodeTypes = new Map(nodes.map((n) => [n.id, n.data.type]))

  // Deduplicate by nodeId (loops may re-execute same nodes), keep last result
  const dedupedResults = new Map<string, WorkflowStepResult>()
  for (const r of stepResults) {
    dedupedResults.set(r.nodeId, r)
  }

  const completed = [...dedupedResults.values()].filter((r) => r.status === 'completed')
  const failed = [...dedupedResults.values()].filter((r) => r.status === 'failed')

  // Find pending nodes (executable, not in results)
  const executedIds = new Set(dedupedResults.keys())
  const pending = nodes.filter((n) =>
    !executedIds.has(n.id) &&
    n.data.type !== 'start' && n.data.type !== 'end' && n.data.type !== 'note'
  )

  if (completed.length === 0 && failed.length === 0 && pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Icon icon="lucide:layout-grid" className="text-zinc-800 text-2xl mb-2" />
        <p className="text-xs text-zinc-600">No execution results yet</p>
        <p className="text-[10px] text-zinc-700 mt-0.5">Run the workflow to see results here</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Completed column */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Completed ({completed.length})
          </span>
        </div>
        <div className="space-y-2">
          {completed.map((r) => (
            <ResultCard
              key={r.nodeId}
              result={r}
              label={nodeLabels.get(r.nodeId) || r.nodeId}
              nodeType={nodeTypes.get(r.nodeId)}
            />
          ))}
        </div>
      </div>

      {/* Failed column */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Failed ({failed.length})
          </span>
          {failed.length > 0 && onAiFix && (
            <button
              onClick={onAiFix}
              disabled={isFixing}
              className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 text-[10px] font-bold rounded hover:bg-violet-600/30 transition-colors disabled:opacity-50"
            >
              <Icon icon={isFixing ? 'lucide:loader-2' : 'lucide:sparkles'} className={`text-[9px] ${isFixing ? 'animate-spin' : ''}`} />
              {isFixing ? 'Fixing...' : 'AI Fix'}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {failed.map((r) => (
            <ResultCard
              key={r.nodeId}
              result={r}
              label={nodeLabels.get(r.nodeId) || r.nodeId}
              nodeType={nodeTypes.get(r.nodeId)}
            />
          ))}
          {failed.length === 0 && (
            <p className="text-[10px] text-zinc-700 italic">None</p>
          )}
        </div>
      </div>

      {/* Pending column */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-2 h-2 rounded-full bg-zinc-600" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Pending ({pending.length})
          </span>
        </div>
        <div className="space-y-2">
          {pending.map((n) => (
            <div
              key={n.id}
              className="p-3 rounded-lg border bg-zinc-800/30 border-pilos-border"
            >
              <div className="flex items-center gap-2">
                <Icon icon="lucide:circle" className="text-xs text-zinc-700 flex-shrink-0" />
                <span className="text-xs text-zinc-500 truncate">{n.data.label}</span>
              </div>
              <span className="text-[9px] text-zinc-700 uppercase tracking-wider ml-5">{n.data.type}</span>
            </div>
          ))}
          {pending.length === 0 && (
            <p className="text-[10px] text-zinc-700 italic">None</p>
          )}
        </div>
      </div>
    </div>
  )
}
