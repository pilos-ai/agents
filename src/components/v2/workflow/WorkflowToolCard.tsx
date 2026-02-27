import { Icon } from '../../common/Icon'
import type { McpToolDefinition } from '../../../types/workflow'

interface Props {
  tool: McpToolDefinition
}

export function WorkflowToolCard({ tool }: Props) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/workflow-tool', JSON.stringify(tool))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-pilos-border bg-pilos-card hover:border-zinc-600 cursor-grab active:cursor-grabbing transition-colors group"
    >
      <div className="w-7 h-7 rounded-md bg-pilos-bg flex items-center justify-center flex-shrink-0 group-hover:bg-zinc-800 transition-colors">
        <Icon icon={tool.icon} className="text-blue-400 text-xs" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white truncate">{tool.name}</p>
        <p className="text-[10px] text-zinc-600 truncate">{tool.description}</p>
      </div>
      <Icon icon="lucide:grip-vertical" className="text-zinc-700 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}
