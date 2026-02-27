import { useEffect, useMemo } from 'react'
import { Icon } from '../../common/Icon'
import { StatCard } from '../components/StatCard'
import { useAnalyticsStore, computeSummary, computeTokensByDay, computeRecentEntries } from '../../../store/useAnalyticsStore'

function BarChart({ data }: { data: { date: string; tokens: number; cost: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-center">
        <div>
          <Icon icon="lucide:bar-chart-3" className="text-zinc-800 text-2xl mb-2" />
          <p className="text-xs text-zinc-600">No data yet</p>
        </div>
      </div>
    )
  }

  const maxTokens = Math.max(...data.map((d) => d.tokens), 1)

  return (
    <div className="h-48 flex items-end gap-1 px-2">
      {data.map((d) => {
        const height = (d.tokens / maxTokens) * 100
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full bg-gradient-to-t from-blue-600/60 to-blue-400/20 rounded-t transition-all duration-300 hover:from-blue-500/80 hover:to-blue-400/40 min-h-[2px]"
              style={{ height: `${Math.max(height, 2)}%` }}
            />
            <span className="text-[8px] text-zinc-700 truncate w-full text-center">
              {d.date.slice(5)}
            </span>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-zinc-800 border border-pilos-border rounded-lg px-2 py-1 whitespace-nowrap z-10">
              <p className="text-[10px] text-white font-bold">{d.tokens.toLocaleString()} tokens</p>
              <p className="text-[10px] text-zinc-400">${d.cost.toFixed(4)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ActivityTable({ entries }: { entries: ReturnType<typeof useAnalyticsStore.getState>['entries'] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Icon icon="lucide:activity" className="text-zinc-800 text-2xl mb-2" />
        <p className="text-xs text-zinc-600">No activity recorded yet</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 px-4 py-2 border-b border-pilos-border">
        <div className="w-32 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Time</div>
        <div className="flex-1 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Agent</div>
        <div className="w-24 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Tokens</div>
        <div className="w-20 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Cost</div>
        <div className="w-20 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Duration</div>
        <div className="w-16 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Status</div>
      </div>
      {entries.map((entry) => (
        <div key={entry.id} className="table-row-hover flex items-center gap-4 px-4 py-2.5 border-b border-pilos-border/50 transition-colors">
          <div className="w-32 text-[10px] text-zinc-500 font-mono">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </div>
          <div className="flex-1 text-xs text-zinc-300">{entry.agentName || 'Claude'}</div>
          <div className="w-24 text-xs text-white font-mono">{entry.tokens.toLocaleString()}</div>
          <div className="w-20 text-xs text-zinc-400">${entry.cost.toFixed(4)}</div>
          <div className="w-20 text-xs text-zinc-400">{(entry.durationMs / 1000).toFixed(1)}s</div>
          <div className="w-16">
            <span className={`text-[10px] font-medium ${entry.success ? 'text-emerald-400' : 'text-red-400'}`}>
              {entry.success ? 'OK' : 'Error'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const entries = useAnalyticsStore((s) => s.entries)
  const summary = useMemo(() => computeSummary(entries), [entries])
  const tokensByDay = useMemo(() => computeTokensByDay(entries), [entries])
  const recentEntries = useMemo(() => computeRecentEntries(entries, 20), [entries])

  useEffect(() => {
    useAnalyticsStore.getState().loadEntries()
  }, [])

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="p-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Total Tokens"
            value={summary.totalTokens > 1000 ? `${(summary.totalTokens / 1000).toFixed(1)}k` : summary.totalTokens}
            icon="lucide:hash"
          />
          <StatCard
            label="Total Cost"
            value={`$${summary.totalCost.toFixed(2)}`}
            icon="lucide:dollar-sign"
          />
          <StatCard
            label="Avg Response"
            value={summary.avgResponseTime > 0 ? `${(summary.avgResponseTime / 1000).toFixed(1)}s` : '--'}
            icon="lucide:clock"
          />
          <StatCard
            label="Success Rate"
            value={`${summary.successRate.toFixed(1)}%`}
            icon="lucide:check-circle-2"
          />
        </div>

        {/* Token Usage Chart */}
        <div className="mb-6">
          <div className="bg-pilos-card border border-pilos-border rounded-xl p-4">
            <h3 className="text-xs font-bold text-white mb-4">Token Usage (Last 14 Days)</h3>
            <BarChart data={tokensByDay} />
          </div>
        </div>

        {/* Activity Log */}
        <div>
          <div className="bg-pilos-card border border-pilos-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-pilos-border">
              <h3 className="text-xs font-bold text-white">Recent Activity</h3>
            </div>
            <ActivityTable entries={recentEntries} />
          </div>
        </div>
      </div>
    </div>
  )
}
