import { useCallback, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useConversationStore } from '../../store/useConversationStore'
import { useProjectStore } from '../../store/useProjectStore'
import { AGENT_COLORS } from '../../data/agent-templates'
import { MessageBubble } from './MessageBubble'
import { StreamingText } from './StreamingText'
import { InputBar } from './InputBar'
import { PermissionBanner } from './PermissionBanner'
import { ThinkingBackground } from './ThinkingBackground'

export function ChatPanel() {
  const messages = useConversationStore((s) => s.messages)
  const streaming = useConversationStore((s) => s.streaming)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottom = useRef(true)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
  })

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    isAtBottom.current = scrollHeight - scrollTop - clientHeight < 50
  }, [])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
  }, [])

  // Auto-scroll when new messages arrive or streaming updates (only if at bottom)
  useEffect(() => {
    if (isAtBottom.current) {
      scrollToBottom()
    }
  }, [messages.length, streaming.text, streaming.thinking, streaming.contentBlocks, scrollToBottom])

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
      {/* Messages with neural background */}
      <div className="relative flex-1 min-h-0">
        <ThinkingBackground />
        <div ref={scrollRef} onScroll={handleScroll} className="relative z-10 h-full overflow-y-auto px-4 py-3">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const msg = messages[virtualRow.index]
              const isLastAssistant =
                msg.role === 'assistant' &&
                !streaming.isStreaming &&
                virtualRow.index === messages.length - 1
              return (
                <div
                  key={msg.id || msg.timestamp || virtualRow.index}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="pb-3">
                    <MessageBubble message={msg} isLast={isLastAssistant} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Streaming content — only text/thinking; tool blocks are added to messages by content_block_stop */}
          {streaming.isStreaming && (() => {
            const streamingAgent = activeTab?.mode === 'team' && streaming.currentAgentName
              ? activeTab.agents.find((a) => a.name === streaming.currentAgentName)
              : null
            const agentColors = streamingAgent ? AGENT_COLORS[streamingAgent.color] || AGENT_COLORS.blue : null

            // Hide streaming bubble when only tool blocks are in progress (no text/thinking)
            const hasToolActivity = streaming.contentBlocks.some(b => b.type === 'tool_use' || b.type === 'tool_result')
            if (!streaming.text && !streaming.thinking && hasToolActivity) return null

            return (
              <div className="flex flex-col items-start space-y-1">
                {streamingAgent && (
                  <div className="flex items-center gap-1.5 mb-1 ml-1">
                    <span className="text-base">{streamingAgent.emoji}</span>
                    <span className={`text-xs font-semibold ${agentColors!.text}`}>{streamingAgent.name}</span>
                  </div>
                )}

                {/* Text / thinking bubble */}
                <div className={`max-w-[85%] rounded-lg px-4 py-3 text-neutral-100 ${
                  agentColors
                    ? `${agentColors.bgLight} border-l-2 ${agentColors.border}`
                    : 'bg-neutral-800/60'
                }`}>
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
            )
          })()}
        </div>
      </div>

      {/* Permission approval banner */}
      <PermissionBanner />

      {/* Input */}
      <InputBar />
    </div>
  )
}
