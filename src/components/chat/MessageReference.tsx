/**
 * MessageReference — small "↩ Reply to <name>: …" pill rendered inside
 * a `.cmsg .cbody` (above the .ctext). Restyled to the prototype `.reply-pill`.
 */
import { memo } from 'react'
import { useConversationStore } from '../../store/useConversationStore'

interface Props {
  replyToId: number
}

export const MessageReference = memo(function MessageReference({ replyToId }: Props) {
  const setScrollToMessageId = useConversationStore((s) => s.setScrollToMessageId)
  const messages = useConversationStore((s) => s.messages)

  const referenced = messages.find((m) => m.id === replyToId)
  if (!referenced) return null

  const name = referenced.role === 'user' ? 'You' : (referenced.agentName || 'Assistant')
  const preview = referenced.content.slice(0, 120) + (referenced.content.length > 120 ? '...' : '')

  return (
    <button
      type="button"
      onClick={() => setScrollToMessageId(replyToId)}
      className="reply-pill"
    >
      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
      <span className="nm">{name}</span>
      <span className="pv">{preview}</span>
    </button>
  )
})
