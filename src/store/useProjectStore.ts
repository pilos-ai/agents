import { create } from 'zustand'
import { api } from '../api'
import { useConversationStore } from './useConversationStore'
import type { Project, Conversation, ConversationMessage, ContentBlock, ClaudeEvent } from '../types'

interface StreamingSnapshot {
  text: string
  contentBlocks: ContentBlock[]
  thinking: string
  isStreaming: boolean
}

export interface ConversationSnapshot {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: ConversationMessage[]
  streaming: StreamingSnapshot
  isWaitingForResponse: boolean
  hasActiveSession: boolean
}

export interface ProjectTab {
  projectPath: string
  projectName: string
  snapshot: ConversationSnapshot | null
  model: string
  permissionMode: string
}

interface ProjectStore {
  openProjects: ProjectTab[]
  activeProjectPath: string | null
  recentProjects: Project[]

  // Map conversationId → projectPath for event routing
  conversationProjectMap: Map<string, string>

  loadRecentProjects: () => Promise<void>
  openProject: (dirPath: string) => Promise<void>
  closeProject: (dirPath: string) => void
  setActiveProject: (dirPath: string) => Promise<void>
  setProjectModel: (model: string) => void
  setProjectPermissionMode: (mode: string) => void
  removeRecentProject: (dirPath: string) => Promise<void>

  // Event routing
  registerConversation: (conversationId: string, projectPath: string) => void
  routeClaudeEvent: (event: ClaudeEvent) => void
}

const emptySnapshot: ConversationSnapshot = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  streaming: { text: '', contentBlocks: [], thinking: '', isStreaming: false },
  isWaitingForResponse: false,
  hasActiveSession: false,
}

function captureConversationSnapshot(): ConversationSnapshot {
  const s = useConversationStore.getState()
  return {
    conversations: s.conversations,
    activeConversationId: s.activeConversationId,
    messages: s.messages,
    streaming: { ...s.streaming },
    isWaitingForResponse: s.isWaitingForResponse,
    hasActiveSession: s.hasActiveSession,
  }
}

function restoreConversationSnapshot(snapshot: ConversationSnapshot): void {
  useConversationStore.setState({
    conversations: snapshot.conversations,
    activeConversationId: snapshot.activeConversationId,
    messages: snapshot.messages,
    streaming: snapshot.streaming,
    isWaitingForResponse: snapshot.isWaitingForResponse,
    hasActiveSession: snapshot.hasActiveSession,
    permissionRequest: null,
  })
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  openProjects: [],
  activeProjectPath: null,
  recentProjects: [],
  conversationProjectMap: new Map(),

  loadRecentProjects: async () => {
    const projects = await api.projects.getRecent()
    set({ recentProjects: projects })
  },

  openProject: async (dirPath: string) => {
    const state = get()

    // Already open? Just switch to it
    if (state.openProjects.some((p) => p.projectPath === dirPath)) {
      await get().setActiveProject(dirPath)
      return
    }

    // Get per-project settings
    const settings = await api.projects.getSettings(dirPath)

    // Snapshot current active tab before switching
    const currentPath = state.activeProjectPath
    let openProjects = [...state.openProjects]
    if (currentPath) {
      const snapshot = captureConversationSnapshot()
      openProjects = openProjects.map((p) =>
        p.projectPath === currentPath ? { ...p, snapshot } : p
      )
    }

    const name = dirPath.split('/').pop() || dirPath
    const newTab: ProjectTab = {
      projectPath: dirPath,
      projectName: name,
      snapshot: null,
      model: settings.model || 'sonnet',
      permissionMode: settings.permissionMode || 'bypass',
    }

    openProjects.push(newTab)
    set({ openProjects, activeProjectPath: dirPath })

    // Load conversations for this project into the conversation store
    await useConversationStore.getState().loadConversations(dirPath)

    // Add to recent projects
    await api.projects.addRecent(dirPath)
    await get().loadRecentProjects()
  },

  closeProject: (dirPath: string) => {
    const state = get()
    const openProjects = state.openProjects.filter((p) => p.projectPath !== dirPath)
    let activeProjectPath = state.activeProjectPath

    if (activeProjectPath === dirPath) {
      if (openProjects.length > 0) {
        // Switch to the last tab
        const nextTab = openProjects[openProjects.length - 1]
        activeProjectPath = nextTab.projectPath

        // Restore that tab's snapshot
        if (nextTab.snapshot) {
          restoreConversationSnapshot(nextTab.snapshot)
        } else {
          // Clear and load fresh
          useConversationStore.getState().loadConversations(nextTab.projectPath)
        }
      } else {
        activeProjectPath = null
        // Clear conversation store
        useConversationStore.setState({
          conversations: [],
          activeConversationId: null,
          messages: [],
          streaming: { text: '', contentBlocks: [], thinking: '', isStreaming: false },
          isWaitingForResponse: false,
          hasActiveSession: false,
          permissionRequest: null,
        })
      }
    }

    set({ openProjects, activeProjectPath })
  },

  setActiveProject: async (dirPath: string) => {
    const state = get()
    if (state.activeProjectPath === dirPath) return

    // Snapshot current active tab
    let openProjects = [...state.openProjects]
    if (state.activeProjectPath) {
      const snapshot = captureConversationSnapshot()
      openProjects = openProjects.map((p) =>
        p.projectPath === state.activeProjectPath ? { ...p, snapshot } : p
      )
    }

    set({ openProjects, activeProjectPath: dirPath })

    // Restore new tab's snapshot
    const tab = openProjects.find((p) => p.projectPath === dirPath)
    if (tab?.snapshot) {
      restoreConversationSnapshot(tab.snapshot)
    } else {
      // First time — load from DB
      await useConversationStore.getState().loadConversations(dirPath)
    }
  },

  setProjectModel: (model: string) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, model } : p
      ),
    })
    api.projects.setSettings(dirPath, { model })
  },

  setProjectPermissionMode: (mode: string) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, permissionMode: mode } : p
      ),
    })
    api.projects.setSettings(dirPath, { permissionMode: mode })
  },

  removeRecentProject: async (dirPath: string) => {
    await api.projects.removeRecent(dirPath)
    await get().loadRecentProjects()
  },

  registerConversation: (conversationId: string, projectPath: string) => {
    get().conversationProjectMap.set(conversationId, projectPath)
  },

  routeClaudeEvent: (event: ClaudeEvent) => {
    const state = get()
    const sessionId = event.sessionId
    const ownerProject = state.conversationProjectMap.get(sessionId)

    if (!ownerProject) {
      // Unknown session — route to active tab
      useConversationStore.getState().handleClaudeEvent(event)
      return
    }

    if (ownerProject === state.activeProjectPath) {
      // Active tab — route directly
      useConversationStore.getState().handleClaudeEvent(event)
    } else {
      // Background tab — update its snapshot
      const tab = state.openProjects.find((p) => p.projectPath === ownerProject)
      if (tab?.snapshot) {
        // For background tabs, we just note there's activity
        // Full event handling happens when the tab becomes active
      }
    }
  },
}))

// Helper: get the active project tab
export function getActiveProjectTab(): ProjectTab | undefined {
  const state = useProjectStore.getState()
  return state.openProjects.find((p) => p.projectPath === state.activeProjectPath)
}
