import React, { useState, useMemo } from 'react'

// ── Lightweight Markdown-ish Renderer ──

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

    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++
      blocks.push({ type: 'code', content: codeLines.join('\n') })
      continue
    }

    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr', content: '' })
      i++
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length })
      i++
      continue
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', content: '', items })
      continue
    }

    if (/^\s*\|/.test(line)) {
      const tableLines: string[] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        tableLines.push(lines[i])
        i++
      }
      if (tableLines.length >= 2) {
        const parseRow = (r: string) => r.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length)
        const headers = parseRow(tableLines[0])
        const startIdx = /^\s*\|[\s:]*-+/.test(tableLines[1]) ? 2 : 1
        const tableRows = tableLines.slice(startIdx).map(parseRow)
        blocks.push({ type: 'table', content: '', headers, tableRows })
      } else {
        blocks.push({ type: 'paragraph', content: tableLines.join('\n') })
      }
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

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
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="text-white font-semibold">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={match.index} className="text-zinc-200">{match[3]}</em>)
    } else if (match[4]) {
      parts.push(<code key={match.index} className="text-xs bg-zinc-800 text-cyan-300 px-1.5 py-0.5 rounded font-mono">{match[4]}</code>)
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length > 0 ? parts : [text]
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Smart Cell Formatting ──

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
const URL_RE = /^https?:\/\//

function formatDate(s: string): string {
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86_400_000)

    if (diffDays === 0 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }
    if (diffDays === 1 || (diffDays === 0 && d.getDate() !== now.getDate())) {
      return `Yesterday ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    }
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return s }
}

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
    for (const k of ['name', 'label', 'title', 'key', 'summary', 'value', 'displayName']) {
      if (typeof obj[k] === 'string' && obj[k]) return { text: obj[k] as string }
      if (typeof obj[k] === 'number') return { text: String(obj[k]) }
    }
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.length > 0 && !URL_RE.test(v)) return { text: v }
    }
    return { text: JSON.stringify(val).slice(0, 80), style: 'text-zinc-500 font-mono text-[10px]' }
  }

  return { text: String(val) }
}

function isLowValueColumn(key: string, rows: Record<string, unknown>[]): boolean {
  const lower = key.toLowerCase()
  if (lower.includes('iconurl') || lower.includes('avatarurl') || lower === 'self' || lower === 'expand') return true
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

export function SmartDataRenderer({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <p className="text-zinc-600 italic text-sm">No output data</p>
  }

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      if (typeof parsed === 'object' && parsed !== null) {
        return <SmartDataRenderer data={parsed} />
      }
    } catch { /* not JSON */ }

    return <RenderedText text={data} />
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <p className="text-zinc-600 italic text-sm">Empty result set</p>
    }
    if (typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
      return <DataTable rows={data as Record<string, unknown>[]} />
    }
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

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const entries = Object.entries(obj)

    if (entries.length === 1 && typeof entries[0][1] === 'string') {
      return <RenderedText text={entries[0][1] as string} />
    }

    for (const key of ['result', 'data', 'output', 'results', 'content', 'text', 'body']) {
      const val = obj[key]
      if (val && (typeof val === 'string' ? val.length > 50 : true)) {
        return <SmartDataRenderer data={val} />
      }
    }

    return (
      <div className="space-y-3">
        {entries.map(([key, value]) => {
          const isComplex = (typeof value === 'object' && value !== null) ||
            (typeof value === 'string' && value.length > 200)
          if (isComplex) {
            return (
              <div key={key}>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{formatKey(key)}</span>
                <div className="mt-1.5 pl-3 border-l-2 border-pilos-border/50">
                  <SmartDataRenderer data={value} />
                </div>
              </div>
            )
          }
          const { text, style } = formatCellValue(value)
          return (
            <div key={key} className="flex items-baseline gap-3">
              <span className="text-sm text-zinc-500 font-medium shrink-0">{formatKey(key)}</span>
              <span className={`text-sm ${style || 'text-zinc-300'}`}>{text}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return <span className="text-sm text-zinc-300">{String(data)}</span>
}
