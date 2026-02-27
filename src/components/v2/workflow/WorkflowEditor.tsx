import { ReactFlowProvider } from '@xyflow/react'
import { Icon } from '../../common/Icon'
import { WorkflowToolsPanel } from './WorkflowToolsPanel'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowNodeConfig } from './WorkflowNodeConfig'
import { WorkflowExecutionBar } from './WorkflowExecutionBar'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { useTaskStore } from '../../../store/useTaskStore'

export function WorkflowEditor() {
  const editingTaskId = useWorkflowStore((s) => s.editingTaskId)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const setEditingTaskId = useWorkflowStore((s) => s.setEditingTaskId)
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === editingTaskId))

  return (
    <ReactFlowProvider>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 h-11 border-b border-pilos-border flex-shrink-0 bg-pilos-bg">
          <button
            onClick={() => setEditingTaskId(null)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
          >
            <Icon icon="lucide:arrow-left" className="text-sm" />
            Back
          </button>
          <div className="w-px h-4 bg-pilos-border" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Icon icon="lucide:workflow" className="text-blue-400 text-sm flex-shrink-0" />
            <span className="text-xs font-bold text-white truncate">{task?.title || 'Workflow Editor'}</span>
            <span className="text-[10px] font-mono text-zinc-700">{editingTaskId?.slice(0, 8)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600">
              {useWorkflowStore.getState().nodes.length} nodes · {useWorkflowStore.getState().edges.length} connections
            </span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          <WorkflowToolsPanel />
          <WorkflowCanvas />
          {selectedNodeId && <WorkflowNodeConfig />}
        </div>

        {/* Bottom bar */}
        <WorkflowExecutionBar />
      </div>
    </ReactFlowProvider>
  )
}
