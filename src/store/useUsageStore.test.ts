import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'

// Mock the api module before importing the store
const mockGetUsageStats = vi.fn()
const mockGetClaudeUsage = vi.fn()

vi.mock('../api', () => ({
  api: {
    cli: {
      getUsageStats: () => mockGetUsageStats(),
      getClaudeUsage: () => mockGetClaudeUsage(),
    },
  },
}))

// Import store after mock is set up
const { useUsageStore } = await import('./useUsageStore')

describe('useUsageStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state before each test
    useUsageStore.setState({ stats: null, limits: null, _statsTimer: null, _limitsTimer: null })
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Stop any running polling timers
    useUsageStore.getState().stopPolling()
    vi.useRealTimers()
  })

  describe('fetchStats', () => {
    it('sets stats when api returns data', async () => {
      const mockStats = { tokensUsed: 1000, tokensLimit: 10000, resetDate: '2026-04-01' }
      mockGetUsageStats.mockResolvedValue(mockStats)

      await act(() => useUsageStore.getState().fetchStats())

      expect(useUsageStore.getState().stats).toEqual(mockStats)
    })

    it('does not update stats when api returns null', async () => {
      useUsageStore.setState({ stats: { tokensUsed: 500 } as never })
      mockGetUsageStats.mockResolvedValue(null)

      await act(() => useUsageStore.getState().fetchStats())

      // Existing stats should be preserved
      expect(useUsageStore.getState().stats).toEqual({ tokensUsed: 500 })
    })

    it('silently catches errors and keeps existing stats', async () => {
      const existing = { tokensUsed: 200 } as never
      useUsageStore.setState({ stats: existing })
      mockGetUsageStats.mockRejectedValue(new Error('Network error'))

      await act(() => useUsageStore.getState().fetchStats())

      expect(useUsageStore.getState().stats).toEqual(existing)
    })
  })

  describe('fetchLimits', () => {
    it('sets limits when api returns data', async () => {
      const mockLimits = { tier: 'pro', requestsPerMinute: 60 }
      mockGetClaudeUsage.mockResolvedValue(mockLimits)

      await act(() => useUsageStore.getState().fetchLimits())

      expect(useUsageStore.getState().limits).toEqual(mockLimits)
    })

    it('does not update limits when api returns null', async () => {
      useUsageStore.setState({ limits: { tier: 'free' } as never })
      mockGetClaudeUsage.mockResolvedValue(null)

      await act(() => useUsageStore.getState().fetchLimits())

      expect(useUsageStore.getState().limits).toEqual({ tier: 'free' })
    })

    it('silently catches errors and keeps existing limits', async () => {
      const existing = { tier: 'pro' } as never
      useUsageStore.setState({ limits: existing })
      mockGetClaudeUsage.mockRejectedValue(new Error('API error'))

      await act(() => useUsageStore.getState().fetchLimits())

      expect(useUsageStore.getState().limits).toEqual(existing)
    })
  })

  describe('startPolling', () => {
    it('immediately calls fetchStats and fetchLimits on start', async () => {
      mockGetUsageStats.mockResolvedValue(null)
      mockGetClaudeUsage.mockResolvedValue(null)

      await act(() => {
        useUsageStore.getState().startPolling()
        return Promise.resolve()
      })

      expect(mockGetUsageStats).toHaveBeenCalledTimes(1)
      expect(mockGetClaudeUsage).toHaveBeenCalledTimes(1)
    })

    it('sets both timer references in store state', async () => {
      mockGetUsageStats.mockResolvedValue(null)
      mockGetClaudeUsage.mockResolvedValue(null)

      act(() => useUsageStore.getState().startPolling())

      expect(useUsageStore.getState()._statsTimer).not.toBeNull()
      expect(useUsageStore.getState()._limitsTimer).not.toBeNull()
    })

    it('calls fetchStats again after STATS_INTERVAL elapses', async () => {
      mockGetUsageStats.mockResolvedValue(null)
      mockGetClaudeUsage.mockResolvedValue(null)

      act(() => useUsageStore.getState().startPolling())

      // Advance past the 30s stats interval
      await act(async () => {
        vi.advanceTimersByTime(30_000)
        await Promise.resolve()
      })

      expect(mockGetUsageStats.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('calls fetchLimits again after LIMITS_INTERVAL elapses', async () => {
      mockGetUsageStats.mockResolvedValue(null)
      mockGetClaudeUsage.mockResolvedValue(null)

      act(() => useUsageStore.getState().startPolling())

      // Advance past the 5-minute limits interval
      await act(async () => {
        vi.advanceTimersByTime(5 * 60_000)
        await Promise.resolve()
      })

      expect(mockGetClaudeUsage.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('clears existing timers before starting new ones', async () => {
      mockGetUsageStats.mockResolvedValue(null)
      mockGetClaudeUsage.mockResolvedValue(null)

      act(() => useUsageStore.getState().startPolling())
      const firstStatsTimer = useUsageStore.getState()._statsTimer

      act(() => useUsageStore.getState().startPolling())
      const secondStatsTimer = useUsageStore.getState()._statsTimer

      // A new timer should have been set (different reference)
      expect(secondStatsTimer).not.toBe(firstStatsTimer)
    })
  })

  describe('stopPolling', () => {
    it('clears both timers and sets them to null', async () => {
      mockGetUsageStats.mockResolvedValue(null)
      mockGetClaudeUsage.mockResolvedValue(null)

      act(() => useUsageStore.getState().startPolling())
      expect(useUsageStore.getState()._statsTimer).not.toBeNull()

      act(() => useUsageStore.getState().stopPolling())

      expect(useUsageStore.getState()._statsTimer).toBeNull()
      expect(useUsageStore.getState()._limitsTimer).toBeNull()
    })

    it('is safe to call when no timers are running', () => {
      // Should not throw
      expect(() => {
        act(() => useUsageStore.getState().stopPolling())
      }).not.toThrow()
    })
  })
})
