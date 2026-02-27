import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type EndNodeProps = NodeProps<Node<WorkflowNodeData>>

export function EndNode({ data, selected }: EndNodeProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-zinc-500 !border-2 !border-pilos-bg" />
      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all ${
          selected ? 'border-blue-400 shadow-lg shadow-blue-500/20' : 'border-zinc-600'
        } ${data.executionStatus === 'completed' ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-zinc-800/50'}`}
      >
        <Icon icon="lucide:square" className="text-zinc-400 text-sm" />
      </div>
      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{data.label}</span>
    </div>
  )
}
