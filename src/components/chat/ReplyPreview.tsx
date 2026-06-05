import { useConversationStore } from '../../store/useConversationStore'

export function ReplyPreview() {
  const replyToMessage = useConversationStore((s) => s.replyToMessage)
  const setReplyTo = useConversationStore((s) => s.setReplyTo)

  if (!replyToMessage) return null

  const name = replyToMessage.role === 'user' ? 'You' : (replyToMessage.agentName || 'Assistant')
  const full = (replyToMessage.content || '').replace(/\s+/g, ' ').trim()
  const preview = full.length > 140 ? full.slice(0, 140) + '…' : full

  return (
    <div
      className="reply-preview"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        marginBottom: 10,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderLeft: '2px solid var(--accent)',
        borderRadius: 'var(--r-sm)',
        fontSize: 12,
        color: 'var(--ink-3)',
      }}
    >
      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--accent-2)', flex: 'none' }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
      <span style={{ flex: 'none' }}>
        Replying to <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{name}</span>
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          color: 'var(--muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {preview}
      </span>
      <button
        type="button"
        onClick={() => setReplyTo(null)}
        className="mini-ico"
        title="Cancel reply"
        style={{ width: 22, height: 22, flex: 'none' }}
      >
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
