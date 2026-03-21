import { useRef, useCallback, useState } from 'react'
import { useConversationStore } from '../../store/useConversationStore'
import { useProjectStore } from '../../store/useProjectStore'
import { ReplyPreview } from './ReplyPreview'
import { AgentSkillsPanel } from './AgentSkillsPanel'
import { AGENT_COLORS } from '../../data/agent-templates'
import type { ImageAttachment } from '../../types'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:image/...;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface MentionState {
  query: string        // text after @ (may be empty)
  cursorStart: number  // index of the @ in the textarea value
}

export function InputBar() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendMessage = useConversationStore((s) => s.sendMessage)
  const queueMessage = useConversationStore((s) => s.queueMessage)
  const messageQueue = useConversationStore((s) => s.messageQueue)
  const clearMessageQueue = useConversationStore((s) => s.clearMessageQueue)
  const abortSession = useConversationStore((s) => s.abortSession)
  const permissionRequest = useConversationStore((s) => s.permissionRequest)
  const respondPermission = useConversationStore((s) => s.respondPermission)
  const isWaitingForResponse = useConversationStore((s) => s.isWaitingForResponse)
  const streaming = useConversationStore((s) => s.streaming)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const setProjectModel = useProjectStore((s) => s.setProjectModel)
  const setDraftText = useProjectStore((s) => s.setDraftText)
  const setDraftImages = useProjectStore((s) => s.setDraftImages)
  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const text = activeTab?.draftText || ''
  const images = activeTab?.draftImages || []
  const model = activeTab?.model || 'sonnet'
  const mcpCount = activeTab?.mcpServers?.filter((s) => s.enabled).length || 0
  const isTeamMode = activeTab?.mode === 'team'
  const agents = activeTab?.agents || []

  const isLoading = isWaitingForResponse || streaming.isStreaming

  // Skills panel visibility
  const [showSkills, setShowSkills] = useState(false)

  // @mention autocomplete state
  const [mention, setMention] = useState<MentionState | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const filteredAgents = mention
    ? agents.filter((a) => a.name.toLowerCase().startsWith(mention.query.toLowerCase()))
    : []

  const addImages = useCallback(async (files: FileList | File[]) => {
    const newImages: ImageAttachment[] = []
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) continue
      if (file.size > MAX_IMAGE_SIZE) continue
      const data = await fileToBase64(file)
      newImages.push({
        data,
        mediaType: file.type,
        name: file.name || 'pasted-image',
      })
    }
    if (newImages.length > 0) {
      const current = useProjectStore.getState().openProjects.find(
        (p) => p.projectPath === useProjectStore.getState().activeProjectPath
      )
      setDraftImages([...(current?.draftImages || []), ...newImages])
    }
  }, [setDraftImages])

  const removeImage = useCallback((index: number) => {
    const current = useProjectStore.getState().openProjects.find(
      (p) => p.projectPath === useProjectStore.getState().activeProjectPath
    )
    setDraftImages((current?.draftImages || []).filter((_, i) => i !== index))
  }, [setDraftImages])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed && images.length === 0) return

    const messageText = trimmed || 'What is in this image?'
    const messageImages = images.length > 0 ? images : undefined

    if (isLoading) {
      // Queue the message while Claude is responding
      queueMessage(messageText, messageImages)
    } else {
      sendMessage(messageText, messageImages)
    }

    setDraftText('')
    setDraftImages([])
    setMention(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, images, isLoading, sendMessage, queueMessage, setDraftText, setDraftImages])

  // Insert a mention selection into the textarea text
  const selectMention = useCallback((agentName: string) => {
    if (!mention) return
    const before = text.slice(0, mention.cursorStart)
    const after = text.slice(mention.cursorStart + 1 + mention.query.length)
    const newText = before + '@' + agentName + ' ' + after
    setDraftText(newText)
    setMention(null)
    setMentionIndex(0)
    // Restore focus + move cursor after inserted name
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const pos = mention.cursorStart + agentName.length + 2 // @Name<space>
      el.setSelectionRange(pos, pos)
    })
  }, [mention, text, setDraftText])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention navigation
    if (mention && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % filteredAgents.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + filteredAgents.length) % filteredAgents.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && mention)) {
        e.preventDefault()
        selectMention(filteredAgents[mentionIndex]?.name || filteredAgents[0].name)
        return
      }
      if (e.key === 'Escape') {
        setMention(null)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // If there's a pending permission request and no text, approve it
      if (permissionRequest && !text.trim()) {
        respondPermission(true)
        return
      }
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setDraftText(val)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'

    // @mention detection
    if (agents.length > 0) {
      const cursor = el.selectionStart ?? val.length
      const textBeforeCursor = val.slice(0, cursor)
      // Find last @ that is at start or after whitespace (no lookbehind needed)
      const atIndex = textBeforeCursor.lastIndexOf('@')
      if (atIndex !== -1) {
        const charBefore = textBeforeCursor[atIndex - 1]
        const isValidStart = atIndex === 0 || charBefore === ' ' || charBefore === '\n'
        const query = textBeforeCursor.slice(atIndex + 1)
        const hasSpace = query.includes(' ')
        if (isValidStart && !hasSpace) {
          setMention({ query, cursorStart: atIndex })
          setMentionIndex(0)
        } else {
          setMention(null)
        }
      } else {
        setMention(null)
      }
    } else {
      setMention(null)
    }
  }

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault()
      await addImages(imageFiles)
    }
  }, [addImages])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await addImages(files)
    }
    // Reset so same file can be selected again
    e.target.value = ''
  }, [addImages])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      await addImages(files)
    }
  }, [addImages])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  return (
    <div
      className="border-t border-neutral-800 bg-neutral-900/30 p-3"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Reply preview */}
      <ReplyPreview />

      {/* Skills panel */}
      {showSkills && agents.length > 0 && (
        <AgentSkillsPanel agents={agents} onClose={() => setShowSkills(false)} />
      )}

      {/* File previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              {img.mediaType === 'application/pdf' ? (
                <div className="h-16 w-16 flex flex-col items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800">
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-[8px] text-neutral-500 mt-0.5">PDF</span>
                </div>
              ) : (
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name || 'attachment'}
                  className="h-16 w-16 object-cover rounded-lg border border-neutral-700"
                />
              )}
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Queued messages indicator */}
      {messageQueue.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-amber-300">
            {messageQueue.length} message{messageQueue.length > 1 ? 's' : ''} queued
          </span>
          <button
            onClick={clearMessageQueue}
            className="ml-auto text-xs text-amber-400/60 hover:text-amber-300 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* @mention dropdown */}
      {mention && filteredAgents.length > 0 && (
        <div className="mb-1 rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg overflow-hidden">
          {filteredAgents.map((agent, i) => {
            const colors = AGENT_COLORS[agent.color] || AGENT_COLORS.blue
            return (
              <button
                key={agent.id}
                onMouseDown={(e) => { e.preventDefault(); selectMention(agent.name) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${i === mentionIndex ? 'bg-neutral-700/60' : 'hover:bg-neutral-800'}`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${colors.bgLight} ${colors.text}`}>
                  {agent.name[0]}
                </div>
                <span className={`text-xs font-medium ${colors.text}`}>@{agent.name}</span>
                <span className="text-[10px] text-neutral-500 truncate">{agent.role}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 h-[36px] w-[36px] flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 rounded-lg transition-colors shrink-0 cursor-pointer"
          title="Attach file"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        {/* @ mention button — only in team mode */}
        {agents.length > 0 && (
          <button
            onClick={() => {
              const el = textareaRef.current
              if (!el) return
              const pos = el.selectionStart ?? el.value.length
              const before = text.slice(0, pos)
              const after = text.slice(pos)
              const needsSpace = before.length > 0 && !before.endsWith(' ')
              const insert = (needsSpace ? ' @' : '@')
              const newText = before + insert + after
              setDraftText(newText)
              requestAnimationFrame(() => {
                el.focus()
                const newPos = pos + insert.length
                el.setSelectionRange(newPos, newPos)
                // Trigger mention detection
                const atIndex = newText.lastIndexOf('@', newPos - 1)
                setMention({ query: '', cursorStart: atIndex })
                setMentionIndex(0)
              })
            }}
            className="p-2 h-[36px] w-[36px] flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-blue-400 rounded-lg transition-colors shrink-0 cursor-pointer font-medium text-sm"
            title="Mention an agent"
          >
            @
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isLoading ? 'Type to queue a message...' : (images.length > 0 ? 'Add a message about the attachment...' : (agents.length > 0 ? 'Message the team... (@ to mention an agent)' : 'Send a message to Pilos...'))}
          rows={1}
          className="flex-1 min-w-0 bg-neutral-800 text-neutral-100 rounded-lg px-4 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-neutral-500"
        />

        {/* Skills button — only in team mode */}
        {agents.length > 0 && (
          <button
            onClick={() => setShowSkills((v) => !v)}
            className={`p-2 h-[36px] w-[36px] flex items-center justify-center rounded-lg transition-colors shrink-0 cursor-pointer ${showSkills ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-yellow-400'}`}
            title="Show agent skills"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </button>
        )}

        {/* Model selector — always visible, disabled during loading */}
        <select
          value={model}
          onChange={(e) => setProjectModel(e.target.value)}
          disabled={isLoading}
          className={`bg-neutral-800 text-xs rounded-md px-2 py-2 h-[36px] min-w-[80px] outline-none border cursor-pointer shrink-0 transition-opacity ${isLoading ? 'opacity-40 cursor-not-allowed border-neutral-700 text-neutral-500' : 'text-neutral-300 border-neutral-700 hover:border-neutral-600'}`}
        >
          <option value="sonnet">Sonnet</option>
          <option value="opus">Opus</option>
          <option value="haiku">Haiku</option>
        </select>

        {/* MCP badge */}
        {mcpCount > 0 && (
          <div className={`flex items-center gap-1 px-2 py-1 h-[36px] bg-neutral-800 border border-green-500/30 rounded-md text-green-400 text-xs shrink-0 transition-opacity ${isLoading ? 'opacity-40' : ''}`}>
            <span>MCP</span>
            <span className="font-medium">{mcpCount}</span>
          </div>
        )}

        {/* Send / Queue button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() && images.length === 0}
          className="p-2 h-[36px] w-[36px] flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg transition-colors shrink-0 cursor-pointer"
          title={isLoading ? 'Queue message (Enter)' : 'Send (Enter)'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
          </svg>
        </button>

        {/* Stop button (shown during loading) */}
        {isLoading && (
          <button
            onClick={abortSession}
            className="p-2 h-[36px] w-[36px] flex items-center justify-center bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shrink-0 cursor-pointer"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
