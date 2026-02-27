import { useState, useEffect, useRef } from 'react'
import { Icon } from '../../common/Icon'
import { StatusDot } from '../components/StatusDot'
import { GradientAvatar } from '../components/GradientAvatar'
import { useConversationStore } from '../../../store/useConversationStore'
import { useProjectStore } from '../../../store/useProjectStore'
import type { ImageAttachment } from '../../../types'

// Reuse existing chat components
import { MessageBubble } from '../../chat/MessageBubble'
import { PermissionBanner } from '../../chat/PermissionBanner'

function ConversationSidebar() {
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation)
  const createConversation = useConversationStore((s) => s.createConversation)

  return (
    <div className="w-56 border-r border-pilos-border bg-pilos-bg flex flex-col flex-shrink-0">
      <div className="p-3 border-b border-pilos-border">
        <button
          onClick={() => createConversation()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-pilos-card border border-pilos-border hover:border-zinc-600 rounded-lg text-xs font-medium text-zinc-300 transition-colors"
        >
          <Icon icon="lucide:plus" className="text-xs" />
          New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => setActiveConversation(conv.id)}
            className={`w-full text-left px-3 py-2.5 text-xs transition-colors border-b border-pilos-border/50 ${
              activeConversationId === conv.id
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
            }`}
          >
            <p className="truncate font-medium">{conv.title || 'New Conversation'}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              {new Date(conv.updated_at).toLocaleDateString()}
            </p>
          </button>
        ))}
        {conversations.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-[10px] text-zinc-600">No conversations yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

function TerminalControls() {
  const messages = useConversationStore((s) => s.messages)

  const handleCopyAll = () => {
    const text = messages
      .filter((m) => m.type === 'text')
      .map((m) => `${m.role === 'user' ? '> ' : ''}${m.content}`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 border-b border-pilos-border bg-pilos-card/30 flex-shrink-0">
      <button onClick={handleCopyAll} className="px-2 py-1 text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors flex items-center gap-1">
        <Icon icon="lucide:copy" className="text-[10px]" />
        Copy All
      </button>
      <button className="px-2 py-1 text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors flex items-center gap-1">
        <Icon icon="lucide:download" className="text-[10px]" />
        Export
      </button>
    </div>
  )
}

function TerminalInput() {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const sendMessage = useConversationStore((s) => s.sendMessage)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const abortSession = useConversationStore((s) => s.abortSession)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    if (!text.trim() || !activeConversationId) return
    sendMessage(text.trim(), images.length > 0 ? images : undefined)
    setText('')
    setImages([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isStreaming) return
      handleSend()
    }
  }

  return (
    <div className="border-t border-pilos-border bg-[#0c0c0e] px-4 py-3 flex-shrink-0">
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={activeConversationId ? "Send a message..." : "Create a conversation first..."}
          disabled={!activeConversationId}
          rows={1}
          className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none font-mono leading-relaxed disabled:opacity-50"
          style={{ maxHeight: 120 }}
        />
        {isStreaming ? (
          <button
            onClick={abortSession}
            className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Icon icon="lucide:square" className="text-[10px]" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || !activeConversationId}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all flex items-center gap-1.5"
          >
            <Icon icon="lucide:send" className="text-[10px]" />
            Send
          </button>
        )}
      </div>
    </div>
  )
}

export default function TerminalPage() {
  const messages = useConversationStore((s) => s.messages)
  const streaming = useConversationStore((s) => s.streaming)
  const permissionRequest = useConversationStore((s) => s.permissionRequest)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)

  const activeTab = useProjectStore((s) => {
    const path = s.activeProjectPath
    return s.openProjects.find((p) => p.projectPath === path)
  })
  const agents = activeTab?.agents || []
  const currentAgent = agents.find((a) => a.name === streaming.currentAgentName)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streaming.text])

  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Conversation Sidebar */}
      {sidebarOpen && <ConversationSidebar />}

      {/* Main Terminal Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Agent Status Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-pilos-border bg-pilos-card/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 text-zinc-500 hover:text-white rounded transition-colors"
            >
              <Icon icon={sidebarOpen ? 'lucide:panel-left-close' : 'lucide:panel-left-open'} />
            </button>
            {streaming.isStreaming && currentAgent ? (
              <div className="flex items-center gap-2">
                <GradientAvatar gradient={currentAgent.color} icon={currentAgent.icon} size="sm" />
                <span className="text-xs font-bold text-white">{currentAgent.name}</span>
                <StatusDot color="green" pulse />
                <span className="text-[10px] text-zinc-500">Processing...</span>
              </div>
            ) : streaming.isStreaming ? (
              <div className="flex items-center gap-2">
                <StatusDot color="green" pulse />
                <span className="text-xs text-zinc-400">Agent processing...</span>
              </div>
            ) : (
              <span className="text-xs text-zinc-600">
                {activeConversationId ? 'Ready' : 'No conversation selected'}
              </span>
            )}
          </div>
        </div>

        <TerminalControls />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0c0c0e]">
          <div className="p-4 space-y-1">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id || i}
                message={msg}
                messages={messages}
                isLast={i === messages.length - 1}
              />
            ))}

            {/* Streaming content */}
            {streaming.isStreaming && streaming.text && (
              <div className="py-2">
                <div className="text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {streaming.text}
                  <span className="streaming-cursor" />
                </div>
              </div>
            )}

            {/* Permission request */}
            {permissionRequest && <PermissionBanner />}

            <div ref={messagesEndRef} />
          </div>

          {/* Empty state */}
          {messages.length === 0 && !streaming.isStreaming && activeConversationId && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Icon icon="lucide:terminal" className="text-zinc-800 text-3xl mb-3" />
              <h3 className="text-sm font-medium text-zinc-500 mb-1">Ready for input</h3>
              <p className="text-xs text-zinc-600">Send a message to start the conversation</p>
            </div>
          )}
        </div>

        {/* Input */}
        <TerminalInput />
      </div>
    </div>
  )
}
