import type { NodeProps, Node } from '@xyflow/react'
import { Icon } from '../../../common/Icon'
import type { WorkflowNodeData } from '../../../../types/workflow'

type NoteNodeProps = NodeProps<Node<WorkflowNodeData>>

export function NoteNode({ data, selected }: NoteNodeProps) {
  return (
    <div
      className={`w-[180px] bg-yellow-500/5 border-2 border-dashed rounded-lg transition-all ${
        selected ? 'border-blue-400 shadow-lg shadow-blue-500/10' : 'border-yellow-500/30'
      }`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <Icon icon="lucide:sticky-note" className="text-yellow-500 text-xs flex-shrink-0" />
          <span className="text-xs font-medium text-yellow-400 truncate">{data.label}</span>
        </div>
        <p className="text-[10px] text-zinc-500 whitespace-pre-wrap line-clamp-4">
          {data.noteText || 'Add a note...'}
        </p>
      </div>
    </div>
  )
}
