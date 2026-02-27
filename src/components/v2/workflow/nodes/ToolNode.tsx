import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type ToolNodeProps = NodeProps<Node<WorkflowNodeData>>

const statusBorder: Record<string, string> = {
  pending: 'border-pilos-border',
  running: 'border-orange-500 workflow-node-running',
  completed: 'border-emerald-500 workflow-node-completed',
  failed: 'border-red-500 workflow-node-failed',
  skipped: 'border-zinc-600',
}

const statusIcon: Record<string, { icon: string; color: string } | null> = {
  running: { icon: 'lucide:loader-2', color: 'text-orange-400 animate-spin' },
  completed: { icon: 'lucide:check', color: 'text-emerald-400' },
  failed: { icon: 'lucide:x', color: 'text-red-400' },
  skipped: { icon: 'lucide:skip-forward', color: 'text-zinc-500' },
}

export function ToolNode({ data, selected }: ToolNodeProps) {
  const execStatus = data.executionStatus || 'pending'
  const border = selected ? 'border-blue-500 shadow-lg shadow-blue-500/10' : statusBorder[execStatus] || statusBorder.pending
  const si = statusIcon[execStatus]

  return (
    <div className={`w-[180px] bg-pilos-card border-2 rounded-lg transition-all ${border}`}>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-pilos-bg" />

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-pilos-bg flex items-center justify-center flex-shrink-0">
            <Icon icon={data.toolIcon || 'lucide:zap'} className="text-blue-400 text-xs" />
          </div>
          <span className="text-xs font-medium text-white truncate flex-1">{data.label}</span>
          {si && <Icon icon={si.icon} className={`text-xs flex-shrink-0 ${si.color}`} />}
        </div>
        {data.description && (
          <p className="text-[10px] text-zinc-500 truncate pl-8">{data.description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1.5 pl-8">
          <span className="text-[9px] font-mono text-zinc-700 uppercase">{data.toolId || 'custom'}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-pilos-bg" />
    </div>
  )
}
