import { useState, useMemo, useEffect, useRef } from 'react'
import { Icon } from '../../common/Icon'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { WORKFLOW_TOOL_CATEGORIES, LOOP_COLLECTION_OUTPUT, LOOP_COUNT_OUTPUT, VARIABLE_OUTPUT, CONDITION_OUTPUT, DELAY_OUTPUT, AI_PROMPT_OUTPUT } from '../../../data/workflow-tools'
import type { OutputField, WorkflowNodeData } from '../../../types/workflow'
import type { Node, Edge } from '@xyflow/react'

interface DataPickerProps {
  currentNodeId: string
  onSelect: (templateRef: string) => void
  filterArrays?: boolean
  anchorEl: HTMLElement | null
  onClose: () => void
}

interface PickerNode {
  id: string
  label: string
  type: WorkflowNodeData['type']
  fields: PickerField[]
}

interface PickerField {
  key: string
  label: string
  type: OutputField['type']
  path: string
  preview?: string
  children?: PickerField[]
}

/** Walk graph backwards from currentNodeId to find all upstream nodes */
function getUpstreamNodes(currentNodeId: string, nodes: Node<WorkflowNodeData>[], edges: Edge[]): Node<WorkflowNodeData>[] {
  const visited = new Set<string>()
  const queue = [currentNodeId]
  const result: Node<WorkflowNodeData>[] = []

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)

    const incoming = edges.filter((e) => e.target === id)
    for (const edge of incoming) {
      const sourceNode = nodes.find((n) => n.id === edge.source)
      if (sourceNode && sourceNode.data.type !== 'start' && !visited.has(sourceNode.id)) {
        result.push(sourceNode)
        queue.push(sourceNode.id)
      }
    }
  }

  return result
}

/** Get output schema for a node based on its type and tool definition */
function getNodeOutputSchema(node: Node<WorkflowNodeData>): OutputField[] {
  const d = node.data
  if (d.type === 'mcp_tool' && d.toolId) {
    for (const cat of WORKFLOW_TOOL_CATEGORIES) {
      const tool = cat.tools.find((t) => t.id === d.toolId)
      if (tool?.outputSchema) return tool.outputSchema
    }
    return []
  }
  if (d.type === 'loop') {
    return d.loopType === 'collection' ? LOOP_COLLECTION_OUTPUT : LOOP_COUNT_OUTPUT
  }
  if (d.type === 'variable') return VARIABLE_OUTPUT
  if (d.type === 'condition') return CONDITION_OUTPUT
  if (d.type === 'delay') return DELAY_OUTPUT
  if (d.type === 'ai_prompt') return AI_PROMPT_OUTPUT
  return []
}

/** Convert OutputField[] to PickerField[] with full dotted paths */
function schemaToPickerFields(schema: OutputField[], prefix: string): PickerField[] {
  return schema.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    path: prefix ? `${prefix}.${field.key}` : field.key,
    children: field.children ? schemaToPickerFields(field.children, prefix ? `${prefix}.${field.key}` : field.key) : undefined,
  }))
}

/** Merge runtime execution data into picker fields (adds previews) */
function mergeRuntimeData(fields: PickerField[], output: unknown, prefix: string): PickerField[] {
  if (!output || typeof output !== 'object') return fields

  const obj = output as Record<string, unknown>

  // If schema is empty but we have runtime data, build fields from runtime
  if (fields.length === 0) {
    return Object.entries(obj).map(([key, val]) => {
      const path = prefix ? `${prefix}.${key}` : key
      const isArr = Array.isArray(val)
      let preview = ''
      if (isArr) preview = `array[${val.length}]`
      else if (typeof val === 'string') preview = val.length > 30 ? val.slice(0, 30) + '...' : val
      else if (typeof val === 'number' || typeof val === 'boolean') preview = String(val)
      else if (val && typeof val === 'object') preview = '{...}'

      return {
        key,
        label: key,
        type: (isArr ? 'array' : typeof val === 'number' ? 'number' : typeof val === 'boolean' ? 'boolean' : typeof val === 'object' ? 'object' : 'string') as OutputField['type'],
        path,
        preview,
        children: val && typeof val === 'object' && !isArr ? mergeRuntimeData([], val, path) : undefined,
      }
    })
  }

  // Merge previews into existing schema fields
  return fields.map((field) => {
    const val = obj[field.key]
    let preview = field.preview || ''
    if (val !== undefined) {
      if (Array.isArray(val)) preview = `array[${val.length}]`
      else if (typeof val === 'string') preview = val.length > 30 ? val.slice(0, 30) + '...' : val
      else if (typeof val === 'number' || typeof val === 'boolean') preview = String(val)
      else if (val && typeof val === 'object') preview = '{...}'
    }

    return {
      ...field,
      preview,
      children: field.children && val && typeof val === 'object' && !Array.isArray(val)
        ? mergeRuntimeData(field.children, val, field.path)
        : field.children,
    }
  })
}

const TYPE_COLORS: Record<string, string> = {
  string: 'text-emerald-500',
  number: 'text-blue-500',
  boolean: 'text-amber-500',
  array: 'text-purple-500',
  object: 'text-zinc-500',
}

function FieldRow({ field, nodeId, onSelect, filterArrays, depth = 0 }: {
  field: PickerField
  nodeId: string
  onSelect: (ref: string) => void
  filterArrays?: boolean
  depth?: number
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = field.children && field.children.length > 0
  const ref = `{{${nodeId}.${field.path}}}`

  if (filterArrays && field.type !== 'array') return null

  return (
    <div>
      <button
        onClick={() => hasChildren ? setExpanded(!expanded) : onSelect(ref)}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-800 transition-colors group text-left"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        title={ref}
      >
        {hasChildren ? (
          <Icon icon={expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'} className="text-[9px] text-zinc-600 flex-shrink-0" />
        ) : (
          <span className="w-[9px] flex-shrink-0" />
        )}
        <span className="text-[10px] text-zinc-300 truncate flex-1">{field.label}</span>
        <span className={`text-[9px] font-mono ${TYPE_COLORS[field.type] || 'text-zinc-600'}`}>{field.type}</span>
        {field.preview && (
          <span className="text-[9px] text-zinc-700 truncate max-w-[80px]">{field.preview}</span>
        )}
        {!hasChildren && (
          <Icon icon="lucide:plus" className="text-[9px] text-zinc-700 opacity-0 group-hover:opacity-100 flex-shrink-0" />
        )}
      </button>
      {hasChildren && expanded && field.children!.map((child) => (
        <FieldRow key={child.key} field={child} nodeId={nodeId} onSelect={onSelect} filterArrays={filterArrays} depth={depth + 1} />
      ))}
    </div>
  )
}

export function DataPicker({ currentNodeId, onSelect, filterArrays, anchorEl, onClose }: DataPickerProps) {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const execution = useWorkflowStore((s) => s.execution)
  const [search, setSearch] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as HTMLElement) && anchorEl && !anchorEl.contains(e.target as HTMLElement)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [anchorEl, onClose])

  // Build picker data
  const pickerNodes = useMemo((): PickerNode[] => {
    const upstream = getUpstreamNodes(currentNodeId, nodes, edges)
    const q = search.toLowerCase()

    return upstream.map((node) => {
      const schema = getNodeOutputSchema(node)
      let fields = schemaToPickerFields(schema, '')

      // Merge runtime data if available
      const stepResult = execution?.stepResults?.filter((r) => r.nodeId === node.id).pop()
      if (stepResult?.output) {
        fields = mergeRuntimeData(fields, stepResult.output, '')
      }

      // Filter by search
      if (q) {
        fields = fields.filter((f) =>
          f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q) ||
          f.children?.some((c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
        )
      }

      return {
        id: node.id,
        label: node.data.label,
        type: node.data.type,
        fields,
      }
    }).filter((n) => n.fields.length > 0)
  }, [currentNodeId, nodes, edges, execution, search])

  // Check if we're inside a loop body (for _loopItem fields)
  const isInsideLoop = useMemo(() => {
    // Walk backwards to find a loop node
    const upstream = getUpstreamNodes(currentNodeId, nodes, edges)
    return upstream.find((n) => n.data.type === 'loop')
  }, [currentNodeId, nodes, edges])

  // Position popover with viewport boundary checks
  const style = useMemo(() => {
    if (!anchorEl) return {}
    const rect = anchorEl.getBoundingClientRect()
    const popoverW = 288 // w-72 = 18rem = 288px
    const popoverH = 320 // approximate max height
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Horizontal: prefer left-aligned, fall back to right-aligned
    let left = rect.left
    if (left + popoverW > vw - 8) {
      left = rect.right - popoverW
    }
    if (left < 8) left = 8

    // Vertical: prefer below, fall back to above
    let top = rect.bottom + 4
    if (top + popoverH > vh - 8) {
      top = rect.top - popoverH - 4
    }
    if (top < 8) top = 8

    return {
      position: 'fixed' as const,
      top,
      left,
      zIndex: 9999,
    }
  }, [anchorEl])

  if (!anchorEl) return null

  return (
    <div ref={popoverRef} style={style} className="w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
      {/* Search */}
      <div className="p-2 border-b border-zinc-800">
        <div className="relative">
          <Icon icon="lucide:search" className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600 text-[10px]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter fields..."
            className="w-full pl-6 pr-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-white placeholder-zinc-600 outline-none focus:border-blue-500"
            autoFocus
          />
        </div>
      </div>

      {/* Fields */}
      <div className="max-h-64 overflow-y-auto custom-scrollbar p-1">
        {/* Loop context */}
        {isInsideLoop && !filterArrays && (
          <div className="mb-1">
            <div className="flex items-center gap-1.5 px-2 py-1">
              <Icon icon="lucide:repeat" className="text-[10px] text-purple-500" />
              <span className="text-[10px] font-bold text-purple-400">Loop Item</span>
            </div>
            <button
              onClick={() => onSelect('{{_loopItem}}')}
              className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-800 transition-colors text-left"
              style={{ paddingLeft: '20px' }}
            >
              <span className="text-[10px] text-zinc-300">Current Item</span>
              <span className="text-[9px] font-mono text-purple-500">object</span>
              <Icon icon="lucide:plus" className="text-[9px] text-zinc-700 ml-auto" />
            </button>
            <button
              onClick={() => onSelect('{{_loopIndex}}')}
              className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-800 transition-colors text-left"
              style={{ paddingLeft: '20px' }}
            >
              <span className="text-[10px] text-zinc-300">Loop Index</span>
              <span className="text-[9px] font-mono text-blue-500">number</span>
              <Icon icon="lucide:plus" className="text-[9px] text-zinc-700 ml-auto" />
            </button>
          </div>
        )}

        {/* Upstream nodes */}
        {pickerNodes.map((pNode) => (
          <div key={pNode.id} className="mb-1">
            <div className="flex items-center gap-1.5 px-2 py-1">
              <Icon icon="lucide:circle-dot" className="text-[10px] text-zinc-600" />
              <span className="text-[10px] font-bold text-zinc-400 truncate">{pNode.label}</span>
              <span className="text-[9px] font-mono text-zinc-700">{pNode.id.slice(0, 12)}</span>
            </div>
            {/* Full node reference */}
            {!filterArrays && (
              <button
                onClick={() => onSelect(`{{${pNode.id}}}`)}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-800 transition-colors text-left"
                style={{ paddingLeft: '20px' }}
              >
                <span className="text-[10px] text-zinc-500 italic">Entire output</span>
                <Icon icon="lucide:plus" className="text-[9px] text-zinc-700 ml-auto" />
              </button>
            )}
            {pNode.fields.map((field) => (
              <FieldRow key={field.key} field={field} nodeId={pNode.id} onSelect={onSelect} filterArrays={filterArrays} />
            ))}
          </div>
        ))}

        {pickerNodes.length === 0 && !isInsideLoop && (
          <div className="flex flex-col items-center py-6 text-center">
            <Icon icon="lucide:info" className="text-zinc-700 text-lg mb-1.5" />
            <p className="text-[10px] text-zinc-600">No upstream data available</p>
            <p className="text-[9px] text-zinc-700 mt-0.5">Connect nodes to see their outputs here</p>
          </div>
        )}
      </div>
    </div>
  )
}
