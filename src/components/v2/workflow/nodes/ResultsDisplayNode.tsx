import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type ResultsDisplayNodeProps = NodeProps<Node<WorkflowNodeData>>

const statusBorder: Record<string, string> = {
  pending: 'border-pilos-border',
  running: 'border-orange-500 workflow-node-running',
  completed: 'border-cyan-500 workflow-node-completed',
  failed: 'border-red-500 workflow-node-failed',
  skipped: 'border-zinc-600',
}

function formatPreview(data: unknown): string[] {
  if (data === undefined || data === null) return ['No data']
  if (typeof data === 'string') {
    if (data.length === 0) return ['(empty)']
    return [data.slice(0, 200) + (data.length > 200 ? '...' : '')]
  }
  if (Array.isArray(data)) {
    const lines: string[] = [`${data.length} item${data.length !== 1 ? 's' : ''}`]
    for (let i = 0; i < Math.min(3, data.length); i++) {
      const item = data[i]
      if (typeof item === 'object' && item !== null) {
        const keys = Object.keys(item)
        const summary = keys.slice(0, 3).map((k) => `${k}: ${String((item as Record<string, unknown>)[k]).slice(0, 30)}`).join(', ')
        lines.push(`${i + 1}. ${summary}${keys.length > 3 ? ' ...' : ''}`)
      } else {
        lines.push(`${i + 1}. ${String(item).slice(0, 60)}`)
      }
    }
    if (data.length > 3) lines.push(`... +${data.length - 3} more`)
    return lines
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const entries = Object.entries(obj)
    return entries.slice(0, 4).map(([k, v]) => {
      const val = typeof v === 'object' ? JSON.stringify(v)?.slice(0, 40) : String(v).slice(0, 40)
      return `${k}: ${val}`
    }).concat(entries.length > 4 ? [`... +${entries.length - 4} more`] : [])
  }
  return [String(data)]
}

export function ResultsDisplayNode({ data, selected }: ResultsDisplayNodeProps) {
  const execStatus = data.executionStatus || 'pending'
  const border = selected ? 'border-blue-500 shadow-lg shadow-blue-500/10' : statusBorder[execStatus] || statusBorder.pending
  const isCompleted = execStatus === 'completed'
  const hasData = isCompleted && data.displayData != null
  const title = (data.displayTitle as string) || 'Results'

  return (
    <div className={`bg-pilos-card border-2 rounded-lg transition-all ${border} ${hasData ? 'w-[260px]' : 'w-[180px]'}`}>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-cyan-500 !border-2 !border-pilos-bg" />

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
            <Icon icon="lucide:layout-dashboard" className="text-cyan-400 text-xs" />
          </div>
          <span className="text-xs font-medium text-white truncate flex-1">{title}</span>
          {execStatus === 'running' && <Icon icon="lucide:loader-2" className="text-xs text-orange-400 animate-spin flex-shrink-0" />}
          {isCompleted && <Icon icon="lucide:check" className="text-xs text-emerald-400 flex-shrink-0" />}
          {execStatus === 'failed' && <Icon icon="lucide:x" className="text-xs text-red-400 flex-shrink-0" />}
        </div>

        {!hasData && (
          <p className="text-[10px] text-zinc-500 pl-8">
            {isCompleted ? 'No data received' : 'Displays output after run'}
          </p>
        )}

        {hasData && (
          <div className="mt-1.5 pl-0 space-y-0.5">
            {formatPreview(data.displayData).map((line, i) => (
              <p key={i} className={`text-[10px] leading-relaxed truncate ${i === 0 ? 'text-cyan-300 font-medium' : 'text-zinc-500'}`}>
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      {data.executionError && (
        <div className="px-3 py-1.5 border-t border-red-500/20 bg-red-500/5">
          <p className="text-[10px] text-red-400 truncate">{data.executionError as string}</p>
        </div>
      )}
    </div>
  )
}
