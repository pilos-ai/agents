import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from '@testing-library/react'

const mockSettingsGet = vi.fn()
const mockSettingsSet = vi.fn()

vi.mock('../api', () => ({
  api: {
    settings: {
      get: (...args: unknown[]) => mockSettingsGet(...args),
      set: (...args: unknown[]) => mockSettingsSet(...args),
    },
  },
}))

const { useAnalyticsStore, computeSummary, computeRecentEntries, computeTokensByDay } = await import('./useAnalyticsStore')
import type { AnalyticsEntry } from './useAnalyticsStore'

function makeEntry(overrides: Partial<AnalyticsEntry> = {}): AnalyticsEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    agentName: null,
    tokens: 100,
    cost: 0.01,
    durationMs: 500,
    success: true,
    conversationId: null,
    ...overrides,
  }
}

describe('useAnalyticsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAnalyticsStore.setState({ entries: [] })
    mockSettingsSet.mockResolvedValue(undefined)
  })

  describe('loadEntries', () => {
    it('sets entries from stored array', async () => {
      const stored = [makeEntry({ tokens: 200 }), makeEntry({ tokens: 300 })]
      mockSettingsGet.mockResolvedValue(stored)

      await act(() => useAnalyticsStore.getState().loadEntries())

      expect(useAnalyticsStore.getState().entries).toEqual(stored)
    })

    it('ignores non-array values (e.g. stored object or string)', async () => {
      mockSettingsGet.mockResolvedValue({ not: 'an array' })

      await act(() => useAnalyticsStore.getState().loadEntries())

      expect(useAnalyticsStore.getState().entries).toEqual([])
    })

    it('ignores null stored value', async () => {
      mockSettingsGet.mockResolvedValue(null)

      await act(() => useAnalyticsStore.getState().loadEntries())

      expect(useAnalyticsStore.getState().entries).toEqual([])
    })

    it('silently fails on error without throwing', async () => {
      mockSettingsGet.mockRejectedValue(new Error('Storage error'))

      await expect(
        act(() => useAnalyticsStore.getState().loadEntries())
      ).resolves.not.toThrow()

      expect(useAnalyticsStore.getState().entries).toEqual([])
    })

    it('calls api.settings.get with correct key', async () => {
      mockSettingsGet.mockResolvedValue([])

      await act(() => useAnalyticsStore.getState().loadEntries())

      expect(mockSettingsGet).toHaveBeenCalledWith('v2_analytics')
    })
  })

  describe('addEntry', () => {
    it('appends a new entry with a generated id', async () => {
      const entryData = {
        timestamp: Date.now(),
        agentName: 'Dev',
        tokens: 500,
        cost: 0.05,
        durationMs: 1000,
        success: true,
        conversationId: 'conv-1',
      }

      await act(() => useAnalyticsStore.getState().addEntry(entryData))

      const entries = useAnalyticsStore.getState().entries
      expect(entries).toHaveLength(1)
      expect(entries[0].id).toBeDefined()
      expect(entries[0].tokens).toBe(500)
      expect(entries[0].agentName).toBe('Dev')
    })

    it('assigns a unique id to each entry', async () => {
      const data = { timestamp: Date.now(), agentName: null, tokens: 100, cost: 0.01, durationMs: 100, success: true, conversationId: null }

      await act(() => useAnalyticsStore.getState().addEntry(data))
      await act(() => useAnalyticsStore.getState().addEntry(data))

      const entries = useAnalyticsStore.getState().entries
      expect(entries[0].id).not.toBe(entries[1].id)
    })

    it('persists entries via api.settings.set', async () => {
      const data = { timestamp: Date.now(), agentName: null, tokens: 100, cost: 0.01, durationMs: 100, success: true, conversationId: null }

      await act(() => useAnalyticsStore.getState().addEntry(data))

      expect(mockSettingsSet).toHaveBeenCalledWith('v2_analytics', useAnalyticsStore.getState().entries)
    })

    it('caps stored entries at 1000', async () => {
      // Seed with 1000 existing entries
      const existing = Array.from({ length: 1000 }, () => makeEntry())
      useAnalyticsStore.setState({ entries: existing })

      const data = { timestamp: Date.now(), agentName: 'overflow', tokens: 1, cost: 0, durationMs: 1, success: true, conversationId: null }
      await act(() => useAnalyticsStore.getState().addEntry(data))

      const entries = useAnalyticsStore.getState().entries
      expect(entries).toHaveLength(1000)
      // The newest entry should be the last one
      expect(entries[entries.length - 1].agentName).toBe('overflow')
    })

    it('trims from the front (oldest entries removed) when capping', async () => {
      const existing = Array.from({ length: 1000 }, (_, i) => makeEntry({ tokens: i }))
      useAnalyticsStore.setState({ entries: existing })

      const data = { timestamp: Date.now(), agentName: null, tokens: 9999, cost: 0, durationMs: 1, success: true, conversationId: null }
      await act(() => useAnalyticsStore.getState().addEntry(data))

      const entries = useAnalyticsStore.getState().entries
      // Oldest entry (tokens=0) should be gone
      expect(entries.find((e) => e.tokens === 0)).toBeUndefined()
      // Newest should be present
      expect(entries.find((e) => e.tokens === 9999)).toBeDefined()
    })
  })
})

// ── Pure computation helpers ──────────────────────────────────────────────────

describe('computeSummary', () => {
  it('returns zero summary for empty entries', () => {
    const result = computeSummary([])
    expect(result).toEqual({ totalTokens: 0, totalCost: 0, avgResponseTime: 0, successRate: 100, totalSessions: 0 })
  })

  it('computes totals correctly', () => {
    const entries = [
      makeEntry({ tokens: 100, cost: 0.01, durationMs: 500, success: true }),
      makeEntry({ tokens: 200, cost: 0.02, durationMs: 1000, success: false }),
    ]
    const result = computeSummary(entries)
    expect(result.totalTokens).toBe(300)
    expect(result.totalCost).toBeCloseTo(0.03)
    expect(result.avgResponseTime).toBe(750)
    expect(result.successRate).toBe(50)
    expect(result.totalSessions).toBe(2)
  })
})

describe('computeRecentEntries', () => {
  it('returns last N entries in reverse order', () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry({ tokens: i }))
    const result = computeRecentEntries(entries, 3)
    expect(result).toHaveLength(3)
    expect(result[0].tokens).toBe(4) // most recent first
  })
})

describe('computeTokensByDay', () => {
  it('groups entries by day', () => {
    const entries = [
      makeEntry({ timestamp: new Date('2026-03-01').getTime(), tokens: 100, cost: 0.01 }),
      makeEntry({ timestamp: new Date('2026-03-01').getTime(), tokens: 50, cost: 0.005 }),
      makeEntry({ timestamp: new Date('2026-03-02').getTime(), tokens: 200, cost: 0.02 }),
    ]
    const result = computeTokensByDay(entries)
    const day1 = result.find((r) => r.date === '2026-03-01')
    expect(day1?.tokens).toBe(150)
    const day2 = result.find((r) => r.date === '2026-03-02')
    expect(day2?.tokens).toBe(200)
  })
})
