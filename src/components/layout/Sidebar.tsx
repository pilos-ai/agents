import { useState, useRef, useEffect, type ComponentType } from 'react'
import { useConversationStore } from '../../store/useConversationStore'
import { useAppStore } from '../../store/useAppStore'
import type { AppView } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useLicenseStore } from '../../store/useLicenseStore'
import { useSearchStore } from '../../store/useSearchStore'
import { api } from '../../api'

interface ViewTab {
  key: string
  label: string
  icon: React.ReactNode
  requiresJira?: boolean
}

const CHAT_TAB: ViewTab = {
  key: 'chat',
  label: 'Chat',
  icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  ),
}

// PM view tabs with inline icons — loaded dynamically
const PM_TABS: ViewTab[] = [
  {
    key: 'stories',
    label: 'Stories',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    key: 'board',
    label: 'Board',
    requiresJira: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
  {
    key: 'dashboard',
    label: 'Sprint',
    requiresJira: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
]

// Dynamically loaded PM components
let PmStorySidebarContent: ComponentType | null = null
let pmStoreModule: { useJiraStore: any; useStoryStore: any } | null = null
let pmAttempted = false

function loadPmSidebar() {
  if (pmAttempted) return Promise.resolve()
  pmAttempted = true
  return import('@pilos/agents-pm')
    .then((mod) => {
      PmStorySidebarContent = mod.StorySidebarContent
      pmStoreModule = { useJiraStore: mod.useJiraStore, useStoryStore: mod.useStoryStore }
    })
    .catch(() => {})
}

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
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)

  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const tier = useLicenseStore((s) => s.flags.tier)
  const isPro = tier === 'pro' || tier === 'teams'

  // PM state — loaded lazily, only for Pro/Teams
  const [hasPm, setHasPm] = useState(false)
  const [jiraConnected, setJiraConnected] = useState(false)
  const [storyCount, setStoryCount] = useState(0)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!isPro) return
    loadPmSidebar().then(() => {
      if (pmStoreModule) {
        setHasPm(true)
        // Subscribe to PM stores for sidebar state
        const unsubJira = pmStoreModule.useJiraStore.subscribe((s: any) => setJiraConnected(s.connected))
        const unsubStory = pmStoreModule.useStoryStore.subscribe((s: any) => setStoryCount(s.stories.length))
        // Set initial values
        setJiraConnected(pmStoreModule.useJiraStore.getState().connected)
        setStoryCount(pmStoreModule.useStoryStore.getState().stories.length)
        forceUpdate((n) => n + 1)
        return () => { unsubJira(); unsubStory() }
      }
    })
  }, [isPro])

  const allTabs = hasPm ? [CHAT_TAB, ...PM_TABS] : [CHAT_TAB]
  const visibleTabs = allTabs.filter((t) => !t.requiresJira || jiraConnected)

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
      await loadConversations(activeProjectPath || '')
    }
    setEditingId(null)
  }

  const cancelRename = () => {
    setEditingId(null)
  }

  return (
    <div className="h-full flex flex-col bg-neutral-900/50 border-r border-neutral-800">
      {/* View Tabs */}
      <div className="flex border-b border-neutral-800">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              activeView === tab.key
                ? 'text-blue-400 border-b-2 border-blue-400 bg-neutral-800/30'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
            title={tab.label}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="p-3 flex items-center gap-2">
        {activeView === 'chat' ? (
          <>
          <button
            onClick={() => createConversation()}
            className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
          >
            + New Chat
          </button>
          <button
            onClick={() => useSearchStore.getState().open()}
            className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Search messages (Cmd+Shift+F)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          </>
        ) : activeView === 'stories' ? (
          <>
            <span className="flex-1 text-xs font-medium text-neutral-300">Stories ({storyCount})</span>
          </>
        ) : (
          <span className="flex-1 text-xs font-medium text-neutral-300">{visibleTabs.find(t => t.key === activeView)?.label}</span>
        )}
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

      {/* Project info */}
      {activeTab && (
        <div className="px-3 pb-2 border-b border-neutral-800 mb-2">
          <p className="text-xs font-medium text-neutral-300 truncate">{activeTab.projectName}</p>
          <p className="text-[10px] text-neutral-600 truncate">{activeTab.projectPath}</p>
        </div>
      )}

      {/* Sidebar content based on active view */}
      {activeView === 'chat' && (
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
      )}

      {activeView === 'stories' && PmStorySidebarContent && (
        <PmStorySidebarContent />
      )}

      {(activeView === 'board' || activeView === 'dashboard') && (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <p className="text-xs text-neutral-500">Select a sprint in the main panel to view details.</p>
        </div>
      )}

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
