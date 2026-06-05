/**
 * MessageBubble — pilos-prototype-styled chat message.
 *
 * Implements the prototype's `.cmsg` markup (see pilos-handoff/app/screen_chat.jsx
 * lines 38–58): 30×30 .cav avatar, .cbody with .chead (name/role/time) and
 * .ctext (paragraphs / code-blocks / msg-tools).
 *
 * Behavior preserved 1:1: still routes ToolUseBlock / ToolResultBlock /
 * ThinkingBlock / Ask / Plan blocks through their dedicated components; still
 * detects trailing options + PM story blocks; still wires Reply via store.
 */
import { memo, useMemo, useState, useEffect } from 'react'
import type { ConversationMessage, ContentBlock } from '../../types'
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
  isLast?: boolean
  /** When true, this message is grouped under the previous bubble:
   *  hide avatar + header, render the body indented to align. */
  grouped?: boolean
}

const COLOR_GRADIENT: Record<string, string> = {
  blue: 'cav-grad-blue',
  purple: 'cav-grad-purple',
  green: 'cav-grad-green',
  pink: 'cav-grad-pink',
  orange: 'cav-grad-orange',
  cyan: 'cav-grad-cyan',
  yellow: 'cav-grad-yellow',
  red: 'cav-grad-red',
  indigo: 'cav-grad-indigo',
}

function avatarClass(color?: string, isUser?: boolean) {
  if (isUser) return 'cav-grad-user'
  if (color && COLOR_GRADIENT[color]) return COLOR_GRADIENT[color]
  return 'cav-grad-claude'
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function avatarCode(message: ConversationMessage): string {
  if (message.role === 'user') return 'YOU'
  if (message.agentName) return message.agentName.slice(0, 2).toUpperCase()
  return 'CL'
}

function displayName(message: ConversationMessage): string {
  if (message.role === 'user') return 'You'
  return message.agentName || 'Claude'
}

function ReplyButton({ message }: { message: ConversationMessage }) {
  const setReplyTo = useConversationStore((s) => s.setReplyTo)
  if (message.type !== 'text' || !message.content) return null
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setReplyTo(message) }}
      className="mini-ico reply-mini"
      style={{ width: 22, height: 22, marginLeft: 4 }}
      title="Reply"
    >
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    </button>
  )
}

function MessageImages({ images }: { images: NonNullable<ConversationMessage['images']> }) {
  return (
    <div className="ctext-images">
      {images.map((img, i) =>
        img.mediaType === 'application/pdf' ? (
          <div key={i} className="pdf-thumb">PDF · {img.name || 'document.pdf'}</div>
        ) : (
          <img
            key={i}
            src={`data:${img.mediaType};base64,${img.data}`}
            alt={img.name || 'attachment'}
          />
        )
      )}
    </div>
  )
}

export const MessageBubble = memo(function MessageBubble({ message, isLast, grouped }: Props) {
  const isUser = message.role === 'user'
  const [, forceUpdate] = useState(0)
  // When grouped under the previous bubble, render a placeholder avatar (transparent)
  // so the body stays aligned with the avatar column, and skip the header entirely.
  const renderHeader = !grouped
  const avatarNode = grouped
    ? <div className="cav" aria-hidden style={{ background: 'transparent', visibility: 'hidden' }} />
    : null

  useEffect(() => {
    if (!pmStoryAttempted) {
      loadPmStory().then(() => forceUpdate((n) => n + 1))
    }
  }, [])

  const options = useMemo(() => {
    if (isUser || !isLast) return []
    return detectOptions(message.content)
  }, [message.content, isUser, isLast])

  const storyBlocks = useMemo(() => {
    if (isUser || !pmStoryModule) return []
    return pmStoryModule.detectStoryBlocks(message.content)
  }, [message.content, isUser])

  // ──── Thinking message (persisted) — renders as a subtle italic tile ────
  if (message.type === 'thinking' && message.content) {
    return (
      <div className={'cmsg' + (grouped ? ' grouped' : '')}>
        {avatarNode ?? <div className={`cav ${avatarClass(message.agentColor)}`}>{avatarCode(message)}</div>}
        <div className="cbody">
          {renderHeader && (
            <div className="chead">
              <span className="cname">{displayName(message)}</span>
              <span className="crole">thinking</span>
              {message.timestamp ? <span className="ctime">{formatTime(message.timestamp)}</span> : null}
            </div>
          )}
          <div className="ctext">
            <div className="thinking-box">
              <span className="head">Thinking</span>
              <span className="thinking-body">{message.content}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ──── Solo-mode message with contentBlocks (mixed text + tool blocks) ────
  // Render as a single .cmsg wrapping the concatenated text and tool blocks.
  if (!isUser && message.contentBlocks && message.contentBlocks.length > 0) {
    return (
      <div className={'cmsg' + (grouped ? ' grouped' : '')}>
        {avatarNode ?? <div className={`cav ${avatarClass(message.agentColor)}`}>{avatarCode(message)}</div>}
        <div className="cbody">
          {renderHeader && (
            <div className="chead">
              <span className="cname">{displayName(message)}</span>
              {message.agentName && <span className="crole">assistant</span>}
              {message.timestamp ? <span className="ctime">{formatTime(message.timestamp)}</span> : null}
            </div>
          )}
          {message.replyToId && <MessageReference replyToId={message.replyToId} />}
          <div className="ctext">
            {message.contentBlocks.map((block, i) => renderContentBlock(block, i, isLast && i === message.contentBlocks!.length - 1))}
          </div>
          {options.length > 0 && <OptionButtons options={options} />}
        </div>
      </div>
    )
  }

  // ──── Standard text message (user or agent) ────
  return (
    <div className={'cmsg' + (isUser ? ' user' : '') + (grouped ? ' grouped' : '')}>
      {avatarNode ?? <div className={`cav ${avatarClass(message.agentColor, isUser)}`}>{avatarCode(message)}</div>}
      <div className="cbody">
        {renderHeader && (
          <div className="chead">
            <span className="cname">{displayName(message)}</span>
            {!isUser && message.agentName && <span className="crole">assistant</span>}
            {message.timestamp ? <span className="ctime">{formatTime(message.timestamp)}</span> : null}
            {!isUser && message.type === 'text' && message.content ? (
              <ReplyButton message={message} />
            ) : null}
          </div>
        )}
        {message.replyToId && <MessageReference replyToId={message.replyToId} />}
        <div className="ctext">
          {message.images && message.images.length > 0 && <MessageImages images={message.images} />}
          {isUser ? (
            <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</p>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>
        {storyBlocks.length > 0 && storyBlocks.map((block, i) => (
          <SaveStoryButton key={i} rawBlock={block} />
        ))}
        {options.length > 0 && <OptionButtons options={options} />}
      </div>
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
      <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ok)' }}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Saved to Stories
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      className="btn sm"
      style={{ marginTop: 8 }}
    >
      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        <div key={index}>
          <MarkdownRenderer content={block.text} />
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
