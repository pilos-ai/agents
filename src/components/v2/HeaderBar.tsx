import { useMemo } from 'react'
import { Icon } from '../common/Icon'
import { TokenMeter } from './components/TokenMeter'
import { useConversationStore } from '../../store/useConversationStore'
import { useAnalyticsStore, computeSummary } from '../../store/useAnalyticsStore'

interface HeaderBarProps {
  actionLabel?: string
  actionIcon?: string
  onAction?: () => void
}

export function HeaderBar({ actionLabel, actionIcon, onAction }: HeaderBarProps) {
  const hasActiveSession = useConversationStore((s) => s.hasActiveSession)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const entries = useAnalyticsStore((s) => s.entries)
  const summary = useMemo(() => computeSummary(entries), [entries])

  const systemStatus = isStreaming ? 'Active' : hasActiveSession ? 'Running' : 'Stable'
  const loadColor = isStreaming ? 'bg-orange-500' : hasActiveSession ? 'bg-blue-500' : 'bg-emerald-500'
  const loadWidth = isStreaming ? '65%' : hasActiveSession ? '35%' : '15%'

  const tokenStr = summary.totalTokens > 1000
    ? `${(summary.totalTokens / 1000).toFixed(1)}k`
    : String(summary.totalTokens)
  const tokenTotal = Math.max(summary.totalTokens, 50000)
  const tokenPercent = Math.round((summary.totalTokens / tokenTotal) * 100)

  return (
    <div className="h-12 border-b border-pilos-border bg-pilos-bg flex items-center px-4 gap-4 flex-shrink-0">
      {/* Command Palette */}
      <button className="flex items-center gap-2 px-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg hover:border-zinc-600 transition-colors flex-1 max-w-[400px]">
        <Icon icon="lucide:search" className="text-zinc-600 text-xs" />
        <span className="text-xs text-zinc-600 flex-1 text-left">Command Palette</span>
        <span className="text-[10px] text-zinc-700 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">⌘+K</span>
      </button>

      <div className="flex-1" />

      {/* System Load */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">System Load</span>
        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${loadColor}`}
            style={{ width: loadWidth }}
          />
        </div>
        <span className={`text-[10px] font-medium ${
          isStreaming ? 'text-orange-400' : hasActiveSession ? 'text-blue-400' : 'text-emerald-400'
        }`}>
          {systemStatus}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-pilos-border" />

      {/* Token Usage */}
      <div className="flex items-center gap-2.5">
        <div>
          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Token Usage</span>
          <span className="text-[10px] text-zinc-400 font-mono">{tokenStr} / {tokenTotal > 1000 ? `${(tokenTotal / 1000).toFixed(0)}k` : tokenTotal}</span>
        </div>
        <TokenMeter
          used={summary.totalTokens}
          total={tokenTotal}
          size={32}
          label={`${tokenPercent}%`}
        />
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-pilos-border" />

      {/* Action Button */}
      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
        >
          {actionIcon && <Icon icon={actionIcon} className="text-xs" />}
          {actionLabel}
        </button>
      ) : (
        <button className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2">
          <Icon icon="lucide:play" className="text-xs" />
          Run Agents
        </button>
      )}
    </div>
  )
}
