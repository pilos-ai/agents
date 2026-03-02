import { useState } from 'react'
import { Icon } from '../../common/Icon'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import type { WorkflowStepResult } from '../../../types/workflow'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}m`
}

function formatOutput(output: unknown, format: 'compact' | 'full' = 'compact'): string {
  if (output === undefined || output === null) return '(no output)'
  if (typeof output === 'string') {
    const limit = format === 'full' ? 2000 : 150
    return output.slice(0, limit) + (output.length > limit ? '...' : '')
  }
  try {
    const str = JSON.stringify(output, null, format === 'full' ? 2 : 0)
    const limit = format === 'full' ? 5000 : 150
    return str.slice(0, limit) + (str.length > limit ? '...' : '')
  } catch {
    return String(output)
  }
}

function ResultRow({ result, label, nodeType }: { result: WorkflowStepResult; label: string; nodeType?: string }) {
  const [expanded, setExpanded] = useState(false)
  const isOk = result.status === 'completed'
  const isFailed = result.status === 'failed'

  return (
    <div className={`border rounded-lg transition-colors ${
      isOk ? 'border-emerald-500/20 bg-emerald-500/5'
      : isFailed ? 'border-red-500/20 bg-red-500/5'
      : 'border-pilos-border bg-pilos-card'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left"
      >
        <Icon
          icon={isOk ? 'lucide:check-circle-2' : isFailed ? 'lucide:x-circle' : 'lucide:circle'}
          className={`text-xs flex-shrink-0 ${isOk ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-zinc-600'}`}
        />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-white truncate block">{label}</span>
          {nodeType && <span className="text-[9px] text-zinc-600 uppercase tracking-wider">{nodeType}</span>}
        </div>
        <span className="text-[10px] text-zinc-600 font-mono flex-shrink-0">{formatDuration(result.duration)}</span>
        <Icon
          icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
          className="text-[10px] text-zinc-600 flex-shrink-0"
        />
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 border-t border-pilos-border/50">
          {isFailed && result.error && (
            <p className="text-[10px] text-red-400 mt-2 leading-relaxed">{result.error}</p>
          )}
          {isOk && result.output != null && (
            <pre className="text-[10px] text-zinc-400 mt-2 leading-relaxed whitespace-pre-wrap break-all font-mono bg-zinc-900/50 rounded p-2 max-h-[200px] overflow-y-auto custom-scrollbar">
              {formatOutput(result.output, 'full')}
            </pre>
          )}
          {isOk && result.output == null && (
            <p className="text-[10px] text-zinc-600 mt-2 italic">No output data</p>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  onClose: () => void
}

export function WorkflowResultsPanel({ onClose }: Props) {
  const execution = useWorkflowStore((s) => s.execution)
  const nodes = useWorkflowStore((s) => s.nodes)

  const nodeLabels = new Map(nodes.map((n) => [n.id, n.data.label]))
  const nodeTypes = new Map(nodes.map((n) => [n.id, n.data.type]))

  // Deduplicate by nodeId (loops may re-execute same nodes), keep last result
  const dedupedResults = new Map<string, WorkflowStepResult>()
  if (execution?.stepResults) {
    for (const r of execution.stepResults) {
      dedupedResults.set(r.nodeId, r)
    }
  }

  const results = [...dedupedResults.values()]
  const completed = results.filter((r) => r.status === 'completed')
  const failed = results.filter((r) => r.status === 'failed')

  const isFinished = execution?.status === 'completed' || execution?.status === 'failed'

  return (
    <div className="w-80 border-l border-pilos-border flex flex-col bg-pilos-bg flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pilos-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:layout-dashboard" className="text-cyan-400 text-sm" />
          <h3 className="text-xs font-bold text-white">Results</h3>
          {results.length > 0 && (
            <span className="text-[10px] text-zinc-600">
              {completed.length} passed{failed.length > 0 ? `, ${failed.length} failed` : ''}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-zinc-500 hover:text-white transition-colors"
        >
          <Icon icon="lucide:x" className="text-xs" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Icon icon="lucide:layout-dashboard" className="text-zinc-800 text-2xl mb-2" />
            <p className="text-xs text-zinc-500 font-medium mb-1">No results yet</p>
            <p className="text-[10px] text-zinc-700">Run the workflow to see results here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Failed first */}
            {failed.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Failed ({failed.length})</span>
                </div>
                <div className="space-y-1.5">
                  {failed.map((r) => (
                    <ResultRow key={r.nodeId} result={r} label={nodeLabels.get(r.nodeId) || r.nodeId} nodeType={nodeTypes.get(r.nodeId)} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Completed ({completed.length})</span>
              </div>
              <div className="space-y-1.5">
                {completed.map((r) => (
                  <ResultRow key={r.nodeId} result={r} label={nodeLabels.get(r.nodeId) || r.nodeId} nodeType={nodeTypes.get(r.nodeId)} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {isFinished && results.length > 0 && (
        <div className="px-4 py-2.5 border-t border-pilos-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-600">
              {execution?.status === 'completed' ? 'Workflow completed' : 'Workflow failed'}
            </span>
            <span className={`text-[10px] font-bold ${execution?.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
              {Math.round((completed.length / Math.max(results.length, 1)) * 100)}% success
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
