/**
 * Analytics page — pixel-faithful port of pilos-handoff/app/screen_analytics.jsx
 * with real wiring to useAnalyticsStore / useUsageStore.
 *
 * Stats grid → tokens today / burn rate / monthly spend / active runs. Tokens
 * and cost come from the analytics entries store; active runs come from
 * useTaskStore.activeExecutions. Some numbers (rate-limit utilization) come
 * from useUsageStore.limits when present.
 *
 * Bar chart uses the prototype's CSS `.bar` divs — no new chart lib.
 */
import { useEffect, useMemo, type ComponentType } from 'react'
import { useAnalyticsStore, computeSummary, computeTokensByDay } from '../../../store/useAnalyticsStore'
import { useUsageStore } from '../../../store/useUsageStore'
import { useTaskStore } from '../../../store/useTaskStore'
import {
  IconAnalytics,
  IconSpark,
  IconGauge,
  IconDollar,
  IconRuns,
  IconCalendar,
  IconRefresh,
  IconCpu,
} from '../PilosIcons'

interface StatDef {
  k: string
  Icon: ComponentType<{ size?: number }>
  v: string
  unit: string
  trend: 'up' | 'down'
  td: string
}

function Ring({ pct, size = 132, label, sub }: { pct: number; size?: number; label: string; sub: string }) {
  const r = size / 2 - 11
  const c = 2 * Math.PI * r
  return (
    <div className="ctx-ring" style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={11} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s var(--ease)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>
        </div>
      </div>
    </div>
  )
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return { v: (n / 1_000_000).toFixed(1), unit: 'M' }
  if (n >= 1_000) return { v: (n / 1_000).toFixed(0), unit: 'k' }
  return { v: String(n), unit: '' }
}

export default function AnalyticsPage() {
  const entries = useAnalyticsStore((s) => s.entries)
  const summary = useMemo(() => computeSummary(entries), [entries])
  const tokensByDay = useMemo(() => computeTokensByDay(entries), [entries])
  const limits = useUsageStore((s) => s.limits)
  const activeExecs = useTaskStore((s) => s.activeExecutions)

  useEffect(() => {
    useAnalyticsStore.getState().loadEntries()
  }, [])

  // Today's tokens vs the 14-day average — for the trend indicator.
  const today = new Date().toISOString().split('T')[0]
  const todaysEntry = tokensByDay.find((d) => d.date === today)
  const tokensToday = todaysEntry?.tokens || 0
  const avgTokens = tokensByDay.length > 0
    ? tokensByDay.reduce((sum, d) => sum + d.tokens, 0) / tokensByDay.length
    : 0
  const trendUp = tokensToday >= avgTokens
  const trendPct = avgTokens > 0 ? Math.round(((tokensToday - avgTokens) / avgTokens) * 100) : 0

  const tokF = fmtTokens(tokensToday)

  // Burn rate — tokens-per-minute over the last hour
  const lastHour = entries.filter((e) => Date.now() - e.timestamp < 60 * 60 * 1000)
  const lastHourTokens = lastHour.reduce((sum, e) => sum + e.tokens, 0)
  const burnRate = lastHourTokens / 60
  const burnF = fmtTokens(Math.round(burnRate))

  const monthSpend = entries
    .filter((e) => new Date(e.timestamp).getMonth() === new Date().getMonth())
    .reduce((sum, e) => sum + e.cost, 0)

  const activeRunCount = Object.keys(activeExecs).length

  const stats: StatDef[] = [
    { k: 'Tokens today', Icon: IconSpark, v: tokF.v, unit: tokF.unit, trend: trendUp ? 'up' : 'down', td: `${trendPct >= 0 ? '+' : ''}${trendPct}% vs avg` },
    { k: 'Burn rate', Icon: IconGauge, v: burnF.v, unit: `${burnF.unit}/min`, trend: 'down', td: 'last hour' },
    { k: 'Spend (mo)', Icon: IconDollar, v: '$' + monthSpend.toFixed(2).split('.')[0], unit: '.' + monthSpend.toFixed(2).split('.')[1], trend: 'up', td: 'this month' },
    { k: 'Active runs', Icon: IconRuns, v: String(activeRunCount), unit: '', trend: 'up', td: activeRunCount === 0 ? 'idle' : 'in progress' },
  ]

  // Group entries by agent for the "cost by agent" panel
  const byAgent = useMemo(() => {
    const map = new Map<string, { runs: number; tokens: number; cost: number }>()
    for (const e of entries) {
      const name = e.agentName || 'Claude'
      const prev = map.get(name) || { runs: 0, tokens: 0, cost: 0 }
      prev.runs++
      prev.tokens += e.tokens
      prev.cost += e.cost
      map.set(name, prev)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
  }, [entries])
  const topCost = byAgent[0]?.cost || 1

  // Rate limits — Anthropic five-hour window when available
  const fiveHour = limits?.five_hour
  const rateLimitRows: [string, number, string][] = fiveHour
    ? [
        ['Requests / min', Math.round(fiveHour.utilization ?? 0), `${fiveHour.utilization?.toFixed(0)}%`],
        ['Input tokens / 5h', Math.round(fiveHour.utilization ?? 0), `${fiveHour.utilization?.toFixed(0)}%`],
        ['Output tokens / 5h', Math.round(fiveHour.utilization ?? 0), `${fiveHour.utilization?.toFixed(0)}%`],
      ]
    : [
        ['Requests / min', 0, '— / —'],
        ['Input tokens / min', 0, '— / —'],
        ['Output tokens / min', 0, '— / —'],
      ]

  // 14-day bars (height as % of max)
  const usage14 = useMemo(() => {
    const max = Math.max(1, ...tokensByDay.map((d) => d.tokens))
    return tokensByDay.map((d) => Math.round((d.tokens / max) * 100))
  }, [tokensByDay])

  return (
    <div className="main">
      <div className="main-head">
        <div className="main-title">
          <IconAnalytics size={17} style={{ color: 'var(--ink-3)' }} />
          Analytics
        </div>
        <div className="main-sub">· last 14 days</div>
        <div className="main-actions">
          <button className="btn sm ghost">
            <IconCalendar size={14} />
            14 days
          </button>
          <button
            className="btn sm ghost icon"
            onClick={() => useAnalyticsStore.getState().loadEntries()}
            aria-label="Refresh"
          >
            <IconRefresh size={15} />
          </button>
        </div>
      </div>

      <div className="main-body scroll">
        <div className="dash">
          <div className="stat-grid">
            {stats.map((s) => (
              <div key={s.k} className="stat">
                <div className="sk">
                  <s.Icon size={14} />
                  {s.k}
                </div>
                <div className="sv">
                  {s.v}
                  {s.unit && <span className="unit">{s.unit}</span>}
                </div>
                <div className={'strend ' + s.trend}>
                  <span>{s.trend === 'up' ? '▲' : '▼'}</span>
                  {s.td}
                </div>
              </div>
            ))}
          </div>

          <div className="grid-cards" style={{ gridTemplateColumns: '1.7fr 1fr', marginTop: 14 }}>
            <div className="card2">
              <div className="card2-head">
                <div>
                  <div className="card2-title">Token usage</div>
                  <div className="card2-sub">daily, last 14 days · in thousands</div>
                </div>
                <div className="seg">
                  <button className="on">Tokens</button>
                  <button>Cost</button>
                </div>
              </div>
              <div className="bars">
                {usage14.length === 0 ? (
                  <div className="muted" style={{ margin: 'auto' }}>No data yet</div>
                ) : usage14.map((v, i) => (
                  <div key={i} className="bar-col">
                    <div className="bar" style={{ height: v + '%' }} />
                    <div className="bar-lbl">{i % 2 === 0 ? i + 1 : ''}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card2">
              <div className="card2-head">
                <div className="card2-title">Context window</div>
                <span className="tag">live</span>
              </div>
              <div style={{ display: 'grid', placeItems: 'center', padding: '8px 0 16px' }}>
                <Ring pct={Math.round((summary.totalTokens / 200_000) * 100) % 101} label={`${Math.round(summary.totalTokens / 1000)}k`} sub="of 200k" />
              </div>
              <div className="legend">
                {[
                  ['System + tools', '#6366f1', '14k'],
                  ['Conversation', '#818cf8', `${Math.round(summary.totalTokens / 1000)}k`],
                  ['Memory recall', '#3ecf8e', '16k'],
                  ['Free', '#22222e', `${Math.max(0, 200 - Math.round(summary.totalTokens / 1000))}k`],
                ].map(([nm, sw, lv]) => (
                  <div key={nm} className="legend-row">
                    <span className="sw" style={{ background: sw }} />
                    {nm}
                    <span className="lv">{lv}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid-cards" style={{ gridTemplateColumns: '1fr 1.3fr', marginTop: 14 }}>
            <div className="card2">
              <div className="card2-head">
                <div className="card2-title">Anthropic rate limits</div>
              </div>
              {rateLimitRows.map(([nm, pct, lv]) => (
                <div key={nm} style={{ marginBottom: 16 }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ fontSize: 12.5 }}>{nm}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>{lv}</span>
                  </div>
                  <div className="meter">
                    <div
                      className="fill"
                      style={{
                        width: pct + '%',
                        background: pct > 75 ? 'linear-gradient(90deg,#f6b73c,#fb6f6f)' : undefined,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="card2">
              <div className="card2-head">
                <div className="card2-title">Cost by agent</div>
                <div className="card2-sub">this month</div>
              </div>
              {byAgent.length === 0 ? (
                <div className="muted" style={{ padding: '16px 0' }}>No agent activity yet</div>
              ) : byAgent.map((r) => {
                const pct = Math.round((r.cost / topCost) * 100)
                return (
                  <div key={r.name} className="agent-cost-row">
                    <div
                      className="avatar"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: 'var(--accent-soft)',
                        color: 'var(--accent-2)',
                        fontSize: 11,
                      }}
                    >
                      {r.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {r.runs} runs · {Math.round(r.tokens / 1000)}k tokens
                      </div>
                    </div>
                    <div style={{ width: 80 }}>
                      <div className="meter" style={{ height: 6 }}>
                        <div className="fill" style={{ width: pct + '%' }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, width: 56, textAlign: 'right', color: 'var(--ink)' }}>
                      ${r.cost.toFixed(2)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
