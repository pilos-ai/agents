import { Icon } from '../../common/Icon'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { generateWorkflowForTemplate } from '../../../data/workflow-templates'
import type { TaskTemplate } from '../../../store/useTaskStore'

interface TemplateOption {
  id: TaskTemplate
  name: string
  icon: string
  description: string
  nodeCount: number
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'client_review',
    name: 'Client Review',
    icon: 'lucide:message-square',
    description: 'Search Jira for client comments, filter requests, create follow-up tickets, and notify the team.',
    nodeCount: 8,
  },
  {
    id: 'sprint_sync',
    name: 'Sprint Sync',
    icon: 'lucide:refresh-cw',
    description: 'Pull sprint issues, transform data, transition statuses, detect blockers, and send a report.',
    nodeCount: 7,
  },
  {
    id: 'standup_report',
    name: 'Standup Report',
    icon: 'lucide:bar-chart-2',
    description: 'Gather recent Jira activity, aggregate stats, format a report, and post to Slack.',
    nodeCount: 6,
  },
]

export function WorkflowTemplatesModal({ onClose }: { onClose: () => void }) {
  const handleSelect = (templateId: TaskTemplate) => {
    const workflow = generateWorkflowForTemplate(templateId)
    if (!workflow) return

    const store = useWorkflowStore.getState()
    store.pushHistory()
    useWorkflowStore.setState({
      nodes: workflow.nodes,
      edges: workflow.edges.map((e) => ({ ...e, type: e.type || 'dashed' })),
      selectedNodeId: null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-pilos-card border border-pilos-border rounded-xl shadow-2xl w-[520px] max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-pilos-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Workflow Templates</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Choose a pre-built workflow to get started</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <Icon icon="lucide:x" className="text-sm" />
          </button>
        </div>

        {/* Templates */}
        <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar max-h-[60vh]">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              className="w-full text-left p-4 bg-pilos-bg border border-pilos-border rounded-lg hover:border-blue-500/30 hover:bg-blue-600/5 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center flex-shrink-0">
                  <Icon icon={t.icon} className="text-blue-400 text-base" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">{t.name}</h3>
                    <span className="text-[10px] text-zinc-600">{t.nodeCount} nodes</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">{t.description}</p>
                </div>
                <Icon icon="lucide:arrow-right" className="text-zinc-700 text-xs mt-1 group-hover:text-blue-400 transition-colors flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-pilos-border">
          <p className="text-[10px] text-zinc-700">
            Templates load pre-built nodes and connections. You can customize them after loading.
          </p>
        </div>
      </div>
    </div>
  )
}
