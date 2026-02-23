import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchStore, debouncedSearch } from '../../store/useSearchStore'
import { useConversationStore } from '../../store/useConversationStore'
import { useProjectStore } from '../../store/useProjectStore'

export function SearchPanel() {
  const isOpen = useSearchStore((s) => s.isOpen)
  const query = useSearchStore((s) => s.query)
  const scope = useSearchStore((s) => s.scope)
  const results = useSearchStore((s) => s.results)
  const total = useSearchStore((s) => s.total)
  const isSearching = useSearchStore((s) => s.isSearching)
  const setQuery = useSearchStore((s) => s.setQuery)
  const setScope = useSearchStore((s) => s.setScope)
  const close = useSearchStore((s) => s.close)

  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation)
  const setScrollToMessageId = useConversationStore((s) => s.setScrollToMessageId)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (query.trim()) {
      debouncedSearch(
        scope === 'conversation' ? activeConversationId || undefined : undefined,
        activeProjectPath || undefined,
      )
    }
  }, [query, scope, activeConversationId, activeProjectPath])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      close()
    }
  }, [close])

  const handleResultClick = useCallback(async (conversationId: string, messageId: number) => {
    if (activeConversationId !== conversationId) {
      await setActiveConversation(conversationId)
    }
    // Small delay to let messages load before scrolling
    setTimeout(() => {
      setScrollToMessageId(messageId)
    }, 100)
    close()
  }, [activeConversationId, setActiveConversation, setScrollToMessageId, close])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed top-8 left-0 right-0 bottom-0 z-[9999] bg-neutral-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-800">
        <svg className="w-5 h-5 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages..."
          className="flex-1 bg-transparent text-white text-lg outline-none placeholder-neutral-500"
          autoFocus
        />
        <button
          onClick={close}
          className="p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scope toggle */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-neutral-800/50">
        <button
          onClick={() => setScope('project')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            scope === 'project'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
        >
          All conversations
        </button>
        <button
          onClick={() => setScope('conversation')}
          disabled={!activeConversationId}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer disabled:opacity-30 ${
            scope === 'conversation'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Current chat
        </button>
        {query.trim() && (
          <span className="ml-auto text-xs text-neutral-500">
            {isSearching ? 'Searching...' : `${total} result${total !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {!query.trim() && (
          <p className="text-neutral-500 text-sm text-center mt-8">Type to search across your messages</p>
        )}

        {query.trim() && results.length === 0 && !isSearching && (
          <p className="text-neutral-500 text-sm text-center mt-8">No results found</p>
        )}

        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => handleResultClick(r.conversationId, r.id)}
            className="w-full text-left px-4 py-3 mb-1 rounded-lg hover:bg-neutral-800/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-blue-400 truncate">{r.conversationTitle}</span>
              <span className="text-[10px] text-neutral-600 shrink-0">
                {new Date(r.timestamp).toLocaleDateString()}
              </span>
            </div>
            <p
              className="text-sm text-neutral-300 line-clamp-2 [&>mark]:bg-yellow-500/30 [&>mark]:text-yellow-200 [&>mark]:rounded-sm [&>mark]:px-0.5"
              dangerouslySetInnerHTML={{ __html: r.snippet }}
            />
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}
