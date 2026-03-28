import { useState, useMemo, useEffect, useRef } from 'react'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { getUpstreamNodes, getNodeOutputSchema, schemaToPickerFields, mergeRuntimeData, TYPE_COLORS } from './DataPicker'
import type { PickerField } from './DataPicker'

interface Suggestion {
  ref: string
  label: string
  nodeLabel: string
  type: string
  preview?: string
}

function flattenFields(fields: PickerField[], nodeId: string, nodeLabel: string, results: Suggestion[]) {
  for (const field of fields) {
    results.push({
      ref: `{{${nodeId}.${field.path}}}`,
      label: field.label,
      nodeLabel,
      type: field.type,
      preview: field.preview,
    })
    if (field.children) flattenFields(field.children, nodeId, nodeLabel, results)
  }
}

interface InlineSuggestionsProps {
  currentNodeId: string
  query: string
  anchorEl: HTMLElement | null
  caretRect?: DOMRect | null
  onSelect: (ref: string) => void
  onClose: () => void
}

export function InlineSuggestions({ currentNodeId, query, anchorEl, caretRect, onSelect, onClose }: InlineSuggestionsProps) {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const execution = useWorkflowStore((s) => s.execution)
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const allSuggestions = useMemo((): Suggestion[] => {
    const upstream = getUpstreamNodes(currentNodeId, nodes, edges)
    const results: Suggestion[] = []

    // Loop context items
    const isInsideLoop = upstream.find((n) => n.data.type === 'loop')
    if (isInsideLoop) {
      results.push({ ref: '{{_loopItem}}', label: 'Current Item', nodeLabel: 'Loop', type: 'object' })
      results.push({ ref: '{{_loopIndex}}', label: 'Loop Index', nodeLabel: 'Loop', type: 'number' })
    }

    for (const node of upstream) {
      const nodeLabel = node.data.label
      // Entire output reference
      results.push({ ref: `{{${node.id}}}`, label: 'Entire output', nodeLabel, type: 'object' })

      const schema = getNodeOutputSchema(node)
      let fields = schemaToPickerFields(schema, '')
      const stepResult = execution?.stepResults?.filter((r) => r.nodeId === node.id).pop()
      if (stepResult?.output) {
        fields = mergeRuntimeData(fields, stepResult.output, '')
      }
      flattenFields(fields, node.id, nodeLabel, results)
    }

    return results
  }, [currentNodeId, nodes, edges, execution])

  const filtered = useMemo(() => {
    if (!query) return allSuggestions.slice(0, 25)
    const q = query.toLowerCase()
    return allSuggestions
      .filter((s) =>
        s.label.toLowerCase().includes(q) ||
        s.ref.toLowerCase().includes(q) ||
        s.nodeLabel.toLowerCase().includes(q),
      )
      .slice(0, 25)
  }, [allSuggestions, query])

  // Reset active index when filtered list changes
  useEffect(() => setActiveIndex(0), [filtered])

  // Keyboard navigation via the textarea
  useEffect(() => {
    if (!anchorEl || filtered.length === 0) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        onSelect(filtered[activeIndex]?.ref ?? filtered[0].ref)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    anchorEl.addEventListener('keydown', handleKeyDown)
    return () => anchorEl.removeEventListener('keydown', handleKeyDown)
  }, [anchorEl, filtered, activeIndex, onSelect, onClose])

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[activeIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Position near caret (preferred) or below anchor element as fallback
  const style = useMemo(() => {
    if (!anchorEl) return {}
    const rect = caretRect ?? anchorEl.getBoundingClientRect()
    const popoverW = 300
    const popoverH = 260
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = rect.left
    if (left + popoverW > vw - 8) left = Math.max(8, vw - popoverW - 8)
    // Prefer below caret, flip above if not enough room
    let top = rect.bottom + 4
    if (top + popoverH > vh - 8) top = rect.top - popoverH - 4
    if (top < 8) top = 8
    return { position: 'fixed' as const, top, left, zIndex: 9999 }
  }, [anchorEl, caretRect])

  if (!anchorEl || filtered.length === 0) return null

  return (
    <div style={style} className="w-[300px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
      {/* Query preview */}
      {query && (
        <div className="px-3 py-1.5 border-b border-zinc-800 flex items-center gap-1.5">
          <span className="text-[9px] text-zinc-600">inserting</span>
          <span className="text-[9px] font-mono text-blue-400">{'{{'}{query}</span>
        </div>
      )}

      {/* Suggestions list */}
      <div ref={listRef} className="max-h-52 overflow-y-auto custom-scrollbar">
        {filtered.map((s, i) => (
          <button
            key={s.ref}
            onMouseDown={(e) => { e.preventDefault(); onSelect(s.ref) }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
              i === activeIndex ? 'bg-zinc-700/80' : 'hover:bg-zinc-800'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-200 truncate">{s.label}</span>
                <span className={`text-[9px] font-mono flex-shrink-0 ${TYPE_COLORS[s.type] || 'text-zinc-600'}`}>
                  {s.type}
                </span>
              </div>
              <div className="text-[9px] text-zinc-600 truncate">{s.nodeLabel}</div>
            </div>
            {s.preview && (
              <span className="text-[9px] text-zinc-600 truncate max-w-[60px] flex-shrink-0">{s.preview}</span>
            )}
          </button>
        ))}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1 border-t border-zinc-800 flex items-center gap-2 text-[9px] text-zinc-700">
        <span>↑↓ navigate</span>
        <span>↵/Tab insert</span>
        <span>Esc dismiss</span>
      </div>
    </div>
  )
}
