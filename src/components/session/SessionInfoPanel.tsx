import { memo, useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useConversationStore, type ProcessLogEntry } from '../../store/useConversationStore'

const EVENT_TYPE_COLORS: Record<string, string> = {
  assistant: 'text-blue-400',
  user: 'text-green-400',
  result: 'text-purple-400',
  system: 'text-neutral-400',
  'session:started': 'text-emerald-400',
  'session:ended': 'text-orange-400',
  'session:error': 'text-red-400',
  rate_limit_event: 'text-yellow-400',
  permission_request: 'text-amber-400',
  startSession: 'text-cyan-400',
  sendMessage: 'text-cyan-400',
  raw: 'text-neutral-500',
  stderr: 'text-red-300',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

const LogEntry = memo(function LogEntry({ entry, onExpand }: { entry: ProcessLogEntry; onExpand: (entry: ProcessLogEntry) => void }) {
  const colorClass = EVENT_TYPE_COLORS[entry.eventType] || 'text-neutral-300'
  const dirArrow = entry.direction === 'in' ? '\u2190' : '\u2192'
  const dirColor = entry.direction === 'in' ? 'text-green-500' : 'text-cyan-500'

  return (
    <div
      className="flex gap-1.5 px-2 py-0.5 hover:bg-neutral-800/50 cursor-pointer font-mono text-[11px] leading-tight"
      onClick={() => onExpand(entry)}
    >
      <span className="text-neutral-600 shrink-0">{formatTime(entry.timestamp)}</span>
      <span className={`${dirColor} shrink-0`}>{dirArrow}</span>
      <span className={`${colorClass} shrink-0 font-semibold`}>{entry.eventType}</span>
      <span className="text-neutral-400 truncate">{entry.summary}</span>
    </div>
  )
})

export function SessionInfoPanel() {
  const logs = useConversationStore((s) => s.processLogs)
  const hasSession = useConversationStore((s) => s.hasActiveSession)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [expanded, setExpanded] = useState<ProcessLogEntry | null>(null)
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() =>
    filter
      ? logs.filter((l) => l.eventType.includes(filter) || l.summary.includes(filter))
      : logs,
    [logs, filter]
  )

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 10,
  })

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && filtered.length > 0) {
      virtualizer.scrollToIndex(filtered.length - 1, { align: 'end' })
    }
  }, [filtered.length, autoScroll, virtualizer])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40)
  }, [])

  if (!hasSession && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        No active session
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-neutral-800 bg-neutral-900/50">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter events..."
          className="flex-1 bg-neutral-800 text-neutral-200 text-xs px-2 py-1 rounded border border-neutral-700 outline-none focus:border-neutral-500 placeholder-neutral-500"
        />
        <span className="text-neutral-500 text-xs shrink-0">{filtered.length} events</span>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`text-xs px-1.5 py-0.5 rounded ${
            autoScroll ? 'bg-blue-900/50 text-blue-400' : 'bg-neutral-800 text-neutral-500'
          }`}
          title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
        >
          {autoScroll ? '\u2193 Auto' : '\u2193 Manual'}
        </button>
      </div>

      {/* Expanded detail view */}
      {expanded && (
        <div className="border-b border-neutral-800 bg-neutral-900 max-h-48 overflow-auto">
          <div className="flex justify-between items-center px-2 py-1 sticky top-0 bg-neutral-900 border-b border-neutral-800">
            <span className="text-xs text-neutral-400">
              {expanded.direction === 'in' ? 'Received' : 'Sent'}: {expanded.eventType}
            </span>
            <button onClick={() => setExpanded(null)} className="text-neutral-500 hover:text-neutral-300 text-xs">
              Close
            </button>
          </div>
          <pre className="text-[10px] text-neutral-300 p-2 font-mono whitespace-pre-wrap break-all">
            {(() => {
              try { return JSON.stringify(JSON.parse(expanded.raw), null, 2) } catch { return expanded.raw }
            })()}
          </pre>
        </div>
      )}

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                height: 28,
              }}
            >
              <LogEntry entry={filtered[virtualRow.index]} onExpand={setExpanded} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
