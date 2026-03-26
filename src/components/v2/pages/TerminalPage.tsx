import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '../../common/Icon'
import { AgentSkillsPanel } from '../../chat/AgentSkillsPanel'
import { AGENT_COLORS } from '../../../data/agent-templates'
import { StatusDot } from '../components/StatusDot'
import { GradientAvatar } from '../components/GradientAvatar'
import { useConversationStore } from '../../../store/useConversationStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { useWorkflowDetection } from '../../../hooks/useWorkflowDetection'
import { ConvertConversationModal } from '../components/ConvertConversationModal'
import { WorkflowSuggestionBanner } from '../components/WorkflowSuggestionBanner'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { ProBadge } from '../../common/ProBadge'
import type { ImageAttachment } from '../../../types'
import { SessionInfoPanel } from '../../session/SessionInfoPanel'

// Reuse existing chat components
import { MessageBubble } from '../../chat/MessageBubble'
import { PermissionBanner } from '../../chat/PermissionBanner'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return 0
  const { endContainer, endOffset } = sel.getRangeAt(0)
  const range = document.createRange()
  range.setStart(el, 0)
  range.setEnd(endContainer, endOffset)
  const tmp = document.createElement('div')
  tmp.appendChild(range.cloneContents())
  return tmp.innerText.length
}

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function ConversationSidebar() {
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation)
  const createConversation = useConversationStore((s) => s.createConversation)
  const deleteConversation = useConversationStore((s) => s.deleteConversation)
  const renameConversation = useConversationStore((s) => s.renameConversation)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditTitle(currentTitle || 'New Conversation')
    setContextMenu(null)
  }

  const commitRename = async () => {
    if (editingId && editTitle.trim()) {
      await renameConversation(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    setContextMenu(null)
    await deleteConversation(id)
  }

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    setContextMenu({ id, x: e.clientX, y: e.clientY })
  }

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
          <div
            key={conv.id}
            onContextMenu={(e) => handleContextMenu(e, conv.id)}
            className="group relative"
          >
            {editingId === conv.id ? (
              <div className="px-3 py-2.5 border-b border-pilos-border/50">
                <input
                  ref={editInputRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="w-full bg-zinc-800 border border-blue-500/50 rounded px-2 py-1 text-xs text-white outline-none"
                />
              </div>
            ) : (
              <button
                onClick={() => setActiveConversation(conv.id)}
                onDoubleClick={() => startRename(conv.id, conv.title)}
                className={`w-full text-left px-3 py-2.5 text-xs transition-colors border-b border-pilos-border/50 ${
                  activeConversationId === conv.id
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                }`}
              >
                <p className="truncate font-medium pr-6">{conv.title || 'New Conversation'}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </p>
              </button>
            )}
            {/* Hover actions */}
            {editingId !== conv.id && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(conv.id, conv.title) }}
                  className="p-1 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 rounded transition-colors"
                  title="Rename"
                >
                  <Icon icon="lucide:pencil" className="text-[10px]" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(conv.id) }}
                  className="p-1 text-zinc-600 hover:text-red-400 hover:bg-zinc-700 rounded transition-colors"
                  title="Delete"
                >
                  <Icon icon="lucide:trash-2" className="text-[10px]" />
                </button>
              </div>
            )}
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-[10px] text-zinc-600">No conversations yet</p>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const conv = conversations.find((c) => c.id === contextMenu.id)
              if (conv) startRename(conv.id, conv.title)
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
          >
            <Icon icon="lucide:pencil" className="text-[10px]" />
            Rename
          </button>
          <button
            onClick={() => handleDelete(contextMenu.id)}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 flex items-center gap-2"
          >
            <Icon icon="lucide:trash-2" className="text-[10px]" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function TerminalControls({ onSaveAsTask, showLogs, onToggleLogs }: { onSaveAsTask: () => void; showLogs: boolean; onToggleLogs: () => void }) {
  const messages = useConversationStore((s) => s.messages)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const conversations = useConversationStore((s) => s.conversations)
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'
  const [copied, setCopied] = useState(false)

  const handleCopyAll = () => {
    const text = messages
      .filter((m) => m.type === 'text')
      .map((m) => `${m.role === 'user' ? '> ' : ''}${m.content}`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = () => {
    const conv = conversations.find((c) => c.id === activeConversationId)
    const title = conv?.title || 'conversation'

    const lines: string[] = [`# ${title}`, '']
    for (const msg of messages) {
      if (msg.type === 'text') {
        if (msg.role === 'user') {
          lines.push(`**User:**`, '', msg.content, '')
        } else {
          const agent = msg.agentName ? `**${msg.agentName}:**` : '**Assistant:**'
          lines.push(agent, '', msg.content, '')
        }
      } else if (msg.type === 'tool_use' && msg.toolName) {
        lines.push(`> Tool: \`${msg.toolName}\``, '')
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 border-b border-pilos-border bg-pilos-card/30 flex-shrink-0">
      <button
        onClick={isPro ? handleCopyAll : undefined}
        disabled={!isPro || messages.length === 0}
        className="px-2 py-1 text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
      >
        <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} className="text-[10px]" />
        {copied ? 'Copied' : 'Copy All'}
        {!isPro && <ProBadge />}
      </button>
      <button
        onClick={isPro ? handleExport : undefined}
        disabled={!isPro || messages.length === 0}
        className="px-2 py-1 text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
      >
        <Icon icon="lucide:download" className="text-[10px]" />
        Export
        {!isPro && <ProBadge />}
      </button>
      <div className="w-px h-3 bg-pilos-border mx-1" />
      <button
        onClick={isPro ? onSaveAsTask : undefined}
        disabled={!isPro || messages.length < 4}
        className="px-2 py-1 text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
      >
        <Icon icon="lucide:workflow" className="text-[10px]" />
        Save as Task
        {!isPro && <ProBadge />}
      </button>
      <div className="flex-1" />
      <button
        onClick={onToggleLogs}
        className={`px-2 py-1 text-[10px] rounded transition-colors flex items-center gap-1 ${showLogs ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}
        title="Toggle process logs"
      >
        <Icon icon="lucide:terminal" className="text-[10px]" />
        Logs
      </button>
    </div>
  )
}

function TerminalInput() {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const sendMessage = useConversationStore((s) => s.sendMessage)
  const queueMessage = useConversationStore((s) => s.queueMessage)
  const messageQueue = useConversationStore((s) => s.messageQueue)
  const clearMessageQueue = useConversationStore((s) => s.clearMessageQueue)
  const replyToMessage = useConversationStore((s) => s.replyToMessage)
  const setReplyTo = useConversationStore((s) => s.setReplyTo)
  const isWaitingForResponse = useConversationStore((s) => s.isWaitingForResponse)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const abortSession = useConversationStore((s) => s.abortSession)
  const permissionRequest = useConversationStore((s) => s.permissionRequest)
  const respondPermission = useConversationStore((s) => s.respondPermission)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const isLoading = isWaitingForResponse || isStreaming
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Agents + model from active tab
  const activeTab = useProjectStore((s) => s.openProjects.find((p) => p.projectPath === s.activeProjectPath))
  const agents = activeTab?.agents || []
  const model = activeTab?.model || 'sonnet'
  const setProjectModel = useProjectStore((s) => s.setProjectModel)

  // Model dropdown
  const [showModelMenu, setShowModelMenu] = useState(false)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showModelMenu) return
    const handler = (e: MouseEvent) => {
      if (!modelMenuRef.current?.contains(e.target as Node)) setShowModelMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelMenu])

  const MODELS = [
    { value: 'sonnet', label: 'Sonnet', desc: 'Fast & smart' },
    { value: 'opus', label: 'Opus', desc: 'Most capable' },
    { value: 'haiku', label: 'Haiku', desc: 'Fastest' },
  ]

  // Skills panel
  const [showSkills, setShowSkills] = useState(false)

  // @mention state
  const [mention, setMention] = useState<{ query: string; cursorStart: number } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const filteredAgents = mention
    ? agents.filter((a) => a.name.toLowerCase().startsWith(mention.query.toLowerCase()))
    : []

  const selectMention = useCallback((agentName: string) => {
    if (!mention || !editorRef.current) return
    const el = editorRef.current
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    if (range.endContainer.nodeType !== Node.TEXT_NODE) return

    const replaceLen = 1 + mention.query.length
    const startOffset = Math.max(0, range.endOffset - replaceLen)
    const replaceRange = document.createRange()
    replaceRange.setStart(range.endContainer, startOffset)
    replaceRange.setEnd(range.endContainer, range.endOffset)
    replaceRange.deleteContents()

    const agent = agents.find((a) => a.name === agentName)
    const colors = AGENT_COLORS[agent?.color || 'blue'] || AGENT_COLORS.blue
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.className = [
      'inline-flex items-center rounded px-1.5 leading-5 text-xs font-semibold border select-none',
      colors.bgLight, colors.text, colors.border,
    ].join(' ')
    chip.style.verticalAlign = 'middle'
    chip.dataset.mention = agentName
    chip.textContent = '@' + agentName
    replaceRange.insertNode(chip)

    const after = document.createRange()
    after.setStartAfter(chip)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
    document.execCommand('insertText', false, ' ')

    setText(el.innerText.replace(/^\n$/, ''))
    setMention(null)
    setMentionIndex(0)
  }, [mention, agents])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const newImages: ImageAttachment[] = []
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) continue
      if (file.size > MAX_FILE_SIZE) continue
      const data = await fileToBase64(file)
      newImages.push({
        data,
        mediaType: file.type,
        name: file.name || 'pasted-image',
      })
    }
    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages])
    }
  }, [])

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSend = () => {
    const trimmed = text.trim()
    if ((!trimmed && images.length === 0) || !activeConversationId) return
    const messageText = trimmed || 'What is in this image?'
    const messageImages = images.length > 0 ? images : undefined
    if (isLoading) {
      queueMessage(messageText, messageImages)
    } else {
      sendMessage(messageText, messageImages)
    }
    setText('')
    setImages([])
    if (editorRef.current) {
      editorRef.current.innerHTML = ''
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mention && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % filteredAgents.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => (i - 1 + filteredAgents.length) % filteredAgents.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && mention)) { e.preventDefault(); selectMention(filteredAgents[mentionIndex]?.name || filteredAgents[0].name); return }
      if (e.key === 'Escape') { setMention(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (permissionRequest && !text.trim()) { respondPermission(true); return }
      handleSend()
    }
  }

  const handleInput = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const val = el.innerText.replace(/^\n$/, '')
    setText(val)
    if (agents.length > 0) {
      const cursor = getCaretOffset(el)
      const textBeforeCursor = val.slice(0, cursor)
      const atIndex = textBeforeCursor.lastIndexOf('@')
      if (atIndex !== -1) {
        const charBefore = textBeforeCursor[atIndex - 1]
        const isValidStart = atIndex === 0 || charBefore === ' ' || charBefore === '\n'
        const query = textBeforeCursor.slice(atIndex + 1)
        if (isValidStart && !query.includes(' ')) {
          setMention({ query, cursorStart: atIndex })
          setMentionIndex(0)
          return
        }
      }
    }
    setMention(null)
  }, [agents])

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
      await addFiles(imageFiles)
      return
    }
    // Strip rich-text formatting — insert as plain text, converting \n to <br>
    e.preventDefault()
    const plain = e.clipboardData.getData('text/plain')
    const sel2 = window.getSelection()
    if (!sel2 || !sel2.rangeCount) return
    const r = sel2.getRangeAt(0)
    r.deleteContents()
    const lines = plain.split('\n')
    const frag = document.createDocumentFragment()
    lines.forEach((line, i) => {
      if (i > 0) frag.appendChild(document.createElement('br'))
      if (line) frag.appendChild(document.createTextNode(line))
    })
    r.insertNode(frag)
    r.collapse(false)
    sel2.removeAllRanges()
    sel2.addRange(r)
  }, [addFiles])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await addFiles(files)
    }
    e.target.value = ''
  }, [addFiles])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      await addFiles(files)
    }
  }, [addFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  return (
    <div
      className={`border-t border-pilos-border bg-[#0c0c0e] px-4 py-3 flex-shrink-0 transition-colors ${
        isDragging ? 'bg-blue-500/5 border-blue-500/30' : ''
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay hint */}
      {isDragging && (
        <div className="flex items-center justify-center gap-2 py-2 mb-2 rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5">
          <Icon icon="lucide:upload" className="text-blue-400 text-sm" />
          <span className="text-xs text-blue-400">Drop file here</span>
        </div>
      )}

      {/* Reply preview */}
      {replyToMessage && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <Icon icon="lucide:reply" className="text-blue-400 text-xs flex-shrink-0" />
          <span className="text-xs text-blue-300 truncate flex-1">
            <span className="font-medium">{replyToMessage.role === 'user' ? 'You' : (replyToMessage.agentName || 'Assistant')}:</span>{' '}
            {replyToMessage.content.slice(0, 100)}{replyToMessage.content.length > 100 ? '...' : ''}
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="text-blue-400/60 hover:text-blue-300 transition-colors cursor-pointer flex-shrink-0"
          >
            <Icon icon="lucide:x" className="text-xs" />
          </button>
        </div>
      )}

      {/* File previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              {img.mediaType === 'application/pdf' ? (
                <div className="h-14 w-14 flex items-center justify-center rounded-lg border border-pilos-border bg-zinc-800">
                  <Icon icon="lucide:file-text" className="text-red-400 text-lg" />
                </div>
              ) : (
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name || 'attachment'}
                  className="h-14 w-14 object-cover rounded-lg border border-pilos-border"
                />
              )}
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Icon icon="lucide:x" className="text-[8px]" />
              </button>
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-zinc-300 text-center py-0.5 rounded-b-lg truncate px-1">
                {img.name || 'file'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Queued messages indicator */}
      {messageQueue.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Icon icon="lucide:clock" className="text-amber-400 text-xs" />
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

      {/* Skills panel */}
      {showSkills && agents.length > 0 && (
        <AgentSkillsPanel agents={agents} onClose={() => setShowSkills(false)} />
      )}

      {/* @mention dropdown */}
      {mention && filteredAgents.length > 0 && (
        <div className="mb-1 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg overflow-hidden">
          {filteredAgents.map((agent, i) => {
            const colors = AGENT_COLORS[agent.color] || AGENT_COLORS.blue
            return (
              <button
                key={agent.id}
                onMouseDown={(e) => { e.preventDefault(); selectMention(agent.name) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer ${i === mentionIndex ? 'bg-zinc-700/60' : 'hover:bg-zinc-800'}`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${colors.bgLight} ${colors.text}`}>
                  {agent.name[0]}
                </div>
                <span className={`text-xs font-medium ${colors.text}`}>@{agent.name}</span>
                <span className="text-[10px] text-zinc-500 truncate">{agent.role}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-3">
        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!activeConversationId}
          className="p-2 h-[32px] w-[32px] flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 rounded-lg transition-colors flex-shrink-0"
          title="Attach file (or paste / drag & drop)"
        >
          <Icon icon="lucide:paperclip" className="text-sm" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* @ mention button */}
        {agents.length > 0 && (
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              const el = editorRef.current
              if (!el) return
              el.focus()
              const sel = window.getSelection()
              if (!sel) return
              if (!sel.rangeCount || !el.contains(sel.getRangeAt(0).endContainer)) {
                const range = document.createRange()
                range.selectNodeContents(el)
                range.collapse(false)
                sel.removeAllRanges()
                sel.addRange(range)
              }
              const raw = el.innerText.replace(/^\n$/, '')
              const offset = getCaretOffset(el)
              const before = raw.slice(0, offset)
              const insert = before.length > 0 && !before.endsWith(' ') ? ' @' : '@'
              document.execCommand('insertText', false, insert)
              setMention({ query: '', cursorStart: getCaretOffset(el) - 1 })
              setMentionIndex(0)
              setText(el.innerText.replace(/^\n$/, ''))
            }}
            className="p-2 h-[32px] w-[32px] flex items-center justify-center text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0 font-medium text-sm cursor-pointer"
            title="Mention an agent"
          >
            @
          </button>
        )}

        {/* Contenteditable rich input */}
        <div
          ref={editorRef}
          contentEditable={!!activeConversationId}
          suppressContentEditableWarning
          data-placeholder={
            isLoading
              ? 'Type to queue a message...'
              : images.length > 0
                ? 'Add a message about the attachment...'
                : agents.length > 0
                  ? 'Message the team... (@ to mention)'
                  : activeConversationId
                    ? 'Send a message...'
                    : 'Create a conversation first...'
          }
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={`flex-1 min-w-0 text-sm text-zinc-100 font-mono leading-relaxed outline-none min-h-[20px] max-h-[120px] overflow-y-auto overflow-x-hidden break-words empty:before:content-[attr(data-placeholder)] empty:before:text-zinc-600 empty:before:pointer-events-none ${!activeConversationId ? 'opacity-40 pointer-events-none' : ''}`}
          style={{ wordBreak: 'break-word' }}
        />

        {/* Skills button */}
        {agents.length > 0 && (
          <button
            onClick={() => setShowSkills((v) => !v)}
            className={`p-2 h-[32px] w-[32px] flex items-center justify-center rounded-lg transition-colors flex-shrink-0 cursor-pointer ${showSkills ? 'bg-yellow-500/20 text-yellow-400' : 'text-zinc-500 hover:text-yellow-400 hover:bg-zinc-800'}`}
            title="Agent skills"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </button>
        )}

        {/* Model selector */}
        <div ref={modelMenuRef} className="relative flex-shrink-0">
          <button
            onClick={() => !isLoading && setShowModelMenu((v) => !v)}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 h-[32px] rounded-lg border text-xs font-medium transition-all ${isLoading ? 'opacity-40 cursor-not-allowed border-zinc-700 bg-zinc-800/50 text-zinc-500' : 'border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white cursor-pointer'}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
            {MODELS.find((m) => m.value === model)?.label ?? 'Sonnet'}
            <svg className="w-3 h-3 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>

          {showModelMenu && (
            <div className="absolute bottom-full mb-2 right-0 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
              {MODELS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => { setProjectModel(m.value); setShowModelMenu(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${model === m.value ? 'bg-blue-600/20 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${model === m.value ? 'bg-blue-400' : 'bg-zinc-600'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{m.label}</div>
                    <div className="text-[10px] text-zinc-500">{m.desc}</div>
                  </div>
                  {model === m.value && (
                    <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Send / Queue button */}
        <button
          onClick={handleSend}
          disabled={(!text.trim() && images.length === 0) || !activeConversationId}
          className="px-4 h-[32px] bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
        >
          <Icon icon="lucide:send" className="text-[10px]" />
          {isLoading ? 'Queue' : 'Send'}
        </button>
        {/* Stop button */}
        {isLoading && (
          <button
            onClick={abortSession}
            className="px-4 h-[32px] bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Icon icon="lucide:square" className="text-[10px]" />
            Stop
          </button>
        )}
      </div>
    </div>
  )
}

export default function TerminalPage() {
  const messages = useConversationStore((s) => s.messages)
  const streaming = useConversationStore((s) => s.streaming)
  const messageQueue = useConversationStore((s) => s.messageQueue)
  const permissionRequest = useConversationStore((s) => s.permissionRequest)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const isLoadingMessages = useConversationStore((s) => s.isLoadingMessages)
  const isWaitingForResponse = useConversationStore((s) => s.isWaitingForResponse)

  const activeTab = useProjectStore((s) => {
    const path = s.activeProjectPath
    return s.openProjects.find((p) => p.projectPath === path)
  })
  const agents = activeTab?.agents || []
  const currentAgent = agents.find((a) => a.name === streaming.currentAgentName)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevConversationId = useRef(activeConversationId)
  const justSwitched = useRef(true)
  const userScrolledUp = useRef(false)

  // Context menu: textarea handled by Electron main (spell check), messages via IPC
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Textarea: don't preventDefault — let main process context-menu handle with spell check
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return
      // Messages: IPC copy menu
      const sel = window.getSelection()?.toString().trim() ?? ''
      if (!sel) return
      e.preventDefault()
      window.api.shell?.showContextMenu(sel, false)
    }
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  // Workflow detection
  const { showSuggestion, dismiss: dismissSuggestion } = useWorkflowDetection()
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [showLogs, setShowLogs] = useState(false)

  // Mark as "just switched" whenever the active conversation changes
  useEffect(() => {
    if (prevConversationId.current !== activeConversationId) {
      prevConversationId.current = activeConversationId
      justSwitched.current = true
      userScrolledUp.current = false
    }
  }, [activeConversationId])

  // Detect if user has scrolled up (wants to read history)
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      userScrolledUp.current = distanceFromBottom > 150
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Smart scroll: instant jump when loading a conversation, smooth for new incoming messages
  useEffect(() => {
    if (justSwitched.current) {
      // Always instant-jump when switching/loading conversation, regardless of load time
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      justSwitched.current = false
    } else if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [messages.length, activeConversationId])

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
            {(streaming.isStreaming || isWaitingForResponse) && currentAgent ? (
              <div className="flex items-center gap-2">
                <GradientAvatar gradient={currentAgent.color} icon={currentAgent.icon} size="sm" />
                <span className="text-xs font-bold text-white">{currentAgent.name}</span>
                <StatusDot color={streaming.retrying ? 'orange' : 'green'} pulse />
                <span className="text-[10px] text-zinc-500">
                  {streaming.retrying ? 'Rate limited, retrying...' : streaming.isStreaming ? 'Processing...' : 'Thinking...'}
                </span>
              </div>
            ) : (streaming.isStreaming || isWaitingForResponse) ? (
              <div className="flex items-center gap-2">
                <StatusDot color={streaming.retrying ? 'orange' : 'green'} pulse />
                <span className="text-xs text-zinc-400">
                  {streaming.retrying ? 'Rate limited, retrying...' : streaming.isStreaming ? 'Agent processing...' : 'Agent thinking...'}
                </span>
              </div>
            ) : (
              <span className="text-xs text-zinc-600">
                {activeConversationId ? 'Ready' : 'No conversation selected'}
              </span>
            )}
          </div>
        </div>

        <TerminalControls onSaveAsTask={() => setShowConvertModal(true)} showLogs={showLogs} onToggleLogs={() => setShowLogs((v) => !v)} />

        {/* Workflow suggestion banner */}
        {showSuggestion && !showConvertModal && (
          <WorkflowSuggestionBanner
            onConvert={() => { setShowConvertModal(true); dismissSuggestion() }}
            onDismiss={dismissSuggestion}
          />
        )}

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar bg-[#0c0c0e] select-text">
          <div className="p-4 space-y-1">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id || `msg-${i}`}
                message={msg}
                isLast={i === messages.length - 1}
              />
            ))}

            {/* Streaming content */}
            {streaming.isStreaming && streaming.text && (
              <div className="py-2">
                <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words font-mono leading-relaxed select-text">
                  {streaming.text}
                  <span className="streaming-cursor" />
                </div>
              </div>
            )}

            {/* Queued messages — shown as pending user bubbles (right-aligned, same as sent messages) */}
            {messageQueue.length > 0 && messageQueue.map((qMsg, i) => (
              <div key={`queued-${i}`} className="flex flex-col items-end opacity-60">
                <div className="relative max-w-[85%] rounded-lg px-4 py-2.5 bg-blue-600 text-white">
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{qMsg.text}</p>
                  <Icon icon="lucide:clock" className="absolute -bottom-1 -right-1 text-[10px] text-blue-300 bg-zinc-900 rounded-full p-0.5" />
                </div>
              </div>
            ))}

            {/* Permission request */}
            {permissionRequest && <PermissionBanner />}

            <div ref={messagesEndRef} />
          </div>

          {/* Empty state — no conversation */}
          {!activeConversationId && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center mb-2">
                <Icon icon="lucide:message-square" className="text-zinc-500 text-2xl" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-400 mb-1">No conversation selected</h3>
                <p className="text-xs text-zinc-600">Select a conversation from the sidebar<br />or start a new one</p>
              </div>
              <button
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2"
                onClick={() => useConversationStore.getState().createConversation?.()}
              >
                <Icon icon="lucide:plus" className="text-xs" />
                New Chat
              </button>
            </div>
          )}

          {/* Empty state — conversation exists but no messages */}
          {messages.length === 0 && !streaming.isStreaming && activeConversationId && !isLoadingMessages && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Icon icon="lucide:terminal" className="text-zinc-800 text-3xl mb-3" />
              <h3 className="text-sm font-medium text-zinc-500 mb-1">Ready for input</h3>
              <p className="text-xs text-zinc-600">Send a message to start the conversation</p>
            </div>
          )}
        </div>

        {/* Process logs panel */}
        {showLogs && (
          <div className="h-52 border-t border-pilos-border bg-neutral-950 flex-shrink-0 flex flex-col">
            <div className="flex items-center justify-between px-3 py-1 border-b border-neutral-800 flex-shrink-0">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Process Logs</span>
              <button onClick={() => setShowLogs(false)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                <Icon icon="lucide:x" className="text-xs" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <SessionInfoPanel />
            </div>
          </div>
        )}

        {/* Input — only show when a conversation is active */}
        {activeConversationId && <TerminalInput />}
      </div>

      {/* Convert to workflow modal */}
      {showConvertModal && (
        <ConvertConversationModal
          messages={messages}
          conversationId={activeConversationId}
          onClose={() => setShowConvertModal(false)}
        />
      )}

    </div>
  )
}
