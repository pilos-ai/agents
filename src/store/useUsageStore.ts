import { create } from 'zustand'
import { api } from '../api'
import type { ClaudeUsageStats, ClaudeUsageLimits } from '../types'

interface UsageStore {
  // From Anthropic API (rate limits)
  limits: ClaudeUsageLimits | null

  // From stats-cache.json
  stats: ClaudeUsageStats | null

  // Polling
  _pollTimer: ReturnType<typeof setInterval> | null

  // Actions
  fetchUsage: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}

export const useUsageStore = create<UsageStore>((set, get) => ({
  limits: null,
  stats: null,
  _pollTimer: null,

  fetchUsage: async () => {
    try {
      const [limits, stats] = await Promise.all([
        api.cli.getClaudeUsage(),
        api.cli.getUsageStats(),
      ])
      set({ limits, stats })
    } catch {
      // API not available
    }
  },

  startPolling: () => {
    const existing = get()._pollTimer
    if (existing) return

    // Fetch immediately
    get().fetchUsage()

    // Poll every 30 seconds
    const timer = setInterval(() => get().fetchUsage(), 30_000)
    set({ _pollTimer: timer })
  },

  stopPolling: () => {
    const timer = get()._pollTimer
    if (timer) {
      clearInterval(timer)
      set({ _pollTimer: null })
    }
  },
}))
