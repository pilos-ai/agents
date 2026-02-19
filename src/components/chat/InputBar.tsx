import { useState, useRef, useCallback } from 'react'
import { useConversationStore } from '../../store/useConversationStore'
import { useProjectStore } from '../../store/useProjectStore'
import type { ImageAttachment } from '../../types'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
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

export function InputBar() {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendMessage = useConversationStore((s) => s.sendMessage)
  const abortSession = useConversationStore((s) => s.abortSession)
  const isWaitingForResponse = useConversationStore((s) => s.isWaitingForResponse)
  const streaming = useConversationStore((s) => s.streaming)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const setProjectModel = useProjectStore((s) => s.setProjectModel)
  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const model = activeTab?.model || 'sonnet'

  const isLoading = isWaitingForResponse || streaming.isStreaming

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
      setImages((prev) => [...prev, ...newImages])
    }
  }, [])

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if ((!trimmed && images.length === 0) || isLoading) return
    sendMessage(trimmed || 'What is in this image?', images.length > 0 ? images : undefined)
    setText('')
    setImages([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, images, isLoading, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
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
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={`data:${img.mediaType};base64,${img.data}`}
                alt={img.name || 'attachment'}
                className="h-16 w-16 object-cover rounded-lg border border-neutral-700"
              />
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

      <div className="flex items-end gap-2">
        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="p-2 h-[36px] w-[36px] flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-400 hover:text-neutral-200 rounded-lg transition-colors shrink-0 cursor-pointer"
          title="Attach image"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
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
          placeholder={images.length > 0 ? 'Add a message about the image...' : 'Send a message to Pilos...'}
          rows={1}
          className="flex-1 min-w-0 bg-neutral-800 text-neutral-100 rounded-lg px-4 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-neutral-500"
          disabled={isLoading}
        />

        {/* Model selector */}
        <select
          value={model}
          onChange={(e) => setProjectModel(e.target.value)}
          className="bg-neutral-800 text-neutral-300 text-xs rounded-md px-2 py-2 h-[36px] outline-none border border-neutral-700 cursor-pointer shrink-0"
        >
          <option value="sonnet">Sonnet</option>
          <option value="opus">Opus</option>
          <option value="haiku">Haiku</option>
        </select>

        {/* Send / Stop button */}
        {isLoading ? (
          <button
            onClick={abortSession}
            className="p-2 h-[36px] w-[36px] flex items-center justify-center bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shrink-0"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() && images.length === 0}
            className="p-2 h-[36px] w-[36px] flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg transition-colors shrink-0"
            title="Send"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
