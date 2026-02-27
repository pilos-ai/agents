import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type MergeNodeProps = NodeProps<Node<WorkflowNodeData>>

export function MergeNode({ data, selected }: MergeNodeProps) {
  const execStatus = data.executionStatus || 'pending'

  return (
    <div className="flex flex-col items-center">
      {/* Multiple target handles for merging branches */}
      <Handle
        type="target"
        position={Position.Top}
        id="input_1"
        className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-pilos-bg"
        style={{ left: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="input_2"
        className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-pilos-bg"
        style={{ left: '70%' }}
      />

      <div
        className={`w-[140px] bg-pilos-card border-2 rounded-lg transition-all ${
          selected
            ? 'border-blue-500 shadow-lg shadow-blue-500/10'
            : execStatus === 'completed'
              ? 'border-emerald-500'
              : execStatus === 'running'
                ? 'border-orange-500'
                : 'border-indigo-500/50'
        }`}
      >
        <div className="px-3 py-2.5 flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
            <Icon icon="lucide:git-merge" className="text-indigo-400 text-xs" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-white truncate block">{data.label}</span>
            <span className="text-[9px] text-zinc-600">Join branches</span>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-pilos-bg" />
    </div>
  )
}
