import React, { useState, useMemo } from 'react'
import { Icon } from '../../common/Icon'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { useTaskStore } from '../../../store/useTaskStore'
import type { WorkflowStepResult } from '../../../types/workflow'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}m`
}

// ── Lightweight Markdown-ish Renderer ──
// Handles headings, bold, lists, code blocks, horizontal rules, line breaks

function RenderedText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text])

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3'
          const sizes = { h1: 'text-xl font-bold', h2: 'text-lg font-bold', h3: 'text-base font-semibold' }
          return <Tag key={i} className={`${sizes[Tag]} text-white leading-relaxed`}>{renderInline(block.content)}</Tag>
        }
        if (block.type === 'code') {
          return (
            <pre key={i} className="text-xs text-zinc-300 font-mono bg-zinc-900/60 rounded-lg p-4 leading-relaxed overflow-x-auto custom-scrollbar border border-pilos-border/50">
              {block.content}
            </pre>
          )
        }
        if (block.type === 'hr') {
          return <hr key={i} className="border-pilos-border" />
        }
        if (block.type === 'table' && block.headers) {
          return (
            <div key={i} className="overflow-x-auto rounded-xl border border-pilos-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-800/60 border-b border-pilos-border">
                    {block.headers.map((h, j) => (
                      <th key={j} className="text-left px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(block.tableRows || []).map((row, ri) => (
                    <tr key={ri} className="border-b border-pilos-border/40 hover:bg-zinc-800/20 transition-colors">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-4 py-2 text-zinc-300 max-w-[300px]">
                          <span className="block truncate">{renderInline(cell)}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={i} className="space-y-1 ml-1">
              {block.items!.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-zinc-300 leading-relaxed">
                  <span className="text-zinc-600 mt-1.5 text-[6px]">●</span>
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          )
        }
        // paragraph
        if (!block.content.trim()) return null
        return <p key={i} className="text-sm text-zinc-300 leading-relaxed">{renderInline(block.content)}</p>
      })}
    </div>
  )
}

interface Block {
  type: 'heading' | 'paragraph' | 'code' | 'list' | 'hr' | 'table'
  content: string
  level?: number
  items?: string[]
  headers?: string[]
  tableRows?: string[][]
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n') })
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr', content: '' })
      i++
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length })
      i++
      continue
    }

    // List items (collect consecutive)
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', content: '', items })
      continue
    }

    // Markdown table (| col | col | with separator row)
    if (/^\s*\|/.test(line)) {
      const tableLines: string[] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        tableLines.push(lines[i])
        i++
      }
      // Need at least header + separator + 1 data row, but be lenient
      if (tableLines.length >= 2) {
        const parseRow = (r: string) => r.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length)
        const headers = parseRow(tableLines[0])
        // Skip separator row (|---|---|)
        const startIdx = /^\s*\|[\s:]*-+/.test(tableLines[1]) ? 2 : 1
        const tableRows = tableLines.slice(startIdx).map(parseRow)
        blocks.push({ type: 'table', content: '', headers, tableRows })
      } else {
        blocks.push({ type: 'paragraph', content: tableLines.join('\n') })
      }
      continue
    }

    // Empty line
    if (!line.trim()) {
      i++
      continue
    }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() && !/^#{1,3}\s/.test(lines[i]) && !/^\s*[-*•]\s+/.test(lines[i]) && !lines[i].trimStart().startsWith('```') && !/^[-*_]{3,}\s*$/.test(lines[i].trim()) && !/^\s*\|/.test(lines[i])) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') })
    }
  }

  return blocks
}

function renderInline(text: string): React.ReactNode[] {
  // Handle **bold**, *italic*, `code`
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      // **bold**
      parts.push(<strong key={match.index} className="text-white font-semibold">{match[2]}</strong>)
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index} className="text-zinc-200">{match[3]}</em>)
    } else if (match[4]) {
      // `code`
      parts.push(<code key={match.index} className="text-xs bg-zinc-800 text-cyan-300 px-1.5 py-0.5 rounded font-mono">{match[4]}</code>)
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length > 0 ? parts : [text]
}

// ── Smart Cell Formatting ──

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
const URL_RE = /^https?:\/\//

/** Format a date string into a short, human-readable form */
function formatDate(s: string): string {
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86_400_000)

    // Today → "14:35"
    if (diffDays === 0 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }
    // Yesterday → "Yesterday 14:35"
    if (diffDays === 1 || (diffDays === 0 && d.getDate() !== now.getDate())) {
      return `Yesterday ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    }
    // This year → "Mar 2, 14:35"
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }
    // Older → "Mar 2, 2024"
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return s }
}

/** Extract a human-readable value from a cell. Objects → name/label/key, dates → formatted, booleans → yes/no */
function formatCellValue(val: unknown): { text: string; style?: string } {
  if (val === null || val === undefined) return { text: '—', style: 'text-zinc-700' }
  if (typeof val === 'boolean') return { text: val ? 'Yes' : 'No', style: val ? 'text-emerald-400' : 'text-zinc-500' }
  if (typeof val === 'number') return { text: String(val) }

  if (typeof val === 'string') {
    if (ISO_DATE_RE.test(val)) return { text: formatDate(val), style: 'text-zinc-400' }
    if (URL_RE.test(val)) return { text: val.length > 50 ? val.slice(0, 47) + '...' : val, style: 'text-blue-400' }
    return { text: val }
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return { text: '—', style: 'text-zinc-700' }
    const items = val.map((v) => typeof v === 'object' && v !== null ? ((v as Record<string, unknown>).name || (v as Record<string, unknown>).label || JSON.stringify(v)) : String(v))
    return { text: items.join(', ') }
  }

  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    // Extract human-readable field: name > label > title > key > summary > value
    for (const k of ['name', 'label', 'title', 'key', 'summary', 'value', 'displayName']) {
      if (typeof obj[k] === 'string' && obj[k]) return { text: obj[k] as string }
      if (typeof obj[k] === 'number') return { text: String(obj[k]) }
    }
    // Show first string field as fallback
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.length > 0 && !URL_RE.test(v)) return { text: v }
    }
    return { text: JSON.stringify(val).slice(0, 80), style: 'text-zinc-500 font-mono text-[10px]' }
  }

  return { text: String(val) }
}

/** Check if a column is mostly URLs or icon data (should be hidden) */
function isLowValueColumn(key: string, rows: Record<string, unknown>[]): boolean {
  const lower = key.toLowerCase()
  if (lower.includes('iconurl') || lower.includes('avatarurl') || lower === 'self' || lower === 'expand') return true
  // Sample first 5 rows — if >80% are URLs, hide
  const sample = rows.slice(0, 5).map((r) => r[key])
  const urlCount = sample.filter((v) => typeof v === 'string' && URL_RE.test(v)).length
  return urlCount >= Math.ceil(sample.length * 0.8)
}

// ── Data Table ──

function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState(false)

  const columnSet = new Set<string>()
  for (const row of rows.slice(0, 5)) {
    for (const key of Object.keys(row)) columnSet.add(key)
  }
  // Filter out low-value columns (icon URLs, self links, etc.), then limit to 8
  const columns = [...columnSet].filter((col) => !isLowValueColumn(col, rows)).slice(0, 8)
  const displayRows = expanded ? rows : rows.slice(0, 25)

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-pilos-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-800/60 border-b border-pilos-border">
              {columns.map((col) => (
                <th key={col} className="text-left px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                  {col.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr key={i} className="border-b border-pilos-border/40 hover:bg-zinc-800/20 transition-colors">
                {columns.map((col) => {
                  const { text, style } = formatCellValue(row[col])
                  return (
                    <td key={col} className="px-4 py-2 max-w-[300px]">
                      <span className={`block truncate ${style || 'text-zinc-300'}`}>
                        {text}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[11px] text-zinc-600">
          {rows.length} row{rows.length !== 1 ? 's' : ''}{columns.length < columnSet.size ? ` · ${columnSet.size} columns (showing ${columns.length})` : ''}
        </span>
        {rows.length > 25 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            {expanded ? 'Show fewer rows' : `Show all ${rows.length} rows`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Smart Data Renderer ──

function SmartDataRenderer({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <p className="text-zinc-600 italic text-sm">No output data</p>
  }

  // String — try JSON parse, otherwise render as formatted text
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      if (typeof parsed === 'object' && parsed !== null) {
        return <SmartDataRenderer data={parsed} />
      }
    } catch { /* not JSON */ }

    return <RenderedText text={data} />
  }

  // Array of objects → table
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <p className="text-zinc-600 italic text-sm">Empty result set</p>
    }
    if (typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
      return <DataTable rows={data as Record<string, unknown>[]} />
    }
    // Array of primitives
    return (
      <ul className="space-y-1">
        {data.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
            <span className="text-zinc-600 mt-1.5 text-[6px]">●</span>
            <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
          </li>
        ))}
      </ul>
    )
  }

  // Object with a "result" or text-like key → unwrap and render
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const entries = Object.entries(obj)

    // If single key with string value, render as text
    if (entries.length === 1 && typeof entries[0][1] === 'string') {
      return <RenderedText text={entries[0][1] as string} />
    }

    // If has a result/data/output key with substantial content, prioritize it
    for (const key of ['result', 'data', 'output', 'results', 'content', 'text', 'body']) {
      const val = obj[key]
      if (val && (typeof val === 'string' ? val.length > 50 : true)) {
        return <SmartDataRenderer data={val} />
      }
    }

    // Key-value display
    return (
      <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {entries.map(([key, value]) => {
          const { text, style } = formatCellValue(value)
          return (
            <div key={key} className="contents">
              <span className="text-sm text-zinc-500 font-medium">{key}</span>
              <span className={`text-sm ${style || 'text-zinc-300'}`}>{text}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return <span className="text-sm text-zinc-300">{String(data)}</span>
}

// ── Main Component ──

interface Props {
  onClose: () => void
}

export function WorkflowResultsCanvas({ onClose }: Props) {
  const execution = useWorkflowStore((s) => s.execution)
  const nodes = useWorkflowStore((s) => s.nodes)
  const editingTaskId = useWorkflowStore((s) => s.editingTaskId)
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === editingTaskId))
  const [showAllSteps, setShowAllSteps] = useState(false)

  // Use live execution stepResults, or fall back to the last persisted run
  const stepResults: WorkflowStepResult[] = useMemo(() => {
    if (execution?.stepResults?.length) return execution.stepResults
    // Fall back to persisted run data (most recent run)
    const latestRun = task?.runs?.[0]
    return latestRun?.stepResults || []
  }, [execution?.stepResults, task?.runs])

  // Use workflow nodes for labels; fall back to persisted task workflow nodes
  const nodeList = useMemo(() => {
    if (nodes.length > 0) return nodes
    return task?.workflow?.nodes || []
  }, [nodes, task?.workflow?.nodes])

  // Find the primary result to display:
  // 1. results_display node output
  // 2. Last meaningful step output (ai_prompt, mcp_tool — skip start/end/note)
  const resultData = useMemo(() => {
    if (!stepResults.length) return null

    const nodeMap = new Map(nodeList.map((n) => [n.id, n.data]))

    // Look for results_display node output
    for (const r of [...stepResults].reverse()) {
      const nodeData = nodeMap.get(r.nodeId)
      if (nodeData?.type === 'results_display' && r.status === 'completed' && r.output != null) {
        return { output: r.output, title: nodeData.displayTitle || nodeData.label, nodeId: r.nodeId }
      }
    }

    // Fallback: last completed step with output (skip start/end/note/variable)
    const skipTypes = new Set(['start', 'end', 'note', 'variable', 'delay'])
    for (const r of [...stepResults].reverse()) {
      const nodeData = nodeMap.get(r.nodeId)
      if (r.status === 'completed' && r.output != null && nodeData && !skipTypes.has(nodeData.type)) {
        return { output: r.output, title: nodeData.label, nodeId: r.nodeId }
      }
    }

    return null
  }, [stepResults, nodeList])

  const totalDuration = stepResults.reduce((sum, r) => sum + r.duration, 0)
  const completedCount = stepResults.filter((r) => r.status === 'completed').length
  const failedCount = stepResults.filter((r) => r.status === 'failed').length
  const hasFailures = failedCount > 0

  // Collect failed step details for error display
  const failedSteps = useMemo(() => {
    if (!stepResults.length) return []
    const nodeMap = new Map(nodeList.map((n) => [n.id, n.data]))
    return stepResults
      .filter((r) => r.status === 'failed')
      .map((r) => ({ ...r, label: nodeMap.get(r.nodeId)?.label || r.nodeId }))
  }, [stepResults, nodeList])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-pilos-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-pilos-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
          >
            <Icon icon="lucide:arrow-left" className="text-sm" />
            Back to Canvas
          </button>
          <div className="w-px h-5 bg-pilos-border" />
          <div className="flex items-center gap-2">
            <Icon icon="lucide:layout-dashboard" className="text-cyan-400 text-base" />
            <h2 className="text-sm font-bold text-white">
              {resultData?.title || 'Results'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats pills */}
          {stepResults.length > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <Icon icon={hasFailures ? 'lucide:alert-circle' : 'lucide:check-circle-2'} className={`text-xs ${hasFailures ? 'text-orange-400' : 'text-emerald-400'}`} />
                <span className="text-xs text-zinc-400">
                  {completedCount}/{completedCount + failedCount} steps
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-500">
                <Icon icon="lucide:timer" className="text-[10px]" />
                <span className="text-xs font-mono">{formatDuration(totalDuration)}</span>
              </div>
            </>
          )}
          <button
            onClick={() => setShowAllSteps(!showAllSteps)}
            className={`text-[10px] px-2.5 py-1 rounded-md transition-colors ${
              showAllSteps ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {showAllSteps ? 'Hide steps' : 'Show all steps'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!resultData && !hasFailures ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Icon icon="lucide:layout-dashboard" className="text-zinc-800 text-4xl mb-3" />
            <p className="text-sm text-zinc-500 font-medium mb-1">No results yet</p>
            <p className="text-xs text-zinc-700">Run the workflow to see data here</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-8 py-8">
            {/* Error banner */}
            {hasFailures && (
              <div className="mb-6 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Icon icon="lucide:alert-triangle" className="text-red-400 text-sm" />
                  <span className="text-sm font-bold text-red-400">
                    {failedCount} step{failedCount !== 1 ? 's' : ''} failed
                  </span>
                </div>
                <div className="space-y-1.5 ml-6">
                  {failedSteps.map((r) => (
                    <div key={r.nodeId} className="text-xs text-red-300/80">
                      <span className="font-medium text-red-300">{r.label}:</span>{' '}
                      {r.error || 'Unknown error'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Primary result */}
            {resultData && (
              <SmartDataRenderer data={resultData.output} />
            )}

            {/* All steps (collapsible) */}
            {showAllSteps && stepResults.length > 0 && (
              <div className="mt-8 pt-6 border-t border-pilos-border">
                <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4">All Steps</h3>
                <div className="space-y-3">
                  {stepResults.map((r) => {
                    const nodeData = nodeList.find((n) => n.id === r.nodeId)?.data
                    const isOk = r.status === 'completed'
                    const isFailed = r.status === 'failed'
                    return (
                      <StepRow
                        key={`${r.nodeId}-${r.startedAt}`}
                        label={nodeData?.label || r.nodeId}
                        nodeType={nodeData?.type}
                        duration={r.duration}
                        isOk={isOk}
                        isFailed={isFailed}
                        error={r.error}
                        output={r.output}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Collapsible Step Row (for "Show all steps") ──

function StepRow({ label, nodeType, duration, isOk, isFailed, error, output }: {
  label: string; nodeType?: string; duration: number; isOk: boolean; isFailed: boolean; error?: string; output?: unknown
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`rounded-lg border ${isFailed ? 'border-red-500/20' : 'border-pilos-border/50'}`}>
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2 flex items-center gap-2 text-left">
        <Icon
          icon={isOk ? 'lucide:check-circle-2' : isFailed ? 'lucide:x-circle' : 'lucide:circle'}
          className={`text-xs flex-shrink-0 ${isOk ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-zinc-600'}`}
        />
        <span className="text-xs font-medium text-zinc-300 flex-1 truncate">{label}</span>
        {nodeType && <span className="text-[9px] text-zinc-600 uppercase">{nodeType}</span>}
        <span className="text-[10px] text-zinc-600 font-mono">{formatDuration(duration)}</span>
        <Icon icon={open ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-[10px] text-zinc-600" />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-pilos-border/30">
          {isFailed && error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          {isOk && output != null && (
            <pre className="text-[10px] text-zinc-400 mt-2 whitespace-pre-wrap break-all font-mono bg-zinc-900/50 rounded p-2 max-h-[150px] overflow-y-auto custom-scrollbar">
              {typeof output === 'string' ? output.slice(0, 2000) : JSON.stringify(output, null, 2).slice(0, 2000)}
            </pre>
          )}
          {isOk && output == null && <p className="text-[10px] text-zinc-600 mt-2 italic">No output</p>}
        </div>
      )}
    </div>
  )
}
