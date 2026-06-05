/**
 * SearchPanel — full-window search overlay (Cmd+F). Restyled to the prototype
 * tokens: dark `.win` chrome backdrop, `.seg` scope tabs, `.list-item` results.
 */
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
    close()
    if (activeConversationId !== conversationId) {
      await setActiveConversation(conversationId)
    }
    setScrollToMessageId(messageId)
  }, [activeConversationId, setActiveConversation, setScrollToMessageId, close])

  if (!isOpen) return null

  return createPortal(
    <div style={{ position: 'fixed', top: 32, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'var(--win)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--line-2)' }}>
        <svg width="20" height="20" style={{ color: 'var(--ink-3)', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages..."
          style={{
            flex: 1, background: 'transparent', color: 'var(--ink)', fontSize: 18,
            border: 'none', outline: 'none', fontFamily: 'inherit',
          }}
          autoFocus
        />
        <span className="kbd">⌘F</span>
        <button
          type="button"
          onClick={close}
          className="mini-ico"
          title="Close (Esc)"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scope toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 24px', borderBottom: '1px solid var(--line-2)' }}>
        <div className="seg">
          <button type="button" onClick={() => setScope('project')} className={scope === 'project' ? 'on' : ''}>
            All conversations
          </button>
          <button
            type="button"
            onClick={() => setScope('conversation')}
            disabled={!activeConversationId}
            className={scope === 'conversation' ? 'on' : ''}
          >
            Current chat
          </button>
        </div>
        {query.trim() && (
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
            {isSearching ? 'Searching...' : `${total} result${total !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
        {!query.trim() && (
          <p className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 32 }}>Type to search across your messages</p>
        )}

        {query.trim() && results.length === 0 && !isSearching && (
          <p className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 32 }}>No results found</p>
        )}

        {results.map((r) => (
          <button
            type="button"
            key={r.id}
            onClick={() => handleResultClick(r.conversationId, r.id)}
            style={{
              width: '100%', textAlign: 'left', padding: '12px 16px',
              marginBottom: 4, borderRadius: 8, border: '1px solid transparent',
              background: 'transparent', cursor: 'pointer', display: 'block',
              transition: 'background 0.14s, border-color 0.14s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.conversationTitle}</span>
              <span style={{ fontSize: 10, color: 'var(--faint)', flexShrink: 0 }}>
                {new Date(r.timestamp).toLocaleDateString()}
              </span>
            </div>
            <p
              style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              dangerouslySetInnerHTML={{ __html: r.snippet }}
            />
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}
