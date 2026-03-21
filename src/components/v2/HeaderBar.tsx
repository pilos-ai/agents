import { Icon } from '../common/Icon'
import { TokenMeter } from './components/TokenMeter'
import { useConversationStore } from '../../store/useConversationStore'
import { useUsageStore } from '../../store/useUsageStore'

interface HeaderBarProps {
  actionLabel?: string
  actionIcon?: string
  onAction?: () => void
  onOpenPalette?: () => void
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function HeaderBar({ actionLabel, actionIcon, onAction, onOpenPalette }: HeaderBarProps) {
  const hasActiveSession = useConversationStore((s) => s.hasActiveSession)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const limits = useUsageStore((s) => s.limits)
  const stats = useUsageStore((s) => s.stats)

  const systemStatus = isStreaming ? 'Active' : hasActiveSession ? 'Running' : 'Idle'
  const statusColor = isStreaming ? 'text-orange-400' : hasActiveSession ? 'text-blue-400' : 'text-zinc-500'
  const dotColor = isStreaming ? 'bg-orange-400' : hasActiveSession ? 'bg-blue-400' : 'bg-zinc-600'

  // Rate limit data from Anthropic API
  // If the window object exists, show 0% rather than hiding (null = no data at all)
  const sessionUsage = limits?.five_hour != null ? (limits.five_hour.utilization ?? 0) : null
  const weekUsage = limits?.seven_day != null ? (limits.seven_day.utilization ?? 0) : null
  const opusUsage = limits?.seven_day_opus != null ? (limits.seven_day_opus.utilization ?? 0) : null

  // Primary ring shows session usage
  const ringPercent = sessionUsage ?? 0
  const ringColor = ringPercent > 80 ? '#ef4444' : ringPercent > 50 ? '#f59e0b' : '#3b82f6'

  // Fallback stats from local cache when limits API unavailable
  const totalMsgs = stats?.totalMessages
  const totalSessions = stats?.totalSessions

  return (
    <div className="h-12 border-b border-pilos-border bg-pilos-bg flex items-center px-4 gap-4 flex-shrink-0">
      {/* Command Palette */}
      <button
        onClick={onOpenPalette}
        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/80 border border-zinc-700 rounded-lg hover:border-zinc-500 hover:bg-zinc-800 transition-colors flex-1 max-w-[400px]"
      >
        <Icon icon="lucide:search" className="text-zinc-400 text-sm" />
        <span className="text-xs text-zinc-400 flex-1 text-left">Command Palette</span>
        <kbd className="text-[10px] text-zinc-400 bg-zinc-700/80 border border-zinc-600 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      <div className="flex-1" />

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${isStreaming ? 'animate-pulse' : ''}`} />
        <span className={`text-[10px] font-medium ${statusColor}`}>
          {systemStatus}
        </span>
      </div>

      <div className="w-px h-5 bg-pilos-border" />

      {/* Stats */}
      <div className="flex items-center gap-2.5">
        {sessionUsage !== null ? (
          <>
            <div title={`Session: ${Math.round(sessionUsage)}% used${limits?.five_hour?.resets_at ? ` · Resets ${new Date(limits.five_hour.resets_at).toLocaleTimeString()}` : ''}`}>
              <span className="text-[10px] text-zinc-500">Session</span>
              <span className="text-[11px] text-zinc-300 font-mono tabular-nums ml-1">{Math.round(sessionUsage)}%</span>
            </div>
            {weekUsage !== null && (
              <div title={`Weekly: ${Math.round(weekUsage)}% used`}>
                <span className="text-[10px] text-zinc-500">Week</span>
                <span className="text-[11px] text-zinc-300 font-mono tabular-nums ml-1">{Math.round(weekUsage)}%</span>
              </div>
            )}
            {opusUsage !== null && (
              <div title={`Opus weekly: ${Math.round(opusUsage)}% used`}>
                <span className="text-[10px] text-zinc-500">Opus</span>
                <span className="text-[11px] text-zinc-300 font-mono tabular-nums ml-1">{Math.round(opusUsage)}%</span>
              </div>
            )}
          </>
        ) : (
          <>
            {totalMsgs != null && (
              <div title={`Total messages: ${totalMsgs.toLocaleString()}`}>
                <span className="text-[10px] text-zinc-500">Msgs</span>
                <span className="text-[11px] text-zinc-300 font-mono tabular-nums ml-1">{fmtNum(totalMsgs)}</span>
              </div>
            )}
            {totalSessions != null && (
              <div title={`Total sessions: ${totalSessions}`}>
                <span className="text-[10px] text-zinc-500">Sessions</span>
                <span className="text-[11px] text-zinc-300 font-mono tabular-nums ml-1">{totalSessions}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="w-px h-5 bg-pilos-border" />

      {/* Session Usage Ring */}
      {sessionUsage !== null && (
        <>
          <div title={`Session: ${Math.round(sessionUsage)}% used`}>
            <TokenMeter
              used={ringPercent}
              total={100}
              size={38}
              color={ringColor}
              label={`${Math.round(ringPercent)}%`}
            />
          </div>
          <div className="w-px h-5 bg-pilos-border" />
        </>
      )}

      {/* Action Button */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
        >
          {actionIcon && <Icon icon={actionIcon} className="text-xs" />}
          {actionLabel}
        </button>
      )}
    </div>
  )
}
