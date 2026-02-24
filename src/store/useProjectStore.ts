import { create } from 'zustand'
import { api } from '../api'
import { useConversationStore } from './useConversationStore'
import { useAppStore, type AppView } from './useAppStore'
import { useLicenseStore } from './useLicenseStore'
import type { Project, Conversation, ConversationMessage, ContentBlock, ClaudeEvent, ProjectMode, AgentDefinition, McpServer, McpServerStdio, ImageAttachment, ToolUseBlock, ToolResultBlock } from '../types'

/** Migration map: old fake @anthropic/* MCP packages → real npm packages */
const MCP_PACKAGE_MIGRATIONS: Record<string, { args: string[]; env?: Record<string, string> }> = {
  '@anthropic/profiler-mcp-server': { args: ['-y', 'chrome-devtools-mcp@latest'] },
  '@anthropic/openapi-mcp-server': { args: ['-y', '@openapi-mcp/server'], env: { BASE_URL: '' } },
  '@anthropic/database-mcp-server': { args: ['-y', '@modelcontextprotocol/server-postgres', ''] },
  '@anthropic/analytics-mcp-server': { args: ['-y', '@cube-dev/mcp-server'], env: { CUBE_API_KEY: '', CUBE_TENANT_NAME: '', CUBE_AGENT_ID: '' } },
  '@anthropic/a11y-mcp-server': { args: ['-y', 'a11y-mcp'] },
  '@anthropic/storybook-mcp-server': { args: ['-y', '@anthropic/storybook-mcp-server'] },
  '@anthropic/kubernetes-mcp-server': { args: ['-y', 'kubernetes-mcp-server@latest'] },
  '@anthropic/terraform-mcp-server': { args: ['-y', 'terraform-mcp-server@latest'] },
  '@anthropic/monitoring-mcp-server': { args: ['-y', '@winor30/mcp-server-datadog'], env: { DATADOG_API_KEY: '', DATADOG_APP_KEY: '' } },
  '@anthropic/security-mcp-server': { args: ['-y', 'mcp-security-auditor'] },
  '@anthropic/data-pipeline-mcp-server': { args: ['-y', '@matillion/mcp-server'] },
  '@anthropic/sheets-mcp-server': { args: ['-y', 'mcp-gsheets@latest'], env: { GOOGLE_PROJECT_ID: '', GOOGLE_APPLICATION_CREDENTIALS: '' } },
  '@anthropic/i18n-mcp-server': { args: ['-y', '@scoutello/i18n-magic'] },
  '@anthropic/slack-mcp-server': { args: ['-y', '@modelcontextprotocol/server-slack'], env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' } },
  '@anthropic/calendar-mcp-server': { args: ['-y', '@cocal/google-calendar-mcp'], env: { GOOGLE_OAUTH_CREDENTIALS: '' } },
  '@anthropic/playwright-mcp-server': { args: ['-y', '@playwright/mcp@latest'] },
}

/** Migrate MCP servers with old fake package names to real ones. Returns true if any were changed. */
function migrateMcpServers(servers: McpServer[]): boolean {
  let changed = false
  for (const server of servers) {
    if (server.config.type !== 'stdio') continue
    const cfg = server.config as McpServerStdio
    // Check if any arg matches a known fake package
    const fakeArg = cfg.args?.find((a) => MCP_PACKAGE_MIGRATIONS[a])
    if (fakeArg) {
      const migration = MCP_PACKAGE_MIGRATIONS[fakeArg]
      cfg.args = migration.args
      if (migration.env) {
        // Merge — keep user-provided values, add missing keys with defaults
        cfg.env = { ...migration.env, ...(cfg.env || {}) }
      }
      changed = true
    }
  }
  return changed
}

interface StreamingSnapshot {
  text: string
  contentBlocks: ContentBlock[]
  thinking: string
  isStreaming: boolean
  currentAgentName: string | null
  _partialJson: string
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
  mode: ProjectMode
  agents: AgentDefinition[]
  mcpServers: McpServer[]
  // Per-tab draft input (Phase 2)
  draftText: string
  draftImages: ImageAttachment[]
  // Per-tab active view (Phase 3)
  activeView: AppView
  // Per-tab activity indicators (Phase 4)
  unreadCount: number
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
  setProjectMode: (mode: ProjectMode) => void
  setProjectAgents: (agents: AgentDefinition[]) => void
  addProjectAgent: (agent: AgentDefinition) => void
  removeProjectAgent: (id: string) => void
  updateProjectAgent: (id: string, updates: Partial<AgentDefinition>) => void
  setProjectMcpServers: (servers: McpServer[]) => void
  addProjectMcpServer: (server: McpServer) => void
  removeProjectMcpServer: (id: string) => void
  updateProjectMcpServer: (id: string, updates: Partial<McpServer>) => void
  toggleProjectMcpServer: (id: string) => void
  removeRecentProject: (dirPath: string) => Promise<void>

  // Draft input (Phase 2)
  setDraftText: (text: string) => void
  setDraftImages: (images: ImageAttachment[]) => void

  // Event routing
  registerConversation: (conversationId: string, projectPath: string) => void
  routeClaudeEvent: (event: ClaudeEvent) => void
}

const emptyStreaming: StreamingSnapshot = {
  text: '',
  contentBlocks: [],
  thinking: '',
  isStreaming: false,
  currentAgentName: null,
  _partialJson: '',
}

const emptySnapshot: ConversationSnapshot = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  streaming: { ...emptyStreaming },
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
    askUserQuestion: null,
    exitPlanMode: null,
    processLogs: [],
  })
}

// ── Phase 1: Background event processing ──────────────────────────────

interface BackgroundEventResult {
  snapshot: ConversationSnapshot
  messagesToPersist: ConversationMessage[]
}

/**
 * Apply a Claude event to a background tab's snapshot without touching the
 * live conversation store. Returns the updated snapshot and any messages
 * that should be persisted to the database.
 */
function applyEventToSnapshot(
  snapshot: ConversationSnapshot,
  event: ClaudeEvent,
  tab: ProjectTab,
): BackgroundEventResult {
  const s = { ...snapshot, streaming: { ...snapshot.streaming } }
  const messagesToPersist: ConversationMessage[] = []

  switch (event.type) {
    case 'session:started': {
      s.hasActiveSession = true
      s.isWaitingForResponse = true
      s.streaming = { ...emptyStreaming, isStreaming: true }
      break
    }

    case 'assistant': {
      const msg = event.message as { content: ContentBlock[] }
      if (!msg?.content) break

      const textContent = msg.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')
      const thinkingContent = msg.content
        .filter((b): b is { type: 'thinking'; thinking: string } => b.type === 'thinking')
        .map((b) => b.thinking)
        .join('')

      if (textContent || thinkingContent) {
        let currentAgentName = s.streaming.currentAgentName
        if (tab.mode === 'team' && tab.agents.length > 0 && textContent) {
          const agentNameSet = new Set(tab.agents.map((a) => a.name))
          const lines = textContent.split('\n')
          for (let i = lines.length - 1; i >= 0; i--) {
            const m = lines[i].match(/^\[([A-Za-z_\s]+)\]\s*$/)
            if (m && agentNameSet.has(m[1].trim())) {
              currentAgentName = m[1].trim()
              break
            }
          }
        }
        s.streaming = {
          ...s.streaming,
          isStreaming: true,
          text: textContent || s.streaming.text,
          thinking: thinkingContent || s.streaming.thinking,
          currentAgentName,
        }
      }

      // Extract tool_use blocks as messages
      const toolUseBlocks = msg.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
      for (const block of toolUseBlocks) {
        const alreadyAdded = s.messages.some((m) =>
          m.contentBlocks?.some((b) => b.type === 'tool_use' && (b as ToolUseBlock).id === block.id)
        )
        if (alreadyAdded) continue

        const currentAgent = s.streaming.currentAgentName
        const agent = tab.mode === 'team' && currentAgent
          ? tab.agents.find((a) => a.name === currentAgent)
          : null

        const toolMsg: ConversationMessage = {
          role: 'assistant',
          type: 'tool_use',
          content: '',
          contentBlocks: [block],
          agentName: agent?.name,
          agentEmoji: agent?.emoji,
          agentColor: agent?.color,
          timestamp: Date.now(),
        }
        s.messages = [...s.messages, toolMsg]
        messagesToPersist.push(toolMsg)
      }

      if (!s.streaming.isStreaming) {
        s.streaming = { ...s.streaming, isStreaming: true }
      }
      break
    }

    case 'content_block_start': {
      const block = event.content_block as ContentBlock
      s.streaming = {
        ...s.streaming,
        isStreaming: true,
        contentBlocks: [...s.streaming.contentBlocks, block],
      }
      break
    }

    case 'content_block_delta': {
      const delta = event.delta as { type: string; text?: string; thinking?: string; partial_json?: string }
      if (delta.type === 'text_delta' && delta.text) {
        const newText = s.streaming.text + delta.text
        let currentAgentName = s.streaming.currentAgentName
        if (tab.mode === 'team' && tab.agents.length > 0) {
          const agentNameSet = new Set(tab.agents.map((a) => a.name))
          const lines = newText.split('\n')
          for (let i = lines.length - 1; i >= 0; i--) {
            const m = lines[i].match(/^\[([A-Za-z_\s]+)\]\s*$/)
            if (m && agentNameSet.has(m[1].trim())) {
              currentAgentName = m[1].trim()
              break
            }
          }
        }
        s.streaming = { ...s.streaming, text: newText, currentAgentName }
      } else if (delta.type === 'thinking_delta' && delta.thinking) {
        s.streaming = { ...s.streaming, thinking: s.streaming.thinking + delta.thinking }
      } else if (delta.type === 'input_json_delta' && delta.partial_json) {
        s.streaming = { ...s.streaming, _partialJson: s.streaming._partialJson + delta.partial_json }
      }
      break
    }

    case 'content_block_stop': {
      // Finalize partial JSON on last tool_use block
      if (s.streaming._partialJson) {
        const blocks = [...s.streaming.contentBlocks]
        const lastBlock = blocks[blocks.length - 1]
        if (lastBlock?.type === 'tool_use') {
          try {
            const input = JSON.parse(s.streaming._partialJson)
            blocks[blocks.length - 1] = { ...lastBlock, input } as ContentBlock
          } catch { /* incomplete JSON */ }
        }
        s.streaming = { ...s.streaming, contentBlocks: blocks, _partialJson: '' }
      }

      // Add completed tool_use / tool_result blocks as messages
      const lastBlock = s.streaming.contentBlocks[s.streaming.contentBlocks.length - 1]
      if (lastBlock && (lastBlock.type === 'tool_use' || lastBlock.type === 'tool_result')) {
        const currentAgent = s.streaming.currentAgentName
        const agent = tab.mode === 'team' && currentAgent
          ? tab.agents.find((a) => a.name === currentAgent)
          : null

        const msg: ConversationMessage = {
          role: 'assistant',
          type: lastBlock.type as 'tool_use' | 'tool_result',
          content: '',
          contentBlocks: [lastBlock],
          agentName: agent?.name,
          agentEmoji: agent?.emoji,
          agentColor: agent?.color,
          timestamp: Date.now(),
        }
        s.messages = [...s.messages, msg]
        messagesToPersist.push(msg)
      }
      break
    }

    case 'user': {
      const userMsg = event.message as { content?: ContentBlock[] }
      if (!userMsg?.content) break

      const toolResults = userMsg.content.filter(
        (b): b is ToolResultBlock => b.type === 'tool_result'
      )

      for (const block of toolResults) {
        if (block.is_error && typeof block.content === 'string' &&
          (block.content.includes('requires approval') || block.content.includes('requested permissions') || block.content.includes("haven't granted"))) {
          continue
        }
        const alreadyAdded = s.messages.some((m) =>
          m.contentBlocks?.some((b) => b.type === 'tool_result' && (b as ToolResultBlock).tool_use_id === block.tool_use_id)
        )
        if (alreadyAdded) continue

        const currentAgent = s.streaming.currentAgentName
        const agent = tab.mode === 'team' && currentAgent
          ? tab.agents.find((a) => a.name === currentAgent)
          : null

        const resultMsg: ConversationMessage = {
          role: 'assistant',
          type: 'tool_result',
          content: '',
          contentBlocks: [block],
          agentName: agent?.name,
          agentEmoji: agent?.emoji,
          agentColor: agent?.color,
          timestamp: Date.now(),
        }
        s.messages = [...s.messages, resultMsg]
        messagesToPersist.push(resultMsg)
      }
      break
    }

    case 'result': {
      const rawResult = event.result
      let finalText = ''
      let finalThinking = ''

      if (typeof rawResult === 'string') {
        finalText = rawResult
      } else if (rawResult && typeof rawResult === 'object') {
        const resultObj = rawResult as { content?: ContentBlock[] }
        if (resultObj.content) {
          finalText = resultObj.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('')
          finalThinking = resultObj.content
            .filter((b): b is { type: 'thinking'; thinking: string } => b.type === 'thinking')
            .map((b) => b.thinking)
            .join('')
        }
      }

      finalText = finalText || s.streaming.text
      finalThinking = finalThinking || s.streaming.thinking

      // Persist thinking as a separate message so it's visible on tab switch
      if (finalThinking) {
        const thinkingMsg: ConversationMessage = {
          role: 'assistant',
          type: 'thinking',
          content: finalThinking,
          timestamp: Date.now(),
        }
        s.messages = [...s.messages, thinkingMsg]
        messagesToPersist.push(thinkingMsg)
      }

      if (finalText) {
        const textMsg: ConversationMessage = {
          role: 'assistant',
          type: 'text',
          content: finalText,
          timestamp: Date.now(),
        }
        s.messages = [...s.messages, textMsg]
        messagesToPersist.push(textMsg)
      }

      s.isWaitingForResponse = false
      s.streaming = { ...emptyStreaming }
      break
    }

    case 'session:ended': {
      s.isWaitingForResponse = false
      s.hasActiveSession = false
      s.streaming = { ...emptyStreaming }
      break
    }

    case 'session:error': {
      const error = (event.error as string) || 'Unknown error'
      const errorMsg: ConversationMessage = {
        role: 'assistant',
        type: 'text',
        content: `Error: ${error}`,
        timestamp: Date.now(),
      }
      s.messages = [...s.messages, errorMsg]
      messagesToPersist.push(errorMsg)
      s.isWaitingForResponse = false
      s.hasActiveSession = false
      s.streaming = { ...emptyStreaming }
      break
    }

    // permission_request, ask_user_question, exit_plan_mode — stored in snapshot
    // so the user sees them when switching back to the tab
    case 'permission_request':
    case 'ask_user_question':
    case 'exit_plan_mode':
    case 'rate_limit_event':
    case 'system':
    case 'raw':
    case 'stderr':
      // Informational or interactive events — no snapshot mutation needed
      // Interactive events will block the CLI until answered; when the user
      // switches to this tab the live store will pick them up on the next event.
      break

    default:
      break
  }

  return { snapshot: s, messagesToPersist }
}

// ── Store ─────────────────────────────────────────────────────────────

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

    // Enforce project limit for free tier
    const flags = useLicenseStore.getState().flags
    if (state.openProjects.length >= flags.maxProjects) return

    // Get per-project settings
    const settings = await api.projects.getSettings(dirPath)

    // Auto-migrate old fake MCP package names to real ones
    if (settings.mcpServers && migrateMcpServers(settings.mcpServers)) {
      api.projects.setSettings(dirPath, { mcpServers: settings.mcpServers })
    }

    // Snapshot current active tab before switching (Phase 3: also save activeView)
    const currentPath = state.activeProjectPath
    let openProjects = [...state.openProjects]
    if (currentPath) {
      const snapshot = captureConversationSnapshot()
      const currentView = useAppStore.getState().activeView
      openProjects = openProjects.map((p) =>
        p.projectPath === currentPath ? { ...p, snapshot, activeView: currentView } : p
      )
    }

    const name = dirPath.split('/').pop() || dirPath
    const newTab: ProjectTab = {
      projectPath: dirPath,
      projectName: name,
      snapshot: null,
      model: settings.model || 'sonnet',
      permissionMode: settings.permissionMode || 'bypass',
      mode: settings.mode || 'solo',
      agents: settings.agents || [],
      mcpServers: settings.mcpServers || [],
      draftText: '',
      draftImages: [],
      activeView: 'chat',
      unreadCount: 0,
    }

    openProjects.push(newTab)
    set({ openProjects, activeProjectPath: dirPath })

    // Clear stale conversation state before loading the new project
    useConversationStore.setState({
      activeConversationId: null,
      messages: [],
      streaming: { ...emptyStreaming },
      isWaitingForResponse: false,
      hasActiveSession: false,
      processLogs: [],
      permissionRequest: null,
    })

    // Restore view for the new tab
    useAppStore.getState().setActiveView('chat')

    // Load conversations for this project into the conversation store
    await useConversationStore.getState().loadConversations(dirPath)

    // Add to recent projects
    await api.projects.addRecent(dirPath)
    await get().loadRecentProjects()

    // Sync menu
    api.menu.rebuildMenu()
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
          // Clear stale state, then load fresh
          useConversationStore.setState({
            conversations: [],
            activeConversationId: null,
            messages: [],
            streaming: { ...emptyStreaming },
            isWaitingForResponse: false,
            hasActiveSession: false,
            processLogs: [],
            permissionRequest: null,
          })
          useConversationStore.getState().loadConversations(nextTab.projectPath)
        }

        // Phase 3: Restore the tab's active view
        useAppStore.getState().setActiveView(nextTab.activeView || 'chat')
      } else {
        activeProjectPath = null
        // Clear conversation store
        useConversationStore.setState({
          conversations: [],
          activeConversationId: null,
          messages: [],
          streaming: { ...emptyStreaming },
          isWaitingForResponse: false,
          hasActiveSession: false,
          permissionRequest: null,
        })
      }
    }

    set({ openProjects, activeProjectPath })

    // Sync menu
    api.menu.rebuildMenu()
  },

  setActiveProject: async (dirPath: string) => {
    const state = get()
    if (state.activeProjectPath === dirPath) return

    // Snapshot current active tab + save activeView (Phase 3)
    let openProjects = [...state.openProjects]
    if (state.activeProjectPath) {
      const snapshot = captureConversationSnapshot()
      const currentView = useAppStore.getState().activeView
      openProjects = openProjects.map((p) =>
        p.projectPath === state.activeProjectPath ? { ...p, snapshot, activeView: currentView } : p
      )
    }

    // Phase 4: Reset unread count for the tab we're switching to
    openProjects = openProjects.map((p) =>
      p.projectPath === dirPath ? { ...p, unreadCount: 0 } : p
    )

    // Restore new tab's conversation state BEFORE switching activeProjectPath
    // to prevent the UI from rendering stale data from the outgoing tab
    const tab = openProjects.find((p) => p.projectPath === dirPath)
    if (tab?.snapshot) {
      restoreConversationSnapshot(tab.snapshot)
    } else {
      // First time or no snapshot — clear stale state immediately
      useConversationStore.setState({
        conversations: [],
        activeConversationId: null,
        messages: [],
        streaming: { ...emptyStreaming },
        isWaitingForResponse: false,
        hasActiveSession: false,
        processLogs: [],
        permissionRequest: null,
      })
    }

    set({ openProjects, activeProjectPath: dirPath })

    // If no snapshot, load conversations from DB (after setting activeProjectPath
    // so that createConversation etc. use the correct project)
    if (!tab?.snapshot) {
      await useConversationStore.getState().loadConversations(dirPath)
    }

    // Phase 3: Restore the tab's active view
    useAppStore.getState().setActiveView(tab?.activeView || 'chat')
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

  setProjectMode: (mode: ProjectMode) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, mode } : p
      ),
    })
    api.projects.setSettings(dirPath, { mode })
  },

  setProjectAgents: (agents: AgentDefinition[]) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    const flags = useLicenseStore.getState().flags
    const clamped = agents.slice(0, flags.maxAgents)
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, agents: clamped } : p
      ),
    })
    api.projects.setSettings(dirPath, { agents: clamped })
  },

  addProjectAgent: (agent: AgentDefinition) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    const tab = state.openProjects.find((p) => p.projectPath === dirPath)
    if (!tab) return
    const flags = useLicenseStore.getState().flags
    if (tab.agents.length >= flags.maxAgents) return
    const agents = [...tab.agents, agent]
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, agents } : p
      ),
    })
    api.projects.setSettings(dirPath, { agents })
  },

  removeProjectAgent: (id: string) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    const tab = state.openProjects.find((p) => p.projectPath === dirPath)
    if (!tab) return
    const agents = tab.agents.filter((a) => a.id !== id)
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, agents } : p
      ),
    })
    api.projects.setSettings(dirPath, { agents })
  },

  updateProjectAgent: (id: string, updates: Partial<AgentDefinition>) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    const tab = state.openProjects.find((p) => p.projectPath === dirPath)
    if (!tab) return
    const agents = tab.agents.map((a) => (a.id === id ? { ...a, ...updates } : a))
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, agents } : p
      ),
    })
    api.projects.setSettings(dirPath, { agents })
  },

  setProjectMcpServers: (mcpServers: McpServer[]) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, mcpServers } : p
      ),
    })
    api.projects.setSettings(dirPath, { mcpServers })
  },

  addProjectMcpServer: (server: McpServer) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    const tab = state.openProjects.find((p) => p.projectPath === dirPath)
    if (!tab) return
    const flags = useLicenseStore.getState().flags
    if (tab.mcpServers.length >= flags.maxMcpServers) return
    const mcpServers = [...tab.mcpServers, server]
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, mcpServers } : p
      ),
    })
    api.projects.setSettings(dirPath, { mcpServers })
  },

  removeProjectMcpServer: (id: string) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    const tab = state.openProjects.find((p) => p.projectPath === dirPath)
    if (!tab) return
    const mcpServers = tab.mcpServers.filter((s) => s.id !== id)
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, mcpServers } : p
      ),
    })
    api.projects.setSettings(dirPath, { mcpServers })
  },

  updateProjectMcpServer: (id: string, updates: Partial<McpServer>) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    const tab = state.openProjects.find((p) => p.projectPath === dirPath)
    if (!tab) return
    const mcpServers = tab.mcpServers.map((s) => (s.id === id ? { ...s, ...updates } : s))
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, mcpServers } : p
      ),
    })
    api.projects.setSettings(dirPath, { mcpServers })
  },

  toggleProjectMcpServer: (id: string) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    const tab = state.openProjects.find((p) => p.projectPath === dirPath)
    if (!tab) return
    const mcpServers = tab.mcpServers.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    )
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, mcpServers } : p
      ),
    })
    api.projects.setSettings(dirPath, { mcpServers })
  },

  removeRecentProject: async (dirPath: string) => {
    await api.projects.removeRecent(dirPath)
    await get().loadRecentProjects()
    api.menu.rebuildMenu()
  },

  // Phase 2: Draft input per tab
  setDraftText: (text: string) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, draftText: text } : p
      ),
    })
  },

  setDraftImages: (images: ImageAttachment[]) => {
    const state = get()
    if (!state.activeProjectPath) return
    const dirPath = state.activeProjectPath
    set({
      openProjects: state.openProjects.map((p) =>
        p.projectPath === dirPath ? { ...p, draftImages: images } : p
      ),
    })
  },

  registerConversation: (conversationId: string, projectPath: string) => {
    get().conversationProjectMap.set(conversationId, projectPath)
  },

  // Phase 1: Route events to active or background tabs
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
      // Background tab — process event into its snapshot
      const tabIndex = state.openProjects.findIndex((p) => p.projectPath === ownerProject)
      if (tabIndex === -1) return

      const tab = state.openProjects[tabIndex]
      const snapshot = tab.snapshot || { ...emptySnapshot }

      const { snapshot: updatedSnapshot, messagesToPersist } =
        applyEventToSnapshot(snapshot, event, tab)

      // Update the tab's snapshot and increment unread count (Phase 4)
      const openProjects = [...state.openProjects]
      openProjects[tabIndex] = {
        ...tab,
        snapshot: updatedSnapshot,
        unreadCount: tab.unreadCount + messagesToPersist.filter((m) => m.type === 'text').length,
      }
      set({ openProjects })

      // Persist messages to DB in background
      const convId = updatedSnapshot.activeConversationId
      if (convId) {
        for (const msg of messagesToPersist) {
          api.conversations.saveMessage(convId, {
            role: msg.role,
            type: msg.type,
            content: msg.content,
            contentBlocks: msg.contentBlocks,
            agentName: msg.agentName,
            agentEmoji: msg.agentEmoji,
            agentColor: msg.agentColor,
          })
        }
      }
    }
  },
}))

// Helper: get the active project tab
export function getActiveProjectTab(): ProjectTab | undefined {
  const state = useProjectStore.getState()
  return state.openProjects.find((p) => p.projectPath === state.activeProjectPath)
}
