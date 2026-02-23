import { create } from 'zustand'
import { api } from '../api'
import type { MessageSearchResult } from '../types'

type SearchScope = 'project' | 'conversation'

interface SearchStore {
  isOpen: boolean
  query: string
  scope: SearchScope
  results: MessageSearchResult[]
  total: number
  isSearching: boolean

  open: (scope?: SearchScope) => void
  close: () => void
  setQuery: (query: string) => void
  setScope: (scope: SearchScope) => void
  search: (conversationId?: string, projectPath?: string) => Promise<void>
  clear: () => void
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export const useSearchStore = create<SearchStore>((set, get) => ({
  isOpen: false,
  query: '',
  scope: 'project',
  results: [],
  total: 0,
  isSearching: false,

  open: (scope) => {
    set({ isOpen: true, scope: scope || 'project' })
  },

  close: () => {
    set({ isOpen: false, query: '', results: [], total: 0, isSearching: false })
    if (debounceTimer) clearTimeout(debounceTimer)
  },

  setQuery: (query) => {
    set({ query })
  },

  setScope: (scope) => {
    set({ scope })
  },

  search: async (conversationId, projectPath) => {
    const { query } = get()
    if (!query.trim()) {
      set({ results: [], total: 0, isSearching: false })
      return
    }

    set({ isSearching: true })
    try {
      const { scope } = get()
      const options: { conversationId?: string; projectPath?: string; limit?: number } = { limit: 50 }
      if (scope === 'conversation' && conversationId) {
        options.conversationId = conversationId
      } else if (projectPath) {
        options.projectPath = projectPath
      }
      const result = await api.conversations.searchMessages(query.trim(), options)
      set({ results: result.messages, total: result.total, isSearching: false })
    } catch {
      set({ results: [], total: 0, isSearching: false })
    }
  },

  clear: () => {
    set({ query: '', results: [], total: 0, isSearching: false })
  },
}))

/** Debounced search helper — call from components */
export function debouncedSearch(conversationId?: string, projectPath?: string) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    useSearchStore.getState().search(conversationId, projectPath)
  }, 300)
}
