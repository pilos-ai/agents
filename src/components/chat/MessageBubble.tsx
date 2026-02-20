import { useMemo } from 'react'
import type { ConversationMessage, ContentBlock } from '../../types'
import { AGENT_COLORS } from '../../data/agent-templates'
import { ToolUseBlock } from './ToolUseBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { ThinkingBlock } from './ThinkingBlock'
import { MarkdownRenderer } from './MarkdownRenderer'
import { OptionButtons, detectOptions } from './OptionButtons'

interface Props {
  message: ConversationMessage
  isLast?: boolean
}

export function MessageBubble({ message, isLast }: Props) {
  const isUser = message.role === 'user'

  const options = useMemo(() => {
    if (isUser || !isLast) return []
    return detectOptions(message.content)
  }, [message.content, isUser, isLast])

  // Agent-attributed message (team mode) — may also have tool blocks
  if (!isUser && message.agentName) {
    const colors = AGENT_COLORS[message.agentColor || 'blue'] || AGENT_COLORS.blue
    // Extract non-text blocks (tool_use, tool_result) from contentBlocks
    const toolBlocks = message.contentBlocks?.filter(b => b.type !== 'text') || []

    return (
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-1.5 mb-1 ml-1">
          <span className="text-base">{message.agentEmoji}</span>
          <span className={`text-xs font-semibold ${colors.text}`}>{message.agentName}</span>
        </div>
        {message.content && (
          <div className={`max-w-[85%] rounded-lg px-4 py-2.5 ${colors.bgLight} border-l-2 ${colors.border} text-neutral-100`}>
            <div className="markdown-content text-sm">
              <MarkdownRenderer content={message.content} />
            </div>
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
        {message.contentBlocks.map((block, i) => renderContentBlock(block, i, isLast && i === message.contentBlocks!.length - 1))}
      </div>
    )
  }

  // Simple text message
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
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
      </div>
      {options.length > 0 && <OptionButtons options={options} />}
    </div>
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
