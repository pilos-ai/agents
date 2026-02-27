import { create } from 'zustand'
import { api } from '../api'

export interface AnalyticsEntry {
  id: string
  timestamp: number
  agentName: string | null
  tokens: number
  cost: number
  durationMs: number
  success: boolean
  conversationId: string | null
}

interface AnalyticsSummary {
  totalTokens: number
  totalCost: number
  avgResponseTime: number
  successRate: number
  totalSessions: number
}

interface AnalyticsStore {
  entries: AnalyticsEntry[]

  loadEntries: () => Promise<void>
  addEntry: (entry: Omit<AnalyticsEntry, 'id'>) => Promise<void>
}

// Standalone derived computation functions — use with useMemo in components
export function computeSummary(entries: AnalyticsEntry[]): AnalyticsSummary {
  if (entries.length === 0) {
    return { totalTokens: 0, totalCost: 0, avgResponseTime: 0, successRate: 100, totalSessions: 0 }
  }
  const totalTokens = entries.reduce((sum, e) => sum + e.tokens, 0)
  const totalCost = entries.reduce((sum, e) => sum + e.cost, 0)
  const avgResponseTime = entries.reduce((sum, e) => sum + e.durationMs, 0) / entries.length
  const successCount = entries.filter((e) => e.success).length
  const successRate = (successCount / entries.length) * 100
  return { totalTokens, totalCost, avgResponseTime, successRate, totalSessions: entries.length }
}

export function computeRecentEntries(entries: AnalyticsEntry[], limit: number): AnalyticsEntry[] {
  return entries.slice(-limit).reverse()
}

export function computeTokensByDay(entries: AnalyticsEntry[]): { date: string; tokens: number; cost: number }[] {
  const byDay: Record<string, { tokens: number; cost: number }> = {}
  for (const entry of entries) {
    const date = new Date(entry.timestamp).toISOString().split('T')[0]
    if (!byDay[date]) byDay[date] = { tokens: 0, cost: 0 }
    byDay[date].tokens += entry.tokens
    byDay[date].cost += entry.cost
  }
  return Object.entries(byDay)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
}

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => ({
  entries: [],

  loadEntries: async () => {
    try {
      const stored = await api.settings.get('v2_analytics')
      if (Array.isArray(stored)) {
        set({ entries: stored as AnalyticsEntry[] })
      }
    } catch {
      // No analytics stored yet
    }
  },

  addEntry: async (entryData) => {
    const entry: AnalyticsEntry = {
      ...entryData,
      id: crypto.randomUUID(),
    }
    const entries = [...get().entries, entry].slice(-1000) // Keep last 1000
    set({ entries })
    await api.settings.set('v2_analytics', entries)
  },
}))
