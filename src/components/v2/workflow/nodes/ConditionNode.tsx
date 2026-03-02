import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type ConditionNodeProps = NodeProps<Node<WorkflowNodeData>>

export function ConditionNode({ data, selected }: ConditionNodeProps) {
  const execStatus = data.executionStatus || 'pending'

  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-pilos-bg" />

      <div
        className={`w-20 h-20 rotate-45 border-2 rounded-lg flex items-center justify-center transition-all ${
          selected
            ? 'border-blue-500 shadow-lg shadow-blue-500/10'
            : execStatus === 'completed'
              ? 'border-emerald-500'
              : execStatus === 'running'
                ? 'border-orange-500'
                : 'border-amber-500/50'
        } bg-pilos-card`}
      >
        <div className="-rotate-45 flex flex-col items-center">
          <Icon icon="lucide:split" className="text-amber-400 text-sm" />
        </div>
      </div>

      <span className="text-[10px] font-medium text-zinc-400 mt-2">{data.label}</span>
      {data.conditionExpression && (
        <span className="text-[10px] font-mono text-zinc-600 mt-0.5">{data.conditionExpression}</span>
      )}

      {/* Yes handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-pilos-bg"
        style={{ top: '50%' }}
      />
      <span className="absolute right-[-26px] top-1/2 -translate-y-1/2 text-[10px] text-emerald-400 font-bold">True</span>
      {/* No handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!w-2.5 !h-2.5 !bg-red-500 !border-2 !border-pilos-bg"
      />
      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-red-400 font-bold">False</span>
    </div>
  )
}
