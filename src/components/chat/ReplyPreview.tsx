import { useConversationStore } from '../../store/useConversationStore'

export function ReplyPreview() {
  const replyToMessage = useConversationStore((s) => s.replyToMessage)
  const setReplyTo = useConversationStore((s) => s.setReplyTo)

  if (!replyToMessage) return null

  const name = replyToMessage.role === 'user' ? 'You' : (replyToMessage.agentName || 'Assistant')
  const preview = replyToMessage.content.slice(0, 100) + (replyToMessage.content.length > 100 ? '...' : '')

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-neutral-800/60 border-l-2 border-blue-500 rounded text-xs">
      <svg className="w-3 h-3 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
      <span className="text-neutral-400 shrink-0">Replying to <span className="font-medium text-neutral-300">{name}</span></span>
      <span className="text-neutral-500 truncate flex-1">{preview}</span>
      <button
        onClick={() => setReplyTo(null)}
        className="p-0.5 text-neutral-500 hover:text-neutral-200 transition-colors shrink-0 cursor-pointer"
        title="Cancel reply"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
