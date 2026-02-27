import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type VariableNodeProps = NodeProps<Node<WorkflowNodeData>>

const OP_ICONS: Record<string, string> = {
  set: 'lucide:equal',
  append: 'lucide:plus',
  increment: 'lucide:arrow-up',
  transform: 'lucide:wand-2',
}

export function VariableNode({ data, selected }: VariableNodeProps) {
  const execStatus = data.executionStatus || 'pending'
  const op = data.variableOperation || 'set'

  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-violet-500 !border-2 !border-pilos-bg" />

      <div
        className={`w-[160px] bg-pilos-card border-2 rounded-lg transition-all ${
          selected
            ? 'border-blue-500 shadow-lg shadow-blue-500/10'
            : execStatus === 'completed'
              ? 'border-emerald-500'
              : execStatus === 'running'
                ? 'border-orange-500'
                : 'border-violet-500/50'
        }`}
      >
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center flex-shrink-0">
              <Icon icon="lucide:variable" className="text-violet-400 text-xs" />
            </div>
            <span className="text-xs font-medium text-white truncate flex-1">{data.label}</span>
            <Icon icon={OP_ICONS[op]} className="text-violet-500 text-[10px] flex-shrink-0" />
          </div>
          <div className="pl-8">
            {data.variableName ? (
              <p className="text-[10px] font-mono text-zinc-500 truncate">
                {data.variableName} = {data.variableValue || '""'}
              </p>
            ) : (
              <p className="text-[10px] text-zinc-600">Set variable</p>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-violet-500 !border-2 !border-pilos-bg" />
    </div>
  )
}
