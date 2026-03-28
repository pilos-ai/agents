import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { Icon } from '../../common/Icon'
import { PromptEditor } from './PromptEditor'
import { useWorkflowStore, normalizeNodeTypes } from '../../../store/useWorkflowStore'
import { hydrateToolNodes, validateAiPromptNodes, extractJson, WORKFLOW_RUNTIME_GUIDE } from '../../../utils/workflow-ai'
import { api } from '../../../api'
import type { ClaudeEvent } from '../../../types'
import type { WorkflowNodeData, WorkflowParameter } from '../../../types/workflow'

// ── Node type metadata ─────────────────────────────────────────────────────────

const NODE_META: Record<string, { icon: string; color: string; dot: string; glow: string }> = {
  start:           { icon: 'lucide:play',            color: 'text-emerald-400', dot: 'bg-emerald-400', glow: 'shadow-emerald-500/30' },
  end:             { icon: 'lucide:stop-circle',      color: 'text-red-400',     dot: 'bg-red-400',     glow: 'shadow-red-500/30' },
  agent:           { icon: 'lucide:bot',              color: 'text-blue-400',    dot: 'bg-blue-400',    glow: 'shadow-blue-500/30' },
  ai_prompt:       { icon: 'lucide:sparkles',         color: 'text-purple-400',  dot: 'bg-purple-400',  glow: 'shadow-purple-500/30' },
  mcp_tool:        { icon: 'lucide:plug',             color: 'text-yellow-400',  dot: 'bg-yellow-400',  glow: 'shadow-yellow-500/30' },
  condition:       { icon: 'lucide:git-branch',       color: 'text-orange-400',  dot: 'bg-orange-400',  glow: 'shadow-orange-500/30' },
  loop:            { icon: 'lucide:repeat',           color: 'text-cyan-400',    dot: 'bg-cyan-400',    glow: 'shadow-cyan-500/30' },
  variable:        { icon: 'lucide:braces',           color: 'text-pink-400',    dot: 'bg-pink-400',    glow: 'shadow-pink-500/30' },
  delay:           { icon: 'lucide:clock',            color: 'text-zinc-400',    dot: 'bg-zinc-500',    glow: 'shadow-zinc-500/30' },
  note:            { icon: 'lucide:file-text',        color: 'text-zinc-400',    dot: 'bg-zinc-500',    glow: 'shadow-zinc-500/30' },
  parallel:        { icon: 'lucide:git-fork',         color: 'text-indigo-400',  dot: 'bg-indigo-400',  glow: 'shadow-indigo-500/30' },
  merge:           { icon: 'lucide:merge',            color: 'text-indigo-400',  dot: 'bg-indigo-400',  glow: 'shadow-indigo-500/30' },
  results_display: { icon: 'lucide:layout-dashboard', color: 'text-teal-400',    dot: 'bg-teal-400',    glow: 'shadow-teal-500/30' },
}
const DEFAULT_META = { icon: 'lucide:box', color: 'text-zinc-400', dot: 'bg-zinc-500', glow: '' }

// ── Addable node type catalog ──────────────────────────────────────────────────

const ADD_NODE_GROUPS = [
  { label: 'AI', types: ['agent', 'ai_prompt'] },
  { label: 'Flow', types: ['condition', 'loop', 'parallel', 'merge', 'delay'] },
  { label: 'Data', types: ['variable', 'results_display'] },
  { label: 'Utility', types: ['mcp_tool', 'note', 'end'] },
]

const NODE_TYPE_LABELS: Record<string, string> = {
  agent: 'Agent', ai_prompt: 'AI Prompt', condition: 'Condition', loop: 'Loop',
  parallel: 'Parallel', merge: 'Merge', delay: 'Delay', variable: 'Variable',
  results_display: 'Results', mcp_tool: 'Tool', note: 'Note', end: 'End',
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateNode(node: Node<WorkflowNodeData>): string | null {
  const d = node.data
  switch (d.type) {
    case 'agent':     return !d.agentPrompt?.trim() ? 'Agent prompt is empty' : null
    case 'ai_prompt': return !d.aiPrompt?.trim()    ? 'AI prompt is empty' : null
    case 'variable':  return !d.variableName?.trim() ? 'Variable name is required' : null
    case 'condition': return !d.conditionExpression?.trim() ? 'Condition expression is empty' : null
    case 'loop':      return d.loopType !== 'count' && !d.loopCollection?.trim() ? 'Loop collection is empty' : null
    default:          return null
  }
}

// ── Collapsed preview ──────────────────────────────────────────────────────────

function nodePreview(node: Node<WorkflowNodeData>): string {
  const d = node.data
  const truncate = (s?: string, n = 55) => !s ? '' : s.length > n ? s.slice(0, n) + '…' : s
  switch (d.type) {
    case 'agent':           return truncate(d.agentPrompt)
    case 'ai_prompt':       return truncate(d.aiPrompt)
    case 'variable':        return d.variableName ? `${d.variableName} = ${truncate(d.variableValue, 35)}` : ''
    case 'condition':       return d.conditionExpression ? `${truncate(d.conditionExpression, 25)} ${d.conditionOperator || 'equals'} ${d.conditionValue || '?'}` : ''
    case 'loop':            return d.loopType === 'count' ? `${d.loopCount || '?'}× iterations` : truncate(d.loopCollection)
    case 'delay':           return `${d.delayMs ?? '?'} ${d.delayUnit || 'ms'}`
    case 'mcp_tool':        return d.toolId || ''
    case 'note':            return truncate(d.noteText)
    case 'results_display': return truncate(d.displaySource)
    default:                return ''
  }
}

// ── Shared inputs ──────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-medium text-zinc-500 mb-1">{children}</label>
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      onKeyDown={(e) => e.stopPropagation()}
      className="w-full bg-zinc-900 border border-zinc-700/60 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/60" />
  )
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] | string[] }) {
  const opts = options.map((o) => typeof o === 'string' ? { value: o, label: o } : o)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()}
      className="w-full bg-zinc-900 border border-zinc-700/60 rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500/60">
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function NumberInput({ value, onChange, min }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <input type="number" value={value} min={min} onChange={(e) => onChange(Number(e.target.value))}
      onKeyDown={(e) => e.stopPropagation()}
      className="w-full bg-zinc-900 border border-zinc-700/60 rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500/60" />
  )
}

// ── Node field editors ─────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { value: 'haiku', label: 'Haiku — fast' }, { value: 'sonnet', label: 'Sonnet — balanced' }, { value: 'opus', label: 'Opus — powerful' },
]

function NodeFields({ node, updateNode, uk }: {
  node: Node<WorkflowNodeData>
  updateNode: (id: string, patch: Partial<WorkflowNodeData>) => void
  uk: number
}) {
  const d = node.data
  const t = d.type

  if (['start', 'end', 'parallel', 'merge'].includes(t))
    return <p className="text-[10px] text-zinc-600 italic">No configurable fields for this node type.</p>

  if (t === 'agent') return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Agent Prompt</FieldLabel>
        <PromptEditor key={`${node.id}-ap-${uk}`} defaultValue={d.agentPrompt || ''} onChange={(v) => updateNode(node.id, { agentPrompt: v })} nodeId={node.id} placeholder="Describe what the agent should do..." />
      </div>
      <div className="flex gap-2">
        <div className="flex-1"><FieldLabel>Model</FieldLabel><SelectInput value={d.agentModel || 'sonnet'} onChange={(v) => updateNode(node.id, { agentModel: v as WorkflowNodeData['agentModel'] })} options={MODEL_OPTIONS} /></div>
        <div className="w-24"><FieldLabel>Max Turns</FieldLabel><NumberInput value={d.agentMaxTurns ?? 10} min={1} onChange={(v) => updateNode(node.id, { agentMaxTurns: v })} /></div>
      </div>
    </div>
  )

  if (t === 'ai_prompt') return (
    <div className="space-y-3">
      <div><FieldLabel>Prompt</FieldLabel><PromptEditor key={`${node.id}-ai-${uk}`} defaultValue={d.aiPrompt || ''} onChange={(v) => updateNode(node.id, { aiPrompt: v })} nodeId={node.id} placeholder="Write your prompt here..." /></div>
      <div><FieldLabel>Model</FieldLabel><SelectInput value={d.aiModel || 'sonnet'} onChange={(v) => updateNode(node.id, { aiModel: v as WorkflowNodeData['aiModel'] })} options={MODEL_OPTIONS} /></div>
    </div>
  )

  if (t === 'condition') return (
    <div className="space-y-3">
      <div><FieldLabel>Expression</FieldLabel><PromptEditor key={`${node.id}-ce-${uk}`} defaultValue={d.conditionExpression || ''} onChange={(v) => updateNode(node.id, { conditionExpression: v })} nodeId={node.id} compact placeholder="{{node.field}}" /></div>
      <div className="flex gap-2">
        <div className="flex-1"><FieldLabel>Operator</FieldLabel><SelectInput value={d.conditionOperator || 'equals'} onChange={(v) => updateNode(node.id, { conditionOperator: v as WorkflowNodeData['conditionOperator'] })} options={['equals','contains','greater_than','less_than','regex']} /></div>
        <div className="flex-1"><FieldLabel>Value</FieldLabel><TextInput value={d.conditionValue || ''} onChange={(v) => updateNode(node.id, { conditionValue: v })} placeholder="expected" /></div>
      </div>
    </div>
  )

  if (t === 'loop') return (
    <div className="space-y-3">
      <div><FieldLabel>Loop Type</FieldLabel><SelectInput value={d.loopType || 'collection'} onChange={(v) => updateNode(node.id, { loopType: v as WorkflowNodeData['loopType'] })} options={['collection','count','while']} /></div>
      {d.loopType !== 'count'
        ? <div><FieldLabel>Collection</FieldLabel><PromptEditor key={`${node.id}-lc-${uk}`} defaultValue={d.loopCollection || ''} onChange={(v) => updateNode(node.id, { loopCollection: v })} nodeId={node.id} compact placeholder="{{node.items}}" /></div>
        : <div><FieldLabel>Count</FieldLabel><NumberInput value={d.loopCount ?? 3} min={1} onChange={(v) => updateNode(node.id, { loopCount: v })} /></div>}
    </div>
  )

  if (t === 'variable') return (
    <div className="space-y-3">
      <div><FieldLabel>Variable Name</FieldLabel><TextInput value={d.variableName || ''} onChange={(v) => updateNode(node.id, { variableName: v })} placeholder="myVar" /></div>
      <div><FieldLabel>Value</FieldLabel><PromptEditor key={`${node.id}-vv-${uk}`} defaultValue={d.variableValue || ''} onChange={(v) => updateNode(node.id, { variableValue: v })} nodeId={node.id} compact placeholder="value or {{node.field}}" /></div>
      <div><FieldLabel>Operation</FieldLabel><SelectInput value={d.variableOperation || 'set'} onChange={(v) => updateNode(node.id, { variableOperation: v as WorkflowNodeData['variableOperation'] })} options={['set','append','increment','transform']} /></div>
    </div>
  )

  if (t === 'delay') return (
    <div className="flex gap-2">
      <div className="flex-1"><FieldLabel>Duration</FieldLabel><NumberInput value={d.delayMs ?? 1000} min={0} onChange={(v) => updateNode(node.id, { delayMs: v })} /></div>
      <div className="w-20"><FieldLabel>Unit</FieldLabel><SelectInput value={d.delayUnit || 'ms'} onChange={(v) => updateNode(node.id, { delayUnit: v as WorkflowNodeData['delayUnit'] })} options={['ms','s','min','h']} /></div>
    </div>
  )

  if (t === 'note') return (
    <div><FieldLabel>Content</FieldLabel>
      <textarea key={`${node.id}-nt-${uk}`} defaultValue={d.noteText || ''} onChange={(e) => updateNode(node.id, { noteText: e.target.value })} onKeyDown={(e) => e.stopPropagation()} rows={4}
        className="w-full bg-zinc-900 border border-zinc-700/60 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/60 resize-none font-mono" />
    </div>
  )

  if (t === 'results_display') return (
    <div className="space-y-3">
      <div><FieldLabel>Data Source</FieldLabel><PromptEditor key={`${node.id}-ds-${uk}`} defaultValue={d.displaySource || ''} onChange={(v) => updateNode(node.id, { displaySource: v })} nodeId={node.id} compact placeholder="{{node.output}}" /></div>
      <div className="flex gap-2">
        <div className="flex-1"><FieldLabel>Title</FieldLabel><TextInput value={d.displayTitle || ''} onChange={(v) => updateNode(node.id, { displayTitle: v })} placeholder="Results" /></div>
        <div className="w-24"><FieldLabel>Format</FieldLabel><SelectInput value={d.displayFormat || 'auto'} onChange={(v) => updateNode(node.id, { displayFormat: v as WorkflowNodeData['displayFormat'] })} options={['auto','table','list','json']} /></div>
      </div>
    </div>
  )

  if (t === 'mcp_tool') {
    const params = d.parameters || {}
    const entries = Object.entries(params) as [string, WorkflowParameter][]
    if (!entries.length) return <p className="text-[10px] text-zinc-600 italic">Tool: {d.toolId || '(none)'} — no parameters</p>
    return (
      <div className="space-y-3">
        <div className="text-[10px] text-zinc-600 font-mono">tool: {d.toolId}</div>
        {entries.map(([key, param]) => (
          <div key={key}>
            <FieldLabel>{param.label || key}{param.required && <span className="text-red-400 ml-0.5">*</span>}</FieldLabel>
            {param.type === 'boolean'
              ? <div className="flex items-center gap-2"><input type="checkbox" checked={!!param.value} onChange={(e) => updateNode(node.id, { parameters: { ...params, [key]: { ...param, value: e.target.checked } } })} /><span className="text-xs text-zinc-400">{param.value ? 'true' : 'false'}</span></div>
              : param.type === 'select' && param.options
              ? <SelectInput value={String(param.value ?? '')} onChange={(v) => updateNode(node.id, { parameters: { ...params, [key]: { ...param, value: v } } })} options={param.options} />
              : param.type === 'number'
              ? <NumberInput value={Number(param.value ?? 0)} onChange={(v) => updateNode(node.id, { parameters: { ...params, [key]: { ...param, value: v } } })} />
              : <PromptEditor key={`${node.id}-p-${key}-${uk}`} defaultValue={String(param.value ?? '')} onChange={(v) => updateNode(node.id, { parameters: { ...params, [key]: { ...param, value: v } } })} nodeId={node.id} compact />}
          </div>
        ))}
      </div>
    )
  }

  return null
}

// ── Add Node Picker ────────────────────────────────────────────────────────────

function AddNodePicker({ onAdd, onClose }: { onAdd: (type: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-8 bottom-full mb-2 z-40 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 p-3 w-64">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">Add Node</p>
        {ADD_NODE_GROUPS.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="text-[9px] text-zinc-700 uppercase tracking-wider px-1 mb-1">{group.label}</p>
            <div className="grid grid-cols-2 gap-1">
              {group.types.map((type) => {
                const meta = NODE_META[type] || DEFAULT_META
                return (
                  <button key={type} onClick={() => { onAdd(type); onClose() }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-left">
                    <Icon icon={meta.icon} className={`text-[10px] ${meta.color}`} />
                    <span className="text-[10px] text-zinc-300">{NODE_TYPE_LABELS[type]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Node Card ──────────────────────────────────────────────────────────────────

function NodeCard({
  node, edges, allNodes, expanded, onToggle, onDelete, updateNode, uk,
  isDragOver, dragHandleProps,
}: {
  node: Node<WorkflowNodeData>; edges: Edge[]; allNodes: Node<WorkflowNodeData>[]
  expanded: boolean; onToggle: () => void; onDelete: () => void
  updateNode: (id: string, patch: Partial<WorkflowNodeData>) => void; uk: number
  isDragOver: boolean; dragHandleProps: React.HTMLAttributes<HTMLDivElement>
}) {
  const meta = NODE_META[node.data.type] || DEFAULT_META
  const warning = validateNode(node)
  const preview = !expanded ? nodePreview(node) : ''
  const outgoing = edges.filter((e) => e.source === node.id)
  const nodeById = Object.fromEntries(allNodes.map((n) => [n.id, n]))

  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState(node.data.label)
  const labelInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setLabelDraft(node.data.label) }, [node.data.label])
  useEffect(() => { if (editingLabel) labelInputRef.current?.focus() }, [editingLabel])

  const commitLabel = () => {
    const v = labelDraft.trim()
    if (v) updateNode(node.id, { label: v })
    else setLabelDraft(node.data.label)
    setEditingLabel(false)
  }

  return (
    <div className={`rounded-xl border transition-all duration-150 overflow-hidden ${
      isDragOver ? 'border-blue-500/60 bg-blue-500/5' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
    } ${warning ? 'border-l-2 border-l-amber-500/60' : ''}`}>

      {/* Header row */}
      <div className="flex items-center gap-0 cursor-pointer" onClick={onToggle}>
        {/* Drag handle */}
        <div {...dragHandleProps} className="flex-shrink-0 w-7 flex items-center justify-center self-stretch cursor-grab active:cursor-grabbing text-zinc-700 hover:text-zinc-500 transition-colors" onClick={(e) => e.stopPropagation()}>
          <Icon icon="lucide:grip-vertical" className="text-[10px]" />
        </div>

        {/* Type icon */}
        <div className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg mr-2 my-1.5 bg-zinc-800`}>
          <Icon icon={meta.icon} className={`text-xs ${meta.color}`} />
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0 py-2 pr-2">
          {editingLabel ? (
            <input ref={labelInputRef} value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setLabelDraft(node.data.label); setEditingLabel(false) } }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent border-b border-blue-500 text-xs text-white outline-none" />
          ) : (
            <span className="text-xs font-medium text-white truncate block" onDoubleClick={(e) => { e.stopPropagation(); setEditingLabel(true) }}>
              {node.data.label}
            </span>
          )}
          {/* Preview of key field when collapsed */}
          {preview && !expanded && (
            <span className="text-[10px] text-zinc-600 truncate block leading-tight mt-0.5 font-mono">{preview}</span>
          )}
        </div>

        {/* Right side metadata */}
        <div className="flex items-center gap-1.5 pr-2 flex-shrink-0">
          {warning && (
            <span title={warning} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[8px] text-amber-400 font-medium">
              <Icon icon="lucide:alert-triangle" className="text-[8px]" />
              fix
            </span>
          )}
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md ${meta.color} bg-white/[0.04]`}>{node.data.type}</span>
          {outgoing.length > 0 && (
            <div className="flex items-center gap-1">
              <Icon icon="lucide:arrow-right" className="text-[9px] text-zinc-700" />
              <span className="text-[9px] text-zinc-600 max-w-[70px] truncate">
                {outgoing[0] && (nodeById[outgoing[0].target]?.data.label || outgoing[0].target)}
                {outgoing.length > 1 && ` +${outgoing.length - 1}`}
              </span>
            </div>
          )}
          <button onClick={(e) => { e.stopPropagation(); setEditingLabel(true) }} className="p-1 text-zinc-700 hover:text-zinc-400 transition-colors">
            <Icon icon="lucide:pencil" className="text-[9px]" />
          </button>
          {node.data.type !== 'start' && (
            <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="p-1 text-zinc-700 hover:text-red-400 transition-colors">
              <Icon icon="lucide:trash-2" className="text-[9px]" />
            </button>
          )}
          <Icon icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-[10px] text-zinc-600" />
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
          <NodeFields node={node} updateNode={updateNode} uk={uk} />
          {outgoing.length > 0 && (
            <div className="pt-2 border-t border-zinc-800/60">
              <p className="text-[9px] text-zinc-700 mb-1">Connects to:</p>
              <div className="flex flex-wrap gap-1">
                {outgoing.map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-800 text-[9px] text-zinc-500 font-mono">
                    {e.sourceHandle && <span className="text-zinc-700">[{e.sourceHandle}]</span>}
                    <Icon icon="lucide:arrow-right" className="text-[8px]" />
                    {nodeById[e.target]?.data.label || e.target}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-[9px] text-zinc-800 font-mono">id: {node.id}</p>
        </div>
      )}
    </div>
  )
}

// ── AI chat helpers ────────────────────────────────────────────────────────────

function buildCodeEditorPrompt(currentJson: string, userMessage: string): string {
  return `You are a workflow block editor assistant. The user has a Pilos workflow and wants to modify it.

${WORKFLOW_RUNTIME_GUIDE}

CURRENT WORKFLOW JSON:
\`\`\`json
${currentJson}
\`\`\`

USER REQUEST: ${userMessage}

RESPONSE FORMAT — return ONLY a JSON object (no markdown, no extra text):
{
  "action": "replace",
  "nodes": [...],
  "edges": [...],
  "message": "brief description of what was changed"
}

If the request is a question or explanation, return:
{
  "action": "explain",
  "message": "your explanation here"
}

RULES:
- Preserve existing node IDs when possible
- Keep positions reasonable (start at y:100, space ~150px apart vertically)
- Every node needs both top-level "type" AND data.type (same value)
- Every workflow must have exactly one start node
`
}

interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; isError?: boolean }

const AI_SUGGESTIONS = [
  'Add a Slack notification at the end',
  'Add error handling with condition nodes',
  'Explain what this workflow does',
  'Add a retry loop around failed steps',
]

// ── Main component ─────────────────────────────────────────────────────────────

export function WorkflowCodeEditor({ onClose }: { onClose: () => void }) {
  const storeNodes = useWorkflowStore((s) => s.nodes)
  const storeEdges = useWorkflowStore((s) => s.edges)
  const pushHistory = useWorkflowStore((s) => s.pushHistory)

  const [workNodes, setWorkNodes] = useState<Node<WorkflowNodeData>[]>(() => storeNodes)
  const [workEdges, setWorkEdges] = useState<Edge[]>(() => storeEdges)
  const [updateKey, setUpdateKey] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showAddPicker, setShowAddPicker] = useState(false)

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const sortedNodes = useMemo(
    () => [...workNodes].sort((a, b) => a.position.y - b.position.y),
    [workNodes],
  )

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return sortedNodes
    const q = search.toLowerCase()
    return sortedNodes.filter((n) =>
      n.data.label.toLowerCase().includes(q) || n.data.type.toLowerCase().includes(q),
    )
  }, [sortedNodes, search])

  const validationCount = useMemo(() => filteredNodes.filter((n) => validateNode(n)).length, [filteredNodes])

  const updateNode = useCallback((id: string, patch: Partial<WorkflowNodeData>) => {
    setWorkNodes((prev) => prev.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
  }, [])

  const deleteNode = useCallback((id: string) => {
    setWorkNodes((prev) => prev.filter((n) => n.id !== id))
    setWorkEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
    if (expandedId === id) setExpandedId(null)
  }, [expandedId])

  const addNode = useCallback((type: string) => {
    const maxY = workNodes.reduce((m, n) => Math.max(m, n.position.y), 0)
    const id = `${type.toUpperCase()}_${Date.now()}`
    const newNode: Node<WorkflowNodeData> = {
      id,
      type,
      position: { x: 300, y: maxY + 160 },
      data: { type: type as WorkflowNodeData['type'], label: NODE_TYPE_LABELS[type] || type },
    }
    setWorkNodes((prev) => [...prev, newNode])
    setExpandedId(id)
  }, [workNodes])

  // Drag-to-reorder
  const handleDragStart = useCallback((id: string) => setDragId(id), [])
  const handleDragOver = useCallback((id: string, e: React.DragEvent) => { e.preventDefault(); setDragOverId(id) }, [])
  const handleDrop = useCallback((targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    setWorkNodes((prev) => {
      const sorted = [...prev].sort((a, b) => a.position.y - b.position.y)
      const fromIdx = sorted.findIndex((n) => n.id === dragId)
      const toIdx = sorted.findIndex((n) => n.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const reordered = [...sorted]
      const [moved] = reordered.splice(fromIdx, 1)
      reordered.splice(toIdx, 0, moved)
      // Reassign Y positions
      return reordered.map((n, i) => ({ ...n, position: { ...n.position, y: 100 + i * 160 } }))
    })
    setDragId(null)
    setDragOverId(null)
  }, [dragId])

  const handleReset = useCallback(() => {
    setWorkNodes(storeNodes); setWorkEdges(storeEdges)
    setUpdateKey((k) => k + 1); setExpandedId(null); setSearch('')
  }, [storeNodes, storeEdges])

  const handleApply = useCallback(() => {
    pushHistory()
    const typed = normalizeNodeTypes(workNodes as unknown as Array<Record<string, unknown>>)
    const hydrated = hydrateToolNodes(typed)
    const validated = validateAiPromptNodes(hydrated, workEdges)
    useWorkflowStore.setState({ nodes: validated, edges: workEdges.map((e) => ({ ...e, type: e.type || 'dashed' })), selectedNodeId: null })
    onClose()
  }, [workNodes, workEdges, pushHistory, onClose])

  // ── AI chat ────────────────────────────────────────────────────────────────

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamText, setStreamText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamText])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isGenerating) return
    setInput('')
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setIsGenerating(true); setStreamText('')
    const sessionId = `wf-code-${Date.now()}`

    try {
      const currentJson = JSON.stringify({ nodes: workNodes, edges: workEdges }, null, 2)
      const prompt = buildCodeEditorPrompt(currentJson, text)
      const workingDirectory = (await import('../../../store/useProjectStore')).useProjectStore.getState().activeProjectPath || undefined

      const result = await new Promise<{ action: string; nodes?: unknown[]; edges?: unknown[]; message: string }>((resolve, reject) => {
        let resultText = ''
        const unsub = api.claude.onEvent((event: ClaudeEvent) => {
          if (event.sessionId !== sessionId) return
          if (event.type === 'content_block_delta') {
            const delta = event.delta as { type: string; text?: string }
            if (delta?.type === 'text_delta' && delta.text) { resultText += delta.text; setStreamText(resultText) }
          }
          if (event.type === 'result') {
            unsub()
            let finalText = resultText
            const rawResult = event.result
            if (typeof rawResult === 'string') finalText = rawResult
            else if (rawResult && typeof rawResult === 'object') {
              const ro = rawResult as { content?: Array<{ type: string; text?: string }> }
              if (ro.content) {
                const ex = ro.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map((b) => b.text).join('')
                if (ex) finalText = ex
              }
            }
            try {
              const cleaned = extractJson(finalText)
              const parsed = JSON.parse(cleaned)
              resolve({ action: parsed.action || 'explain', nodes: parsed.nodes, edges: parsed.edges, message: parsed.message || 'Done.' })
            } catch { reject(new Error('AI returned invalid JSON. Try rephrasing.')) }
          }
        })
        api.claude.startSession(sessionId, { prompt, resume: false, workingDirectory, model: 'sonnet', permissionMode: 'plan' })
          .catch((err: unknown) => { unsub(); reject(new Error(`Failed: ${err instanceof Error ? err.message : 'Unknown'}`)) })
        setTimeout(() => { unsub(); reject(new Error('Request timed out.')) }, 180_000)
      })

      setStreamText('')
      if (result.action === 'replace' && result.nodes) {
        const typed = normalizeNodeTypes(result.nodes as Array<Record<string, unknown>>)
        setWorkNodes(hydrateToolNodes(typed))
        setWorkEdges((result.edges || []) as Edge[])
        setUpdateKey((k) => k + 1); setExpandedId(null)
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `${result.message}\n\nBlocks updated — review and click Apply.` }])
      } else {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: result.message }])
      }
    } catch (err) {
      setStreamText('')
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: err instanceof Error ? err.message : 'Unknown error', isError: true }])
    } finally { setIsGenerating(false) }
  }, [input, isGenerating, workNodes, workEdges])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSend() }
  }, [handleSend])

  const isDirty = workNodes !== storeNodes || workEdges !== storeEdges

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0f0f11]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-800 flex-shrink-0">
        <Icon icon="lucide:layout-list" className="text-violet-400 text-sm" />
        <span className="text-xs font-bold text-white flex-1">Workflow Block Editor</span>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-[9px] text-amber-400 font-medium px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">unsaved</span>}
          {validationCount > 0 && <span className="text-[9px] text-amber-400 font-medium px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">{validationCount} warning{validationCount > 1 ? 's' : ''}</span>}
          <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700">
            <Icon icon="lucide:rotate-ccw" className="text-[10px]" /> Reset
          </button>
          <button onClick={handleApply} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg shadow-blue-500/20">
            <Icon icon="lucide:check" className="text-[10px]" /> Apply to Canvas
          </button>
          <div className="w-px h-4 bg-zinc-800" />
          <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700">
            <Icon icon="lucide:x" className="text-[10px]" /> Close
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Node list pane */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 flex-shrink-0">
            {/* Search */}
            <div className="flex-1 relative">
              <Icon icon="lucide:search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Filter nodes…"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-zinc-600"
              />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"><Icon icon="lucide:x" className="text-[10px]" /></button>}
            </div>
            {/* Stats */}
            <span className="text-[9px] text-zinc-700 flex-shrink-0">{filteredNodes.length}/{workNodes.length}</span>
            {/* Collapse / Expand all */}
            <button onClick={() => setExpandedId(null)} title="Collapse all" className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors">
              <Icon icon="lucide:chevrons-up-down" className="text-[10px]" />
            </button>
            {/* Add node */}
            <div className="relative">
              <button onClick={() => setShowAddPicker((v) => !v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-colors">
                <Icon icon="lucide:plus" className="text-[10px]" /> Add Node
              </button>
              {showAddPicker && <AddNodePicker onAdd={addNode} onClose={() => setShowAddPicker(false)} />}
            </div>
          </div>

          {/* Node list with flow line */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
            {filteredNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Icon icon="lucide:search-x" className="text-zinc-700 text-2xl mb-2" />
                <p className="text-xs text-zinc-600">No nodes match "{search}"</p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical flow line */}
                <div className="absolute left-[27px] top-4 bottom-4 w-px bg-gradient-to-b from-zinc-700/50 via-zinc-700/30 to-transparent pointer-events-none" />

                {filteredNodes.map((node, index) => {
                  const meta = NODE_META[node.data.type] || DEFAULT_META
                  return (
                    <div key={node.id}
                      draggable
                      onDragStart={() => handleDragStart(node.id)}
                      onDragOver={(e) => handleDragOver(node.id, e)}
                      onDrop={() => handleDrop(node.id)}
                      onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                      className={`relative mb-2 transition-opacity ${dragId && dragId !== node.id ? 'opacity-70' : ''}`}
                    >
                      {/* Flow dot */}
                      <div className={`absolute left-[22px] top-[18px] w-2.5 h-2.5 rounded-full z-10 border-2 border-[#0f0f11] ${meta.dot} shadow-sm ${meta.glow}`} />

                      {/* Card offset right of flow line */}
                      <div className="ml-10">
                        <NodeCard
                          node={node} edges={workEdges} allNodes={workNodes}
                          expanded={expandedId === node.id}
                          onToggle={() => setExpandedId((id) => id === node.id ? null : node.id)}
                          onDelete={() => deleteNode(node.id)}
                          updateNode={updateNode} uk={updateKey}
                          isDragOver={dragOverId === node.id}
                          dragHandleProps={{}}
                        />
                      </div>

                      {/* Connection arrow between cards */}
                      {index < filteredNodes.length - 1 && (
                        <div className="ml-[26px] flex items-center h-2 mt-0">
                          <div className="w-px h-2 bg-zinc-700/50" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* AI chat pane */}
        <div className="w-80 flex flex-col flex-shrink-0 border-l border-zinc-800">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
            <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Icon icon="lucide:sparkles" className="text-[10px] text-purple-400" />
            </div>
            <span className="text-xs font-bold text-white">AI Assistant</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-2">
            {messages.length === 0 && !isGenerating && (
              <div className="py-6 text-center">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-3">
                  <Icon icon="lucide:wand-2" className="text-purple-400 text-sm" />
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed mb-4">Ask the AI to modify the workflow. Changes appear in the blocks — review then Apply.</p>
                <div className="space-y-1.5">
                  {AI_SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => setInput(s)} className="w-full text-left px-2.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] text-zinc-500 hover:text-white hover:border-zinc-700 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user' ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100'
                  : msg.isError ? 'bg-red-500/5 border border-red-500/20 text-red-300'
                  : 'bg-zinc-800/80 border border-zinc-700/50 text-zinc-300'
                }`}>{msg.content}</div>
              </div>
            ))}

            {isGenerating && (
              <div className="flex justify-start">
                <div className="px-3 py-2.5 rounded-xl bg-zinc-800/80 border border-purple-500/20 text-xs">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon icon="lucide:loader-2" className="text-[10px] text-purple-400 animate-spin" />
                    <span className="text-[10px] text-purple-300 font-medium">Generating…</span>
                  </div>
                  {streamText && <div className="text-[9px] font-mono text-zinc-600 max-h-14 overflow-hidden">{streamText.slice(-200)}</div>}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="px-3 py-3 border-t border-zinc-800 flex-shrink-0">
            <div className="flex gap-2">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Describe changes…" rows={2} disabled={isGenerating}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-zinc-600 resize-none disabled:opacity-50" />
              <button onClick={handleSend} disabled={!input.trim() || isGenerating} title="Send (Cmd+Enter)"
                className="self-end flex items-center justify-center w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20">
                <Icon icon={isGenerating ? 'lucide:loader-2' : 'lucide:send'} className={`text-xs ${isGenerating ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-right text-[9px] text-zinc-800 mt-1">Cmd+Enter</p>
          </div>
        </div>
      </div>
    </div>
  )
}
