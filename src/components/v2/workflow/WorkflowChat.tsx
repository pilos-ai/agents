import { useState, useRef, useEffect } from 'react'
import { Icon } from '../../common/Icon'
import { useWorkflowStore } from '../../../store/useWorkflowStore'

const SUGGESTIONS = [
  { icon: 'lucide:search', text: 'Search Jira for open bugs and post a summary to Slack' },
  { icon: 'lucide:clock', text: 'Every day, check for unassigned tickets and create a report' },
  { icon: 'lucide:code', text: 'Read project files, analyze code quality, create GitHub issues' },
  { icon: 'lucide:refresh-cw', text: 'Get stale Jira issues and transition them to backlog' },
]

function getProgressPhase(streamLen: number, elapsedSec: number): { label: string; percent: number } {
  if (streamLen === 0 && elapsedSec < 5) return { label: 'Understanding your request...', percent: 10 }
  if (streamLen === 0) return { label: 'Designing workflow structure...', percent: 20 }
  if (streamLen < 500) return { label: 'Designing workflow structure...', percent: 35 }
  if (streamLen < 2000) return { label: 'Configuring tools and connections...', percent: 60 }
  return { label: 'Finalizing...', percent: 85 }
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

/** Renders a user or assistant chat message bubble */
function ChatMessage({ message, onRetry, onSimplify }: {
  message: { role: 'user' | 'assistant'; content: string; changeSummary?: string }
  onRetry?: () => void
  onSimplify?: () => void
}) {
  const isUser = message.role === 'user'
  const isError = !isUser && message.content.startsWith('__ERROR__:')
  const displayContent = isError ? message.content.replace('__ERROR__:', '') : message.content

  if (isError) {
    return (
      <div className="mb-2">
        <div className="px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
          <div className="flex items-start gap-2">
            <Icon icon="lucide:alert-circle" className="text-red-400 text-xs flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 leading-relaxed">{displayContent}</p>
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-red-500/10">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium text-white bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
              >
                <Icon icon="lucide:refresh-cw" className="text-[10px]" />
                Retry
              </button>
            )}
            {onSimplify && (
              <button
                onClick={onSimplify}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium text-zinc-400 border border-pilos-border hover:text-white hover:border-zinc-600 transition-colors"
              >
                <Icon icon="lucide:minimize-2" className="text-[10px]" />
                Simplify
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[90%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
        isUser
          ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100'
          : 'bg-pilos-card border border-pilos-border text-zinc-300'
      }`}>
        <p className="whitespace-pre-wrap">{displayContent}</p>
        {message.changeSummary && (
          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/50">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              <Icon icon="lucide:check" className="text-[8px]" />
              {message.changeSummary}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function WorkflowChat() {
  const chatMessages = useWorkflowStore((s) => s.chatMessages)
  const chatIsGenerating = useWorkflowStore((s) => s.chatIsGenerating)
  const chatStreamingText = useWorkflowStore((s) => s.chatStreamingText)
  const chatStartedAt = useWorkflowStore((s) => s.chatStartedAt)
  const sendChatMessage = useWorkflowStore((s) => s.sendChatMessage)
  const retryLastMessage = useWorkflowStore((s) => s.retryLastMessage)
  const abortChat = useWorkflowStore((s) => s.abortChat)
  const clearChat = useWorkflowStore((s) => s.clearChat)
  const toggleChatMode = useWorkflowStore((s) => s.toggleChatMode)
  const nodes = useWorkflowStore((s) => s.nodes)

  const [input, setInput] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Elapsed time ticker while generating
  useEffect(() => {
    if (!chatIsGenerating || !chatStartedAt) {
      setElapsed(0)
      return
    }
    const interval = setInterval(() => {
      setElapsed(Date.now() - chatStartedAt)
    }, 1000)
    return () => clearInterval(interval)
  }, [chatIsGenerating, chatStartedAt])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatStreamingText])

  const handleSend = () => {
    const text = input.trim()
    if (!text || chatIsGenerating) return
    setInput('')
    sendChatMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  const handleRetry = () => {
    if (chatIsGenerating) return
    retryLastMessage()
  }

  const handleSimplify = () => {
    if (chatIsGenerating) return
    const lastUserMsg = [...chatMessages].reverse().find((m) => m.role === 'user')
    if (!lastUserMsg) return
    // Remove error messages and resend with simplification prefix
    const cleaned = chatMessages.filter((m) => !(m.role === 'assistant' && m.content.startsWith('__ERROR__:')))
    useWorkflowStore.setState({ chatMessages: cleaned })
    sendChatMessage(`Create a simpler version with fewer steps: ${lastUserMsg.content}`)
  }

  const handleExplain = () => {
    if (chatIsGenerating) return
    sendChatMessage('Explain what this workflow does step by step in simple terms.')
  }

  const isEmpty = chatMessages.length === 0
  const progress = getProgressPhase(chatStreamingText.length, elapsed / 1000)

  return (
    <div className="w-72 border-r border-pilos-border flex flex-col bg-pilos-bg flex-shrink-0">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-pilos-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon icon="lucide:sparkles" className="text-xs text-purple-400" />
            <h3 className="text-xs font-bold text-white">AI Builder</h3>
          </div>
          {chatMessages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
              title="Clear chat"
            >
              <Icon icon="lucide:trash-2" className="text-[10px]" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2">
        {isEmpty && (
          <div className="mt-4 mb-2">
            <div className="text-center mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-2.5">
                <Icon icon="lucide:sparkles" className="text-blue-400 text-lg" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">What do you want to automate?</h4>
              <p className="text-[10px] text-zinc-500 leading-relaxed">Describe your task in plain English.<br />Pilos will build the workflow.</p>
            </div>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(s.text); textareaRef.current?.focus() }}
                  className="w-full text-left flex items-start gap-2 px-3 py-2.5 rounded-lg border border-pilos-border bg-pilos-card text-[10px] text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors leading-relaxed"
                >
                  <Icon icon={s.icon} className="text-blue-500/40 text-[10px] flex-shrink-0 mt-0.5" />
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onRetry={msg.content.startsWith('__ERROR__:') ? handleRetry : undefined}
            onSimplify={msg.content.startsWith('__ERROR__:') ? handleSimplify : undefined}
          />
        ))}

        {/* Progress indicator while generating */}
        {chatIsGenerating && (
          <div className="mb-2">
            <div className="px-3 py-2.5 rounded-lg bg-pilos-card border border-purple-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Icon icon="lucide:loader-2" className="text-xs text-purple-400 animate-spin" />
                  <span className="text-[10px] font-medium text-purple-300">{progress.label}</span>
                </div>
                <span className="text-[9px] text-zinc-600 font-mono">{formatElapsed(elapsed)}</span>
              </div>
              {/* Progress bar */}
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions */}
      {nodes.length > 1 && !isEmpty && !chatIsGenerating && (
        <div className="px-3 py-1.5 border-t border-pilos-border flex-shrink-0">
          <button
            onClick={handleExplain}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Icon icon="lucide:help-circle" className="text-[10px]" />
            Explain this workflow
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="px-3 py-2.5 border-t border-pilos-border flex-shrink-0">
        <div className="flex gap-1.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your workflow..."
            rows={2}
            disabled={chatIsGenerating}
            className="flex-1 bg-pilos-card border border-pilos-border rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500 resize-none disabled:opacity-50"
          />
          <div className="flex flex-col gap-1">
            {chatIsGenerating ? (
              <button
                onClick={abortChat}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-colors"
                title="Stop"
              >
                <Icon icon="lucide:square" className="text-xs" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Send (Cmd+Enter)"
              >
                <Icon icon="lucide:send" className="text-xs" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <button
            onClick={toggleChatMode}
            className="text-[9px] text-zinc-700 hover:text-zinc-500 transition-colors"
          >
            Switch to manual editor
          </button>
          <span className="text-[9px] text-zinc-700">Cmd+Enter</span>
        </div>
      </div>
    </div>
  )
}
