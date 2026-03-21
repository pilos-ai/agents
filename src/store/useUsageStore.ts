import { create } from 'zustand'
import { api } from '../api'
import type { ClaudeUsageStats, ClaudeUsageLimits } from '../types'

const STATS_INTERVAL = 30_000       // 30s — local file read, cheap
const LIMITS_INTERVAL = 5 * 60_000 // 5min — Anthropic API, rate-limited

interface UsageStore {
  limits: ClaudeUsageLimits | null
  stats: ClaudeUsageStats | null
  _statsTimer: ReturnType<typeof setInterval> | null
  _limitsTimer: ReturnType<typeof setInterval> | null
  fetchStats: () => Promise<void>
  fetchLimits: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}

export const useUsageStore = create<UsageStore>((set, get) => ({
  limits: null,
  stats: null,
  _statsTimer: null,
  _limitsTimer: null,

  fetchStats: async () => {
    try {
      const stats = await api.cli.getUsageStats()
      if (stats) set({ stats })
    } catch {
      // Keep existing data on error
    }
  },

  fetchLimits: async () => {
    try {
      const limits = await api.cli.getClaudeUsage()
      if (limits) set({ limits })
    } catch {
      // Keep existing data on error
    }
  },

  startPolling: () => {
    const s = get()
    if (s._statsTimer) clearInterval(s._statsTimer)
    if (s._limitsTimer) clearInterval(s._limitsTimer)

    // Fetch both immediately on start
    get().fetchStats()
    get().fetchLimits()

    const statsTimer = setInterval(() => get().fetchStats(), STATS_INTERVAL)
    const limitsTimer = setInterval(() => get().fetchLimits(), LIMITS_INTERVAL)
    set({ _statsTimer: statsTimer, _limitsTimer: limitsTimer })
  },

  stopPolling: () => {
    const { _statsTimer, _limitsTimer } = get()
    if (_statsTimer) clearInterval(_statsTimer)
    if (_limitsTimer) clearInterval(_limitsTimer)
    set({ _statsTimer: null, _limitsTimer: null })
  },
}))
