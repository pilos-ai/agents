import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '../../common/Icon'
import { StatusDot } from '../components/StatusDot'
import { GradientAvatar } from '../components/GradientAvatar'
import { useConversationStore } from '../../../store/useConversationStore'
import { useProjectStore } from '../../../store/useProjectStore'
import type { ImageAttachment } from '../../../types'

// Reuse existing chat components
import { MessageBubble } from '../../chat/MessageBubble'
import { PermissionBanner } from '../../chat/PermissionBanner'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

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

function TerminalControls() {
  const messages = useConversationStore((s) => s.messages)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const conversations = useConversationStore((s) => s.conversations)
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
        onClick={handleCopyAll}
        disabled={messages.length === 0}
        className="px-2 py-1 text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 rounded transition-colors flex items-center gap-1"
      >
        <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} className="text-[10px]" />
        {copied ? 'Copied' : 'Copy All'}
      </button>
      <button
        onClick={handleExport}
        disabled={messages.length === 0}
        className="px-2 py-1 text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 rounded transition-colors flex items-center gap-1"
      >
        <Icon icon="lucide:download" className="text-[10px]" />
        Export
      </button>
    </div>
  )
}

function TerminalInput() {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const sendMessage = useConversationStore((s) => s.sendMessage)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const abortSession = useConversationStore((s) => s.abortSession)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    sendMessage(trimmed || 'What is in this image?', images.length > 0 ? images : undefined)
    setText('')
    setImages([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isStreaming) return
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
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
      await addFiles(imageFiles)
    }
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

      <div className="flex items-end gap-3">
        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!activeConversationId || isStreaming}
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

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            images.length > 0
              ? 'Add a message about the attachment...'
              : activeConversationId
                ? 'Send a message...'
                : 'Create a conversation first...'
          }
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
            disabled={(!text.trim() && images.length === 0) || !activeConversationId}
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
  const prevConversationId = useRef(activeConversationId)
  const switchedAt = useRef(0)

  // Track conversation switches
  useEffect(() => {
    if (prevConversationId.current !== activeConversationId) {
      prevConversationId.current = activeConversationId
      switchedAt.current = Date.now()
    }
  }, [activeConversationId])

  // Scroll: instant after conversation switch, smooth for new messages during streaming
  useEffect(() => {
    const recentSwitch = Date.now() - switchedAt.current < 500
    messagesEndRef.current?.scrollIntoView({ behavior: recentSwitch ? 'instant' : 'smooth' })
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
