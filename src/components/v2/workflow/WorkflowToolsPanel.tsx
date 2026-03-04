import { useMemo } from 'react'
import { Icon } from '../../common/Icon'
import { WorkflowToolCard } from './WorkflowToolCard'
import { WorkflowGenerateModal } from './WorkflowGenerateModal'
import { WORKFLOW_TOOL_CATEGORIES, TOOL_FILTER_TABS, filterToolCategories } from '../../../data/workflow-tools'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { ProBadge } from '../../common/ProBadge'
import type { McpToolCategory, McpToolDefinition } from '../../../types/workflow'

// Map MCP server configs to workflow tool categories
function mcpServerToCategory(server: { id: string; name: string; icon: string; description: string; config: { type: string } }): McpToolCategory {
  const tools: McpToolDefinition[] = [
    {
      id: `mcp_${server.id}_invoke`,
      name: `${server.name} Call`,
      icon: 'lucide:terminal',
      description: `Invoke ${server.name} tool`,
      category: server.name,
      parameters: [
        { key: 'tool_name', label: 'Tool Name', type: 'string', value: '', required: true },
        { key: 'arguments', label: 'Arguments', type: 'json', value: '{}' },
      ],
    },
  ]

  // Add common tools based on server type
  if (server.id === 'github') {
    tools.length = 0
    tools.push(
      { id: 'mcp_github_issues', name: 'List Issues', icon: 'lucide:circle-dot', description: 'Fetch GitHub issues', category: server.name, parameters: [{ key: 'repo', label: 'Repository', type: 'string', value: '', required: true }, { key: 'state', label: 'State', type: 'select', value: 'open', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }] }] },
      { id: 'mcp_github_create_issue', name: 'Create Issue', icon: 'lucide:plus-circle', description: 'Create a GitHub issue', category: server.name, parameters: [{ key: 'repo', label: 'Repository', type: 'string', value: '', required: true }, { key: 'title', label: 'Title', type: 'string', value: '', required: true }, { key: 'body', label: 'Body', type: 'string', value: '' }] },
      { id: 'mcp_github_prs', name: 'List PRs', icon: 'lucide:git-pull-request', description: 'Fetch pull requests', category: server.name, parameters: [{ key: 'repo', label: 'Repository', type: 'string', value: '', required: true }] },
    )
  } else if (server.id === 'supabase') {
    tools.length = 0
    tools.push(
      { id: 'mcp_supabase_query', name: 'Run Query', icon: 'lucide:database', description: 'Execute SQL query', category: server.name, parameters: [{ key: 'query', label: 'SQL Query', type: 'string', value: '', required: true }] },
      { id: 'mcp_supabase_insert', name: 'Insert Row', icon: 'lucide:plus', description: 'Insert into table', category: server.name, parameters: [{ key: 'table', label: 'Table', type: 'string', value: '', required: true }, { key: 'data', label: 'Row Data', type: 'json', value: '{}', required: true }] },
    )
  } else if (server.id === 'filesystem') {
    tools.length = 0
    tools.push(
      { id: 'mcp_fs_read', name: 'Read File', icon: 'lucide:file-text', description: 'Read file contents', category: server.name, parameters: [{ key: 'path', label: 'File Path', type: 'string', value: '', required: true }] },
      { id: 'mcp_fs_write', name: 'Write File', icon: 'lucide:file-edit', description: 'Write to file', category: server.name, parameters: [{ key: 'path', label: 'File Path', type: 'string', value: '', required: true }, { key: 'content', label: 'Content', type: 'string', value: '', required: true }] },
      { id: 'mcp_fs_search', name: 'Search Files', icon: 'lucide:search', description: 'Search for files', category: server.name, parameters: [{ key: 'pattern', label: 'Pattern', type: 'string', value: '', required: true }, { key: 'path', label: 'Directory', type: 'string', value: '.' }] },
    )
  }

  return {
    name: `${server.icon} ${server.name}`,
    icon: 'lucide:puzzle',
    tools,
  }
}

// Built-in structural nodes that can be dragged onto the canvas
const STRUCTURAL_NODES = [
  { id: '_start', name: 'Start', icon: 'lucide:play', description: 'Workflow entry point', nodeType: 'start' },
  { id: '_end', name: 'End', icon: 'lucide:square', description: 'Workflow exit point', nodeType: 'end' },
  { id: '_condition', name: 'Condition', icon: 'lucide:git-branch', description: 'Branch on expression', nodeType: 'condition' },
  { id: '_loop', name: 'Loop', icon: 'lucide:repeat', description: 'Iterate or repeat steps', nodeType: 'loop' },
  { id: '_delay', name: 'Delay', icon: 'lucide:timer', description: 'Wait before next step', nodeType: 'delay' },
  { id: '_parallel', name: 'Parallel', icon: 'lucide:git-fork', description: 'Fork into parallel branches', nodeType: 'parallel' },
  { id: '_merge', name: 'Merge', icon: 'lucide:git-merge', description: 'Join parallel branches', nodeType: 'merge' },
  { id: '_variable', name: 'Variable', icon: 'lucide:variable', description: 'Set or transform data', nodeType: 'variable' },
  { id: '_note', name: 'Note', icon: 'lucide:sticky-note', description: 'Add annotation', nodeType: 'note' },
  { id: '_ai_prompt', name: 'AI Prompt', icon: 'lucide:sparkles', description: 'Ask Claude AI to help', nodeType: 'ai_prompt' },
  { id: '_agent', name: 'Agent', icon: 'lucide:bot', description: 'Full Claude Code session', nodeType: 'agent' },
  { id: '_results_display', name: 'Results', icon: 'lucide:layout-dashboard', description: 'Display workflow output', nodeType: 'results_display' },
] as const

const NODE_COLORS: Record<string, { bg: string; bgHover: string; text: string }> = {
  start: { bg: 'bg-emerald-500/10', bgHover: 'group-hover:bg-emerald-500/20', text: 'text-emerald-400' },
  end: { bg: 'bg-zinc-700/50', bgHover: 'group-hover:bg-zinc-700', text: 'text-zinc-400' },
  condition: { bg: 'bg-amber-500/10', bgHover: 'group-hover:bg-amber-500/20', text: 'text-amber-400' },
  loop: { bg: 'bg-purple-500/10', bgHover: 'group-hover:bg-purple-500/20', text: 'text-purple-400' },
  delay: { bg: 'bg-cyan-500/10', bgHover: 'group-hover:bg-cyan-500/20', text: 'text-cyan-400' },
  parallel: { bg: 'bg-indigo-500/10', bgHover: 'group-hover:bg-indigo-500/20', text: 'text-indigo-400' },
  merge: { bg: 'bg-indigo-500/10', bgHover: 'group-hover:bg-indigo-500/20', text: 'text-indigo-400' },
  variable: { bg: 'bg-violet-500/10', bgHover: 'group-hover:bg-violet-500/20', text: 'text-violet-400' },
  note: { bg: 'bg-yellow-500/10', bgHover: 'group-hover:bg-yellow-500/20', text: 'text-yellow-400' },
  ai_prompt: { bg: 'bg-purple-500/10', bgHover: 'group-hover:bg-purple-500/20', text: 'text-purple-400' },
  agent: { bg: 'bg-emerald-500/10', bgHover: 'group-hover:bg-emerald-500/20', text: 'text-emerald-400' },
  results_display: { bg: 'bg-cyan-500/10', bgHover: 'group-hover:bg-cyan-500/20', text: 'text-cyan-400' },
}

function StructuralNodeCard({ node }: { node: typeof STRUCTURAL_NODES[number] }) {
  const colors = NODE_COLORS[node.nodeType] || NODE_COLORS.condition
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/workflow-structural', JSON.stringify(node))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-pilos-border bg-pilos-card hover:border-zinc-600 cursor-grab active:cursor-grabbing transition-colors group"
    >
      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${colors.bg} ${colors.bgHover}`}>
        <Icon icon={node.icon} className={`text-xs ${colors.text}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white truncate">{node.name}</p>
        <p className="text-[10px] text-zinc-600 truncate">{node.description}</p>
      </div>
      <Icon icon="lucide:grip-vertical" className="text-zinc-700 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}

export function WorkflowToolsPanel() {
  const showGenerate = useWorkflowStore((s) => s.showGenerateModal)
  const setShowGenerate = useWorkflowStore((s) => s.setShowGenerateModal)
  const toggleChatMode = useWorkflowStore((s) => s.toggleChatMode)
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'
  const search = useWorkflowStore((s) => s.toolSearchQuery)
  const setSearch = useWorkflowStore((s) => s.setToolSearchQuery)
  const tab = useWorkflowStore((s) => s.toolFilterTab)
  const setTab = useWorkflowStore((s) => s.setToolFilterTab)

  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const activeProject = openProjects.find((p) => p.projectPath === activeProjectPath)
  const enabledMcpServers = useMemo(
    () => (activeProject?.mcpServers || []).filter((s) => s.enabled),
    [activeProject?.mcpServers]
  )

  // Merge hardcoded tool categories with project MCP server categories
  const mcpCategories = useMemo(
    () => enabledMcpServers.map(mcpServerToCategory),
    [enabledMcpServers]
  )

  const allCategories = useMemo(
    () => [...WORKFLOW_TOOL_CATEGORIES, ...mcpCategories],
    [mcpCategories]
  )

  const categories = useMemo(
    () => filterToolCategories(allCategories, tab, search),
    [allCategories, tab, search]
  )

  return (
    <div className="w-64 border-r border-pilos-border flex flex-col bg-pilos-bg flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pilos-border flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Tools</h3>
          <div className="flex items-center gap-1.5">
            {enabledMcpServers.length > 0 && (
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                +{enabledMcpServers.length} connected
              </span>
            )}
          </div>
        </div>

        {/* AI Chat / Tools toggle */}
        <button
          onClick={isPro ? toggleChatMode : undefined}
          disabled={!isPro}
          className={`w-full mb-2.5 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isPro ? 'text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-blue-500/10' : 'text-zinc-500 bg-zinc-800 border border-pilos-border cursor-not-allowed opacity-60'}`}
        >
          <Icon icon="lucide:sparkles" className="text-xs" />
          Build with AI Chat
          {!isPro && <ProBadge />}
        </button>

        {/* Search */}
        <div className="relative">
          <Icon icon="lucide:search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 text-[10px]" />
          <input
            type="text"
            placeholder="Filter tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-pilos-blue"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-pilos-border flex-shrink-0">
        {TOOL_FILTER_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
              tab === t.id
                ? 'bg-blue-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-4">
        {/* Structural nodes */}
        {tab === 'all' && (() => {
          const q = search.toLowerCase()
          const filtered = STRUCTURAL_NODES.filter((n) =>
            !search || n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q) || n.nodeType.includes(q)
          )
          if (filtered.length === 0) return null
          return (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon icon="lucide:shapes" className="text-[10px] text-zinc-600" />
                <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Flow Control</h4>
              </div>
              <div className="space-y-1.5">
                {filtered.map((node) => (
                  <StructuralNodeCard key={node.id} node={node} />
                ))}
              </div>
            </div>
          )
        })()}

        {/* MCP Tool categories */}
        {categories.map((cat) => {
          const isMcp = mcpCategories.some((mc) => mc.name === cat.name)
          return (
            <div key={cat.name}>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon icon={cat.icon} className={`text-[10px] ${isMcp ? 'text-emerald-600' : 'text-zinc-600'}`} />
                <h4 className={`text-[10px] font-bold uppercase tracking-widest ${isMcp ? 'text-emerald-600' : 'text-zinc-600'}`}>{cat.name}</h4>
              </div>
              <div className="space-y-1.5">
                {cat.tools.map((tool) => (
                  <WorkflowToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            </div>
          )
        })}
        {categories.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center">
            <Icon icon="lucide:search-x" className="text-zinc-800 text-xl mb-2" />
            <p className="text-xs text-zinc-600">No matching tools</p>
          </div>
        )}
      </div>

      <WorkflowGenerateModal open={showGenerate} onClose={() => setShowGenerate(false)} />
    </div>
  )
}
