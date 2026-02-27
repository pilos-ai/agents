import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type DelayNodeProps = NodeProps<Node<WorkflowNodeData>>

const UNIT_LABELS: Record<string, string> = {
  ms: 'ms',
  s: 'sec',
  min: 'min',
  h: 'hr',
}

export function DelayNode({ data, selected }: DelayNodeProps) {
  const execStatus = data.executionStatus || 'pending'
  const unit = data.delayUnit || 's'
  const amount = data.delayMs ?? 5

  return (
    <div className="flex flex-col items-center gap-1">
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-cyan-500 !border-2 !border-pilos-bg" />

      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all ${
          selected
            ? 'border-blue-400 shadow-lg shadow-blue-500/20'
            : execStatus === 'completed'
              ? 'border-emerald-500 bg-emerald-500/20'
              : execStatus === 'running'
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-cyan-500/50 bg-cyan-500/10'
        }`}
      >
        <Icon icon="lucide:timer" className={`text-lg ${execStatus === 'running' ? 'text-orange-400 animate-pulse' : 'text-cyan-400'}`} />
      </div>
      <span className="text-[10px] font-medium text-zinc-400">{data.label}</span>
      <span className="text-[9px] font-mono text-zinc-600">{amount}{UNIT_LABELS[unit]}</span>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-cyan-500 !border-2 !border-pilos-bg" />
    </div>
  )
}
