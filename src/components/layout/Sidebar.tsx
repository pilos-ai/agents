import { useState, useRef, useEffect } from 'react'
import { useConversationStore } from '../../store/useConversationStore'
import { useAppStore } from '../../store/useAppStore'
import { api } from '../../api'

export function Sidebar() {
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation)
  const createConversation = useConversationStore((s) => s.createConversation)
  const deleteConversation = useConversationStore((s) => s.deleteConversation)
  const loadConversations = useConversationStore((s) => s.loadConversations)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditValue(currentTitle)
  }

  const commitRename = async () => {
    if (editingId && editValue.trim()) {
      await api.conversations.updateTitle(editingId, editValue.trim())
      await loadConversations()
    }
    setEditingId(null)
  }

  const cancelRename = () => {
    setEditingId(null)
  }

  return (
    <div className="h-full flex flex-col bg-neutral-900/50 border-r border-neutral-800">
      {/* Header */}
      <div className="p-3 flex items-center gap-2">
        <button
          onClick={() => createConversation()}
          className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
        >
          + New Chat
        </button>
        <button
          onClick={toggleRightPanel}
          className={`p-1.5 rounded-md transition-colors ${
            rightPanelOpen ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
          }`}
          title="Toggle terminal panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm mb-0.5 transition-colors ${
              activeConversationId === conv.id
                ? 'bg-neutral-700/60 text-white'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
            onClick={() => {
              if (editingId !== conv.id) setActiveConversation(conv.id)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              startRename(conv.id, conv.title)
            }}
          >
            {editingId === conv.id ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') cancelRename()
                }}
                className="flex-1 bg-neutral-800 text-white text-sm px-1 py-0 rounded border border-blue-500/50 outline-none min-w-0"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 truncate">{conv.title}</span>
            )}

            {editingId !== conv.id && (
              <div className="hidden group-hover:flex items-center gap-0.5">
                {/* Rename button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    startRename(conv.id, conv.title)
                  }}
                  className="p-0.5 text-neutral-500 hover:text-blue-400 transition-colors"
                  title="Rename"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation(conv.id)
                  }}
                  className="p-0.5 text-neutral-500 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}

        {conversations.length === 0 && (
          <p className="text-neutral-600 text-xs text-center mt-8">No conversations yet</p>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-neutral-800">
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md text-xs transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  )
}
