import { memo } from 'react'
import type { ConversationMessage } from '../../types'
import { useConversationStore } from '../../store/useConversationStore'

interface Props {
  replyToId: number
  messages: ConversationMessage[]
}

export const MessageReference = memo(function MessageReference({ replyToId, messages }: Props) {
  const setScrollToMessageId = useConversationStore((s) => s.setScrollToMessageId)

  const referenced = messages.find((m) => m.id === replyToId)
  if (!referenced) return null

  const name = referenced.role === 'user' ? 'You' : (referenced.agentName || 'Assistant')
  const preview = referenced.content.slice(0, 120) + (referenced.content.length > 120 ? '...' : '')

  return (
    <button
      onClick={() => setScrollToMessageId(replyToId)}
      className="flex items-center gap-1.5 mb-1 px-2 py-1 rounded bg-neutral-800/40 border-l-2 border-blue-500/50 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 transition-colors max-w-[85%] text-left cursor-pointer"
    >
      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
      <span className="font-medium text-blue-400/80 shrink-0">{name}</span>
      <span className="truncate">{preview}</span>
    </button>
  )
})
