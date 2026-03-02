import { useState } from 'react'
import { Icon } from '../../common/Icon'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { generateWorkflowSummaryLocally } from '../../../utils/workflow-ai'
import type { WorkflowNodeData } from '../../../types/workflow'
import type { Node } from '@xyflow/react'

export function WorkflowSummaryBanner() {
  const summary = useWorkflowStore((s) => s.workflowSummary)
  const setSummary = useWorkflowStore((s) => s.setSummary)
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const [collapsed, setCollapsed] = useState(false)

  if (!summary || summary.length === 0) return null

  const handleRegenerate = () => {
    const lines = generateWorkflowSummaryLocally(nodes as Node<WorkflowNodeData>[], edges)
    setSummary(lines)
  }

  return (
    <div className="border-b border-blue-500/20 bg-blue-500/5 flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-1.5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Icon icon={collapsed ? 'lucide:chevron-right' : 'lucide:chevron-down'} className="text-[10px]" />
          Workflow Summary
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRegenerate}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Regenerate summary"
          >
            <Icon icon="lucide:refresh-cw" className="text-[10px]" />
          </button>
          <button
            onClick={() => setSummary(null)}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Close"
          >
            <Icon icon="lucide:x" className="text-[10px]" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="px-4 pb-2">
          <p className="text-[10px] text-blue-300/80 mb-1">This workflow will:</p>
          <ol className="space-y-0.5">
            {summary.map((step, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[10px] text-zinc-400">
                <span className="text-blue-500/60 font-mono flex-shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
