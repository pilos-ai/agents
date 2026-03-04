import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type AgentNodeProps = NodeProps<Node<WorkflowNodeData>>

const MODEL_LABELS: Record<string, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
}

export function AgentNode({ data, selected }: AgentNodeProps) {
  const execStatus = data.executionStatus || 'pending'
  const model = data.agentModel || 'sonnet'
  const prompt = data.agentPrompt || ''

  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-pilos-bg" />

      <div
        className={`w-[200px] bg-pilos-card border-2 rounded-lg transition-all ${
          selected
            ? 'border-blue-500 shadow-lg shadow-blue-500/10'
            : execStatus === 'completed'
              ? 'border-emerald-500'
              : execStatus === 'running'
                ? 'border-orange-500 animate-pulse'
                : 'border-emerald-500/50'
        }`}
      >
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <Icon icon="lucide:bot" className="text-emerald-400 text-xs" />
            </div>
            <span className="text-xs font-medium text-white truncate flex-1">{data.label}</span>
            {execStatus === 'running' && (
              <Icon icon="lucide:loader-2" className="text-orange-400 text-xs animate-spin flex-shrink-0" />
            )}
            {execStatus === 'completed' && (
              <Icon icon="lucide:check" className="text-emerald-400 text-xs flex-shrink-0" />
            )}
            {execStatus === 'failed' && (
              <Icon icon="lucide:x" className="text-red-400 text-xs flex-shrink-0" />
            )}
          </div>
          <div className="pl-8">
            {prompt ? (
              <p className="text-[10px] text-zinc-500 truncate">{prompt.slice(0, 60)}{prompt.length > 60 ? '...' : ''}</p>
            ) : (
              <p className="text-[10px] text-orange-400/80">Click to add agent prompt</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 pl-8">
            <span className="text-[10px] font-mono text-emerald-500/70 uppercase">{MODEL_LABELS[model]}</span>
            <span className="text-[10px] text-zinc-700">Agent</span>
          </div>
        </div>
        {data.executionError && (
          <div className="px-3 py-1.5 border-t border-red-500/20 bg-red-500/5">
            <p className="text-[10px] text-red-400 truncate">{data.executionError as string}</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-pilos-bg" />
    </div>
  )
}
