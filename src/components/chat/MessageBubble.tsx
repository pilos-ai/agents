import { memo, useMemo, useState, useEffect } from 'react'
import type { ConversationMessage, ContentBlock } from '../../types'
import { AGENT_COLORS } from '../../data/agent-templates'
import { ToolUseBlock } from './ToolUseBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { ThinkingBlock } from './ThinkingBlock'
import { MarkdownRenderer } from './MarkdownRenderer'
import { OptionButtons, detectOptions } from './OptionButtons'
import { MessageReference } from './MessageReference'
import { useProjectStore } from '../../store/useProjectStore'
import { useConversationStore } from '../../store/useConversationStore'

// Lazily loaded PM story detection
let pmStoryModule: {
  detectStoryBlocks: (text: string) => string[]
  parseStoryBlock: (block: string) => { title: string; description: string; priority: string; points?: number; criteria: string[] } | null
  useStoryStore: any
} | null = null
let pmStoryAttempted = false

function loadPmStory() {
  if (pmStoryAttempted) return Promise.resolve()
  pmStoryAttempted = true
  return import('@pilos/agents-pm')
    .then((mod) => {
      pmStoryModule = {
        detectStoryBlocks: mod.detectStoryBlocks,
        parseStoryBlock: mod.parseStoryBlock,
        useStoryStore: mod.useStoryStore,
      }
    })
    .catch(() => {})
}

interface Props {
  message: ConversationMessage
  messages: ConversationMessage[]
  isLast?: boolean
}

function ReplyButton({ message }: { message: ConversationMessage }) {
  const setReplyTo = useConversationStore((s) => s.setReplyTo)
  if (message.type !== 'text' || !message.content) return null
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setReplyTo(message) }}
      className="absolute top-1.5 right-1.5 opacity-0 group-hover/bubble:opacity-100 p-1 rounded bg-neutral-600/80 hover:bg-neutral-500/80 text-neutral-300 transition-opacity cursor-pointer"
      title="Reply"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    </button>
  )
}

export const MessageBubble = memo(function MessageBubble({ message, messages, isLast }: Props) {
  const isUser = message.role === 'user'
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!pmStoryAttempted) {
      loadPmStory().then(() => forceUpdate((n) => n + 1))
    }
  }, [])

  const options = useMemo(() => {
    if (isUser || !isLast) return []
    return detectOptions(message.content)
  }, [message.content, isUser, isLast])

  // Detect story blocks in assistant messages (only if PM module loaded)
  const storyBlocks = useMemo(() => {
    if (isUser || !pmStoryModule) return []
    return pmStoryModule.detectStoryBlocks(message.content)
  }, [message.content, isUser])

  // Agent-attributed message (team mode) — may also have tool blocks
  if (!isUser && message.agentName) {
    const colors = AGENT_COLORS[message.agentColor || 'blue'] || AGENT_COLORS.blue
    // Extract non-text blocks (tool_use, tool_result) from contentBlocks
    const toolBlocks = message.contentBlocks?.filter(b => b.type !== 'text') || []

    return (
      <div className="flex flex-col items-start">
        {message.replyToId && <MessageReference replyToId={message.replyToId} messages={messages} />}
        <div className="flex items-center gap-1.5 mb-1 ml-1">
          <span className="text-base">{message.agentEmoji}</span>
          <span className={`text-xs font-semibold ${colors.text}`}>{message.agentName}</span>
        </div>
        {message.content && (
          <div className={`group/bubble relative max-w-[85%] rounded-lg px-4 py-2.5 ${colors.bgLight} border-l-2 ${colors.border} text-neutral-100`}>
            <div className="markdown-content text-sm">
              <MarkdownRenderer content={message.content} />
            </div>
            <ReplyButton message={message} />
          </div>
        )}
        {/* Render tool blocks (Edit, Write, Bash, etc.) after agent text */}
        {toolBlocks.length > 0 && (
          <div className="w-full space-y-1 mt-1">
            {toolBlocks.map((block, i) => renderContentBlock(block, i, false))}
          </div>
        )}
        {options.length > 0 && <OptionButtons options={options} />}
      </div>
    )
  }

  // Non-agent message with content blocks (solo mode)
  if (message.contentBlocks && message.contentBlocks.length > 0) {
    return (
      <div className="space-y-2">
        {message.replyToId && <MessageReference replyToId={message.replyToId} messages={messages} />}
        {message.contentBlocks.map((block, i) => renderContentBlock(block, i, isLast && i === message.contentBlocks!.length - 1))}
      </div>
    )
  }

  // Simple text message
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {message.replyToId && <MessageReference replyToId={message.replyToId} messages={messages} />}
      <div
        className={`group/bubble relative max-w-[85%] rounded-lg px-4 py-2.5 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-neutral-800/60 text-neutral-100'
        }`}
      >
        {/* Show attached images */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((img, i) => (
              <img
                key={i}
                src={`data:${img.mediaType};base64,${img.data}`}
                alt={img.name || 'attachment'}
                className="max-h-48 max-w-full rounded-md"
              />
            ))}
          </div>
        )}
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="markdown-content text-sm">
            <MarkdownRenderer content={message.content} />
          </div>
        )}
        <ReplyButton message={message} />
      </div>
      {storyBlocks.length > 0 && storyBlocks.map((block, i) => (
        <SaveStoryButton key={i} rawBlock={block} />
      ))}
      {options.length > 0 && <OptionButtons options={options} />}
    </div>
  )
})

function SaveStoryButton({ rawBlock }: { rawBlock: string }) {
  if (!pmStoryModule) return null
  const createStory = pmStoryModule.useStoryStore((s: any) => s.createStory)
  const addCriterion = pmStoryModule.useStoryStore((s: any) => s.addCriterion)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    if (!pmStoryModule) return
    const parsed = pmStoryModule.parseStoryBlock(rawBlock)
    if (!parsed) return

    const story = await createStory({
      projectPath: activeProjectPath || '',
      title: parsed.title,
      description: parsed.description,
      priority: parsed.priority,
      storyPoints: parsed.points,
      status: 'draft',
    })

    for (const criterion of parsed.criteria) {
      await addCriterion(story.id, criterion)
    }

    setSaved(true)
  }

  if (saved) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Saved to Stories
      </div>
    )
  }

  return (
    <button
      onClick={handleSave}
      className="mt-2 px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors flex items-center gap-1.5"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
      Save as Story
    </button>
  )
}

function renderContentBlock(block: ContentBlock, index: number, isLastBlock?: boolean) {
  switch (block.type) {
    case 'text': {
      const options = isLastBlock ? detectOptions(block.text) : []
      return (
        <div key={index} className="flex flex-col items-start">
          <div className="max-w-[85%] rounded-lg px-4 py-2.5 bg-neutral-800/60 text-neutral-100">
            <div className="markdown-content text-sm">
              <MarkdownRenderer content={block.text} />
            </div>
          </div>
          {options.length > 0 && <OptionButtons options={options} />}
        </div>
      )
    }

    case 'tool_use':
      return <ToolUseBlock key={index} block={block} />

    case 'tool_result':
      return <ToolResultBlock key={index} block={block} />

    case 'thinking':
      return <ThinkingBlock key={index} text={block.thinking} />

    default:
      return null
  }
}
