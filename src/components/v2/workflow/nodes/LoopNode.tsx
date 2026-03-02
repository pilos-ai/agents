import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type LoopNodeProps = NodeProps<Node<WorkflowNodeData>>

export function LoopNode({ data, selected }: LoopNodeProps) {
  const execStatus = data.executionStatus || 'pending'

  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-purple-500 !border-2 !border-pilos-bg" />

      <div
        className={`w-[160px] bg-pilos-card border-2 rounded-lg transition-all ${
          selected
            ? 'border-blue-500 shadow-lg shadow-blue-500/10'
            : execStatus === 'completed'
              ? 'border-emerald-500'
              : execStatus === 'running'
                ? 'border-orange-500'
                : 'border-purple-500/50'
        }`}
      >
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <Icon icon="lucide:repeat" className="text-purple-400 text-xs" />
            </div>
            <span className="text-xs font-medium text-white truncate flex-1">{data.label}</span>
          </div>
          <div className="pl-8">
            {data.loopType === 'count' && (
              <p className="text-[10px] text-zinc-500">{data.loopCount || 0}x iterations</p>
            )}
            {data.loopType === 'collection' && (
              <p className="text-[10px] font-mono text-zinc-500 truncate">{data.loopCollection || 'items'}</p>
            )}
            {data.loopType === 'while' && (
              <p className="text-[10px] font-mono text-zinc-500 truncate">{data.loopCondition || 'condition'}</p>
            )}
            {!data.loopType && (
              <p className="text-[10px] text-zinc-600">Configure loop</p>
            )}
          </div>
        </div>
      </div>

      {/* Loop body output */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="body"
        className="!w-2.5 !h-2.5 !bg-purple-500 !border-2 !border-pilos-bg"
      />
      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-purple-400 font-bold">Each Item</span>
      {/* Loop complete output */}
      <Handle
        type="source"
        position={Position.Right}
        id="done"
        className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-pilos-bg"
        style={{ top: '50%' }}
      />
      <span className="absolute right-[-32px] top-1/2 -translate-y-1/2 text-[10px] text-emerald-400 font-bold">Done</span>
    </div>
  )
}
