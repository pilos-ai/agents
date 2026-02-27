import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type StartNodeProps = NodeProps<Node<WorkflowNodeData>>

export function StartNode({ data, selected }: StartNodeProps) {
  return (
    <div className={`flex flex-col items-center gap-1 ${data.executionStatus === 'completed' ? 'workflow-node-completed' : ''}`}>
      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all ${
          selected ? 'border-blue-400 shadow-lg shadow-blue-500/20' : 'border-emerald-500/50'
        } ${data.executionStatus === 'completed' ? 'bg-emerald-500/20' : 'bg-emerald-500/10'}`}
      >
        <Icon icon="lucide:play" className="text-emerald-400 text-lg ml-0.5" />
      </div>
      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-pilos-bg" />
    </div>
  )
}
