import { useEffect, useRef } from 'react'
import { useConversationStore } from '../../store/useConversationStore'
import { useProjectStore } from '../../store/useProjectStore'
import { MessageBubble } from './MessageBubble'
import { StreamingText } from './StreamingText'
import { InputBar } from './InputBar'
import { PermissionBanner } from './PermissionBanner'

export function ChatPanel() {
  const messages = useConversationStore((s) => s.messages)
  const streaming = useConversationStore((s) => s.streaming)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streaming.text, streaming.thinking])

  if (!activeConversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
        <svg className="w-12 h-12 mb-4 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-sm font-medium">{activeTab?.projectName || 'Pilos Agents'}</p>
        <p className="text-xs mt-1">Start a new chat or select an existing one</p>
        {activeTab && (
          <p className="text-[10px] text-neutral-600 mt-2">{activeTab.projectPath}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => {
          // isLast = true for the last assistant message (and no streaming in progress)
          const isLastAssistant =
            msg.role === 'assistant' &&
            !streaming.isStreaming &&
            i === messages.length - 1
          return <MessageBubble key={i} message={msg} isLast={isLastAssistant} />
        })}

        {/* Streaming content */}
        {streaming.isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-4 py-3 bg-neutral-800/60 text-neutral-100">
              {streaming.thinking && (
                <div className="mb-2 text-neutral-400 text-xs italic border-l-2 border-neutral-600 pl-2">
                  {streaming.thinking.slice(-500)}
                </div>
              )}
              {streaming.text ? (
                <StreamingText text={streaming.text} />
              ) : (
                !streaming.thinking && (
                  <div className="flex items-center gap-2 text-neutral-400 text-sm">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                    Thinking...
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Permission approval banner */}
      <PermissionBanner />

      {/* Input */}
      <InputBar />
    </div>
  )
}
