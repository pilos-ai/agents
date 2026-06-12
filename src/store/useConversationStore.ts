import { create } from 'zustand'
import { api } from '../api'
import { useProjectStore, getActiveProjectTab } from './useProjectStore'
import { useTaskStore } from './useTaskStore'
import { useUsageStore } from './useUsageStore'
import { useAnalyticsStore } from './useAnalyticsStore'
import { buildTeamSystemPrompt, buildMessageContextHint } from '../utils/team-prompt-builder'
import { restoreAgentIds } from '../utils/agent-names'
import { AGENT_COLORS } from '../data/agent-templates'
import { parseAgentSegments, detectLastAgent } from '../utils/agent-segments'
import {
  createDetector,
  createRendererStorage,
  type InputMessage,
  type RepetitionMatch,
} from '@pilos/repetition-detection'

/**
 * Workflow suggestion shape exposed to the UI. ALL tiers are now backed by the
 * cross-conversation repetition detector — we never nag on a one-off chat.
 * Strongest first:
 *  - `matched_workflow` → a similar prior conversation was already saved as a
 *                         Task with a runnable workflow. Offer to RUN it instead
 *                         of rebuilding it.
 *  - `repeated`         → ≥2 similar prior conversations. Strong "you keep doing
 *                         this" signal; offer to save it as a workflow.
 *  - `candidate`        → exactly 1 similar prior conversation (the *second*
 *                         time you've done something). Softer "save this for
 *                         next time?" nudge — still real repetition, not a guess.
 */
export type WorkflowSuggestion =
  | {
      tier: 'matched_workflow'
      conversationId: string
      projectPath: string
      taskId: string
      taskTitle: string
      nodeCount: number
      /** Re-use the underlying repetition match so dismiss() can mute by bagHash. */
      match: RepetitionMatch
    }
  | {
      tier: 'repeated'
      conversationId: string
      projectPath: string
      match: RepetitionMatch
    }
  | {
      tier: 'candidate'
      conversationId: string
      projectPath: string
      toolCount: number
      uniqueTools: string[]
      /** Present so dismiss() can mute the pattern by bagHash like the other tiers. */
      match: RepetitionMatch
    }

const CANDIDATE_DISMISSED_KEY = 'pilos:dismissed-workflow-suggestions'

function getDismissedConversationIds(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(CANDIDATE_DISMISSED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function addDismissedConversationId(id: string) {
  if (typeof localStorage === 'undefined') return
  try {
    const ids = getDismissedConversationIds()
    ids.add(id)
    const arr = [...ids].slice(-200)
    localStorage.setItem(CANDIDATE_DISMISSED_KEY, JSON.stringify(arr))
  } catch {
    /* storage disabled — dismiss is best-effort */
  }
}

function collectUniqueTools(messages: ConversationMessage[]): string[] {
  const set = new Set<string>()
  for (const m of messages) {
    if (m.type !== 'tool_use') continue
    const block = m.contentBlocks?.[0] as ToolUseBlock | undefined
    const name = block?.type === 'tool_use' ? block.name : m.toolName
    if (name) set.add(name)
  }
  return [...set]
}
import type { Conversation, ConversationMessage, ContentBlock, ClaudeEvent, ImageAttachment, AgentDefinition, ToolUseBlock, ToolResultBlock, AskUserQuestionData, ExitPlanModeData } from '../types'

/** Adapter: map the app's ConversationMessage down to the submodule's input shape. */
function toInputMessages(messages: ConversationMessage[]): InputMessage[] {
  return messages.map((m) => {
    let toolName: string | undefined
    if (m.type === 'tool_use') {
      const block = m.contentBlocks?.[0] as ToolUseBlock | undefined
      toolName = block?.type === 'tool_use' ? block.name : m.toolName
    }
    return { role: m.role, type: m.type, content: m.content, toolName }
  })
}

const repetitionDetector = (() => {
  const api = (typeof window !== 'undefined' ? window.api?.repetition : undefined)
  if (!api) return null
  return createDetector(createRendererStorage(api))
})()

export interface ProcessLogEntry {
  timestamp: number
  direction: 'in' | 'out'  // in = from Claude CLI, out = to Claude CLI
  eventType: string
  summary: string
  raw: string
}

const MAX_PROCESS_LOGS = 500

interface StreamingState {
  text: string
  contentBlocks: ContentBlock[]
  thinking: string
  isStreaming: boolean
  currentAgentName: string | null
  retrying: boolean
  _partialJson: string
  _turnTokens: number
  _turnStartTime: number
  _lastActivityTime: number
}

export interface QueuedMessage {
  text: string
  images?: ImageAttachment[]
}

type PermReq = { sessionId: string; toolName: string; toolInput: Record<string, unknown> }

/**
 * Per-conversation live session state — the terminal model. Every conversation
 * (foreground OR background, same OR different project) has its own independent
 * LiveSession that keeps streaming/accumulating regardless of which one is
 * currently being viewed. The store's top-level fields (messages, streaming,
 * isWaitingForResponse, …) are a MIRROR of sessions[activeConversationId] so the
 * existing ChatPage selectors keep working; the conversation list reads
 * sessions[id] directly to show per-chat running state.
 */
export interface LiveSession {
  messages: ConversationMessage[]
  streaming: StreamingState
  isWaitingForResponse: boolean
  hasActiveSession: boolean
  permissionRequest: PermReq | null
  permissionQueue: PermReq[]
  askUserQuestion: AskUserQuestionData | null
  exitPlanMode: ExitPlanModeData | null
  messageQueue: QueuedMessage[]
  processLogs: ProcessLogEntry[]
  hasMoreOlder: boolean
  isLoadingOlder: boolean
  oldestLoadedMessageId: number | null
  isLoadingMessages: boolean
  /** Whether DB history has been loaded into `messages` yet (load-once). */
  hydrated: boolean
}

interface ConversationStore {
  // State
  conversations: Conversation[]
  activeConversationId: string | null
  messages: ConversationMessage[]
  streaming: StreamingState
  processLogs: ProcessLogEntry[]
  isWaitingForResponse: boolean
  hasActiveSession: boolean
  isLoadingMessages: boolean
  // ── Cursor-based backwards pagination (Slack/Discord style) ────────────────
  // `oldestLoadedMessageId` is the cursor (id of the oldest message currently
  // in `messages`); `loadOlderMessages` requests rows older than this id.
  // `hasMoreOlder` flips to false when the SQLite handler returns no further
  // rows. Both reset to the initial page on `setActiveConversation` and to
  // empty on new/cleared conversations.
  hasMoreOlder: boolean
  isLoadingOlder: boolean
  oldestLoadedMessageId: number | null
  // Per-conversation live sessions — the source of truth. The top-level fields
  // above (messages/streaming/isWaitingForResponse/…) mirror sessions[activeConversationId].
  sessions: Record<string, LiveSession>
  permissionRequest: PermReq | null
  permissionQueue: PermReq[]
  askUserQuestion: AskUserQuestionData | null
  answeredQuestionIds: Set<string>
  exitPlanMode: ExitPlanModeData | null
  replyToMessage: ConversationMessage | null
  scrollToMessageId: number | null
  messageQueue: QueuedMessage[]
  workflowSuggestion: WorkflowSuggestion | null
  /** Conversations where the user explicitly stopped the loop. Presence of
   * `/loop` in the message history is the source of truth for "loop active";
   * this set lets us override that to hide the banner once the user stops. */
  stoppedLoops: Record<string, boolean>

  // Actions
  loadConversations: (projectPath?: string) => Promise<void>
  setActiveConversation: (id: string | null) => Promise<void>
  loadOlderMessages: () => Promise<void>
  ensureMessageLoaded: (messageId: number) => Promise<void>
  createConversation: (title?: string) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  sendMessage: (text: string, images?: ImageAttachment[], convId?: string) => Promise<void>
  queueMessage: (text: string, images?: ImageAttachment[]) => void
  clearMessageQueue: () => void
  abortSession: (convId?: string) => void
  stopLoop: (conversationId?: string) => void
  respondPermission: (allowed: boolean, always?: boolean) => void
  respondToQuestion: (answers: Record<string, string>) => void
  respondToPlanExit: (approved: boolean, feedback?: string) => void
  handleClaudeEvent: (event: ClaudeEvent) => void
  handleMobileMessage: (conversationId: string, message: string, images?: Array<{ data: string; mediaType: string }>) => void
  addMessage: (message: ConversationMessage) => void
  resetStreaming: () => void
  setReplyTo: (msg: ConversationMessage | null) => void
  setScrollToMessageId: (id: number | null) => void
  dismissWorkflowSuggestion: (mode: 'later' | 'never') => Promise<void>
}

// Pagination tuning — exported for the UI loader threshold + tests.
export const MESSAGES_PAGE_SIZE = 50
const ENSURE_MESSAGE_MAX_PAGES = 10

const emptyStreaming: StreamingState = {
  text: '',
  contentBlocks: [],
  thinking: '',
  isStreaming: false,
  currentAgentName: null,
  retrying: false,
  _partialJson: '',
  _turnTokens: 0,
  _turnStartTime: 0,
  _lastActivityTime: 0,
}

function blankSession(): LiveSession {
  return {
    messages: [],
    streaming: { ...emptyStreaming },
    isWaitingForResponse: false,
    hasActiveSession: false,
    permissionRequest: null,
    permissionQueue: [],
    askUserQuestion: null,
    exitPlanMode: null,
    messageQueue: [],
    processLogs: [],
    hasMoreOlder: false,
    isLoadingOlder: false,
    oldestLoadedMessageId: null,
    isLoadingMessages: false,
    hydrated: false,
  }
}

/** Project the session-scoped subset of a LiveSession onto the store's top-level
 *  mirror fields (the view of the active conversation). */
function toMirror(s: LiveSession) {
  return {
    messages: s.messages,
    streaming: s.streaming,
    isWaitingForResponse: s.isWaitingForResponse,
    hasActiveSession: s.hasActiveSession,
    permissionRequest: s.permissionRequest,
    permissionQueue: s.permissionQueue,
    askUserQuestion: s.askUserQuestion,
    exitPlanMode: s.exitPlanMode,
    messageQueue: s.messageQueue,
    processLogs: s.processLogs,
    hasMoreOlder: s.hasMoreOlder,
    isLoadingOlder: s.isLoadingOlder,
    oldestLoadedMessageId: s.oldestLoadedMessageId,
    isLoadingMessages: s.isLoadingMessages,
  }
}

const EMPTY_MIRROR = toMirror(blankSession())

// ── Inactivity timeout ────────────────────────────────────────────────────────

export const useConversationStore = create<ConversationStore>((set, get) => {
  // ── Per-conversation session helpers (terminal model) ──────────────────────
  // The active session lazily ADOPTS the current top-level mirror on first touch,
  // so externally-seeded active state (and the real app's pre-session state) is
  // never lost when the first event for that conversation arrives.
  const baseSession = (state: ConversationStore, id: string): LiveSession => {
    const existing = state.sessions[id]
    if (existing) return existing
    if (id === state.activeConversationId) {
      return { ...blankSession(), ...toMirror(state as unknown as LiveSession), hydrated: true }
    }
    return blankSession()
  }

  const getS = (id: string): LiveSession => baseSession(get(), id)

  /** Patch session `id`; mirror to the top-level view fields if it's the active one. */
  const setS = (
    id: string,
    patch: Partial<LiveSession> | ((s: LiveSession) => Partial<LiveSession>),
  ) => set((state) => {
    const cur = baseSession(state, id)
    const p = typeof patch === 'function' ? patch(cur) : patch
    const next = { ...cur, ...p }
    const sessions = { ...state.sessions, [id]: next }
    return id === state.activeConversationId ? { sessions, ...toMirror(next) } : { sessions }
  })

  /** Append a message to session `id` and persist it to DB (id-tagged on save). */
  const addMsg = (id: string, message: ConversationMessage) => {
    setS(id, (s) => ({ messages: [...s.messages, message] }))
    api.conversations.saveMessage(id, {
      role: message.role,
      type: message.type,
      content: message.content,
      contentBlocks: message.contentBlocks,
      agentName: message.agentName,
      agentIcon: message.agentIcon,
      agentColor: message.agentColor,
      replyToId: message.replyToId,
    }).then((saved) => {
      if (saved?.id) setS(id, (s) => ({ messages: s.messages.map((m) => (m === message ? { ...m, id: saved.id } : m)) }))
    }).catch(() => {})
  }

  /** The project tab that owns conversation `id` (for team-mode agent parsing).
   *  Falls back to the active project's tab when the conversation isn't mapped yet. */
  const tabFor = (id: string) => {
    const pp = useProjectStore.getState().conversationProjectMap.get(id)
    if (pp) return useProjectStore.getState().openProjects.find((p) => p.projectPath === pp) ?? null
    return id === get().activeConversationId ? getActiveProjectTab() ?? null : null
  }

  return {
  conversations: [],
  activeConversationId: null,
  messages: [],
  streaming: { ...emptyStreaming },
  processLogs: [],
  isWaitingForResponse: false,
  hasActiveSession: false,
  isLoadingMessages: false,
  hasMoreOlder: false,
  isLoadingOlder: false,
  oldestLoadedMessageId: null,
  sessions: {},
  permissionRequest: null,
  permissionQueue: [],
  askUserQuestion: null,
  answeredQuestionIds: new Set(),
  exitPlanMode: null,
  replyToMessage: null,
  scrollToMessageId: null,
  messageQueue: [],
  workflowSuggestion: null,
  stoppedLoops: {},

  loadConversations: async (projectPath?: string) => {
    const conversations = await api.conversations.list(projectPath)
    set({ conversations })
  },

  setActiveConversation: async (id) => {
    // Pure pointer move (terminal model): switch the view to `id` and mirror its
    // LiveSession. The conversation we leave is NOT torn down — its session keeps
    // streaming/accumulating in the background. Any pending permission/question on
    // the target session surfaces immediately via the mirror.
    set((state) => {
      const sessions = { ...state.sessions }
      if (id && !sessions[id]) sessions[id] = blankSession()
      const target = id ? sessions[id] : null
      return {
        sessions,
        activeConversationId: id,
        ...(target ? toMirror(target) : EMPTY_MIRROR),
        // View-only globals reset on every switch.
        replyToMessage: null,
        scrollToMessageId: null,
        workflowSuggestion: null,
      }
    })

    if (!id) return

    // Register for event routing (project association).
    const projectPath = useProjectStore.getState().activeProjectPath || ''
    useProjectStore.getState().registerConversation(id, projectPath)

    // Load DB history ONCE per session. A hydrated session's live in-memory
    // messages survive switches, so we never reload it — eliminating the DB race.
    if (getS(id).hydrated) return
    setS(id, { isLoadingMessages: true })

    // Cursor-based load: most-recent page only. `loadOlderMessages` pages backwards.
    {
      const { messages: loaded, hasMore } = await api.conversations.getMessagesPage(id, MESSAGES_PAGE_SIZE)

      // Bail if the session was dropped meanwhile (e.g. deleted).
      if (!get().sessions[id]) return

      // For old messages without agent attribution, re-parse [AgentName] markers
      const tab = tabFor(id)
      let finalMessages: ConversationMessage[]
      if (tab?.mode === 'team' && tab.agents.length > 0) {
        const messages: ConversationMessage[] = []
        for (const msg of loaded) {
          if (msg.role === 'assistant' && !msg.agentName && msg.content) {
            const segments = parseAgentSegments(msg.content, tab.agents)
            if (segments.length > 1 || (segments.length === 1 && segments[0].agentName)) {
              for (const seg of segments) {
                messages.push({
                  ...msg,
                  content: seg.text,
                  agentId: seg.agentId,
                  agentName: seg.agentName || undefined,
                  agentIcon: seg.agentIcon,
                  agentColor: seg.agentColor,
                })
              }
            } else {
              messages.push(msg)
            }
          } else {
            messages.push(msg)
          }
        }
        finalMessages = messages
      } else {
        finalMessages = loaded
      }

      // The cursor tracks the oldest *raw* DB row we've fetched — not the
      // post-split agent segments — so we read it from `loaded[0]`.
      const oldestId = loaded[0]?.id ?? null
      setS(id, (s) => {
        // DB history first, then any live messages not yet persisted (dedup by id),
        // so a background-started session keeps its in-flight messages.
        const dbIds = new Set(finalMessages.map((m) => m.id).filter((x): x is number => x != null))
        const liveExtra = s.messages.filter((m) => m.id == null || !dbIds.has(m.id))
        return {
          messages: [...finalMessages, ...liveExtra],
          isLoadingMessages: false,
          hasMoreOlder: hasMore,
          oldestLoadedMessageId: oldestId,
          hydrated: true,
        }
      })
    }
  },

  /**
   * Fetch the next batch of older messages and prepend them. No-op when there
   * are no more rows, a load is in flight, or there's no active conversation.
   * The ChatPage scroll handler calls this when the user scrolls within ~150px
   * of the top.
   */
  loadOlderMessages: async () => {
    const state = get()
    const convId = state.activeConversationId
    if (!convId) return
    if (!state.hasMoreOlder || state.isLoadingOlder) return
    if (state.oldestLoadedMessageId == null) return

    setS(convId, { isLoadingOlder: true })
    try {
      const { messages: olderRaw, hasMore } = await api.conversations.getMessagesPage(
        convId,
        MESSAGES_PAGE_SIZE,
        state.oldestLoadedMessageId,
      )

      // Bail if the user switched conversations mid-fetch.
      if (get().activeConversationId !== convId) {
        setS(convId, { isLoadingOlder: false })
        return
      }

      if (olderRaw.length === 0) {
        setS(convId, { isLoadingOlder: false, hasMoreOlder: false })
        return
      }

      // Apply team-mode agent segment re-parse to the older page (same as the
      // initial-load path) so old messages render with proper attribution.
      const tab = getActiveProjectTab()
      let prepend: ConversationMessage[]
      if (tab?.mode === 'team' && tab.agents.length > 0) {
        const out: ConversationMessage[] = []
        for (const msg of olderRaw) {
          if (msg.role === 'assistant' && !msg.agentName && msg.content) {
            const segments = parseAgentSegments(msg.content, tab.agents)
            if (segments.length > 1 || (segments.length === 1 && segments[0].agentName)) {
              for (const seg of segments) {
                out.push({
                  ...msg,
                  content: seg.text,
                  agentId: seg.agentId,
                  agentName: seg.agentName || undefined,
                  agentIcon: seg.agentIcon,
                  agentColor: seg.agentColor,
                })
              }
              continue
            }
          }
          out.push(msg)
        }
        prepend = out
      } else {
        prepend = olderRaw
      }

      // The DB cursor must move to the oldest *raw* id, not the oldest split
      // segment — they share the same id since segments come from one row.
      const newOldestId = olderRaw[0]?.id ?? state.oldestLoadedMessageId
      setS(convId, (s) => ({
        messages: [...prepend, ...s.messages],
        isLoadingOlder: false,
        hasMoreOlder: hasMore,
        oldestLoadedMessageId: newOldestId,
      }))
    } catch (err) {
      console.error('[loadOlderMessages] Failed:', err)
      setS(convId, { isLoadingOlder: false })
    }
  },

  /**
   * Page backwards until `messageId` is in the loaded window. Used by Search →
   * jump-to-message so the target row exists in the DOM when ChatPage tries to
   * scroll to it. Capped at ENSURE_MESSAGE_MAX_PAGES to avoid runaway loads on
   * very deep histories or a missing id.
   */
  ensureMessageLoaded: async (messageId: number) => {
    const isLoaded = () => get().messages.some((m) => m.id === messageId)
    if (isLoaded()) return

    let pages = 0
    while (pages < ENSURE_MESSAGE_MAX_PAGES) {
      const state = get()
      if (!state.hasMoreOlder) break
      // Wait for any in-flight load before issuing the next so we don't double-fetch.
      if (state.isLoadingOlder) {
        await new Promise((r) => setTimeout(r, 50))
        if (isLoaded()) return
        continue
      }
      await get().loadOlderMessages()
      pages++
      if (isLoaded()) return
    }

    if (!isLoaded()) {
      console.warn(
        `[ensureMessageLoaded] message ${messageId} not found after ${pages} page loads`,
      )
    }
  },

  createConversation: async (title = 'New Chat') => {
    const projectPath = useProjectStore.getState().activeProjectPath || ''
    const conv = await api.conversations.create(title, projectPath)
    await get().loadConversations(projectPath)
    await get().setActiveConversation(conv.id)
    return conv.id
  },

  deleteConversation: async (id) => {
    await api.conversations.delete(id)
    set((s) => {
      const stopped = { ...s.stoppedLoops }
      delete stopped[id]
      const sessions = { ...s.sessions }
      delete sessions[id]
      // If the deleted conversation was active, clear the mirror to a blank view.
      return s.activeConversationId === id
        ? { activeConversationId: null, sessions, stoppedLoops: stopped, ...EMPTY_MIRROR }
        : { sessions, stoppedLoops: stopped }
    })
    const projectPath = useProjectStore.getState().activeProjectPath || ''
    await get().loadConversations(projectPath)
  },

  renameConversation: async (id, title) => {
    await api.conversations.updateTitle(id, title)
    const projectPath = useProjectStore.getState().activeProjectPath || ''
    await get().loadConversations(projectPath)
  },

  sendMessage: async (text, images, convId) => {
    let conversationId = convId ?? get().activeConversationId
    if (!conversationId) {
      conversationId = await get().createConversation(text.slice(0, 50))
    }

    // Clear any prior "stopped" flag — sending a new /loop reactivates the banner.
    const trimmedStart = text.trimStart()
    if (trimmedStart.startsWith('/loop ')) {
      set((s) => {
        if (!s.stoppedLoops[conversationId!]) return s
        const stopped = { ...s.stoppedLoops }
        delete stopped[conversationId!]
        return { stoppedLoops: stopped }
      })
    }

    // Capture and clear reply-to state (reply only applies to the active send).
    const isActiveSend = conversationId === get().activeConversationId
    const replyTo = isActiveSend ? get().replyToMessage : null
    const replyToId = replyTo?.id
    if (isActiveSend) set({ replyToMessage: null })

    // Restore any friendly agent names back to hex IDs for Claude CLI
    let cliText = restoreAgentIds(text)

    // Save user message to DB first to get the assigned ID
    const saved = await api.conversations.saveMessage(conversationId, {
      role: 'user',
      type: 'text',
      content: text,
      replyToId: replyToId,
    })

    // Add user message with DB-assigned ID — into THIS conversation's session.
    const userMsg: ConversationMessage = {
      id: saved.id,
      role: 'user',
      type: 'text',
      content: text,
      images: images,
      replyToId: replyToId,
      timestamp: Date.now(),
    }
    setS(conversationId, (s) => ({ messages: [...s.messages, userMsg] }))

    // Broadcast user message to mobile clients (best-effort, non-blocking)
    api.mobile?.broadcastUserMessage(conversationId, text, images)?.catch(() => {})

    const turnStartTime = Date.now()
    setS(conversationId, { isWaitingForResponse: true, streaming: { ...emptyStreaming, isStreaming: true, _turnStartTime: turnStartTime, _lastActivityTime: turnStartTime } })

    // Resolve the conversation's OWNING project — a queued message can be sent into
    // a backgrounded conversation in a different project, so we must NOT assume active.
    const projectPath = useProjectStore.getState().conversationProjectMap.get(conversationId)
      ?? (useProjectStore.getState().activeProjectPath || '')
    const tab = projectPath
      ? useProjectStore.getState().openProjects.find((p) => p.projectPath === projectPath) ?? null
      : null

    // Always start a new session if none is active for this conversation
    if (!getS(conversationId).hasActiveSession) {
      const hasHistory = getS(conversationId).messages.length > 1

      // Register this conversation for event routing
      useProjectStore.getState().registerConversation(conversationId, projectPath)

      // Inject per-message context hint for team mode so agents self-activate proactively
      if (tab?.mode === 'team' && tab.agents.length > 0) {
        const hint = buildMessageContextHint(cliText, tab.agents)
        if (hint) cliText = hint + cliText
      }

      // Build system prompt additions
      const systemPromptParts: string[] = []

      // Team mode agent instructions
      if (tab?.mode === 'team' && tab.agents.length > 0) {
        systemPromptParts.push(buildTeamSystemPrompt(tab.agents))
      }

      // Interactive tools guidance: the CLI returns errors for AskUserQuestion/ExitPlanMode
      // in stream-json mode, but the app UI handles them. Tell Claude to use them once and wait.
      systemPromptParts.push(
        'IMPORTANT: The AskUserQuestion and ExitPlanMode tools are handled by the application UI. ' +
        'When you use these tools, you will receive an error tool_result — this is EXPECTED and normal. ' +
        'Do NOT retry the tool. After using AskUserQuestion or ExitPlanMode, immediately end your turn. ' +
        'The user\'s answers will be provided in the next message.'
      )

      const appendSystemPrompt = systemPromptParts.join('\n\n')

      // Generate MCP config (always write — Jira MCP server is auto-injected server-side)
      const mcpResult = await api.mcp.writeConfig(projectPath, tab?.mcpServers || [])

      // Surface MCP config warnings (e.g. Jira connected on another project)
      for (const warning of mcpResult.warnings) {
        addMsg(conversationId, {
          role: 'assistant',
          type: 'text',
          content: `⚠️ ${warning}`,
          timestamp: Date.now(),
        })
      }

      await api.claude.startSession(conversationId, {
        prompt: cliText,
        images: images,
        resume: hasHistory,
        workingDirectory: projectPath || undefined,
        model: tab?.model,
        permissionMode: tab?.permissionMode,
        appendSystemPrompt,
        mcpConfigPath: mcpResult.configPath,
      })
      setS(conversationId, (s) => ({
        processLogs: [...s.processLogs, {
          timestamp: Date.now(),
          direction: 'out' as const,
          eventType: 'startSession',
          summary: `model=${tab?.model || 'sonnet'} resume=${hasHistory} cwd=${projectPath || '?'}`,
          raw: JSON.stringify({ prompt: cliText.slice(0, 200), model: tab?.model, resume: hasHistory, permissionMode: tab?.permissionMode }),
        }],
      }))
    } else {
      // Inject per-message context hint for team mode (multi-turn path)
      if (tab?.mode === 'team' && tab.agents.length > 0) {
        const hint = buildMessageContextHint(cliText, tab.agents)
        if (hint) cliText = hint + cliText
      }
      await api.claude.sendMessage(conversationId, cliText, images)
      setS(conversationId, (s) => ({
        processLogs: [...s.processLogs, {
          timestamp: Date.now(),
          direction: 'out' as const,
          eventType: 'sendMessage',
          summary: `${cliText.slice(0, 100)}${cliText.length > 100 ? '...' : ''}`,
          raw: JSON.stringify({ message: cliText.slice(0, 500) }),
        }],
      }))
    }
  },

  queueMessage: (text, images) => {
    const id = get().activeConversationId
    if (id) setS(id, (s) => ({ messageQueue: [...s.messageQueue, { text, images }] }))
  },

  clearMessageQueue: () => {
    const id = get().activeConversationId
    if (id) setS(id, { messageQueue: [] })
  },

  abortSession: (convId) => {
    const id = convId ?? get().activeConversationId
    if (id) {
      api.claude.abort(id).catch((err) => console.error('[abortSession] Failed to abort:', err))
      setS(id, { isWaitingForResponse: false, streaming: { ...emptyStreaming }, messageQueue: [] })
    }
  },

  stopLoop: (conversationId) => {
    const id = conversationId ?? get().activeConversationId
    if (!id) return
    // Abort the CLI session if this conversation is actively working (foreground OR background).
    if (getS(id).isWaitingForResponse) {
      api.claude.abort(id).catch((err) => console.error('[stopLoop] Failed to abort:', err))
    }
    set((s) => ({ stoppedLoops: { ...s.stoppedLoops, [id]: true } }))
    setS(id, { isWaitingForResponse: false, streaming: { ...emptyStreaming }, messageQueue: [] })
  },

  respondPermission: (allowed, always) => {
    const perm = get().permissionRequest
    if (perm) {
      api.claude.respondPermission(perm.sessionId, allowed, always)
        .catch((err) => console.error('[respondPermission] Failed to respond:', err))
      // Pop next from the owning session's queue, or null if empty.
      setS(perm.sessionId, (s) => {
        const queue = [...s.permissionQueue]
        const next = queue.shift() || null
        return { permissionRequest: next, permissionQueue: queue }
      })
    }
  },

  respondToQuestion: (answers) => {
    const q = get().askUserQuestion
    if (q) {
      api.claude.respondToQuestion(q.sessionId, answers)
        .catch((err) => console.error('[respondToQuestion] Failed to respond:', err))
      set((s) => {
        const ids = new Set(s.answeredQuestionIds)
        ids.add(q.toolUseId)
        return { answeredQuestionIds: ids }
      })
      setS(q.sessionId, {
        askUserQuestion: null,
        isWaitingForResponse: true,
        streaming: { ...emptyStreaming, isStreaming: true },
      })
    }
  },

  respondToPlanExit: (approved, feedback) => {
    const p = get().exitPlanMode
    if (p) {
      api.claude.respondToPlanExit(p.sessionId, approved, feedback)
        .catch((err) => console.error('[respondToPlanExit] Failed to respond:', err))
      setS(p.sessionId, {
        exitPlanMode: null,
        isWaitingForResponse: true,
        streaming: { ...emptyStreaming, isStreaming: true },
      })
    }
  },

  handleClaudeEvent: (event) => {
    const sid = event.sessionId
    if (!sid) return
    // Terminal model: every event is processed against its OWN conversation's
    // LiveSession (sessions[sid]) — foreground or background, same or different
    // project. We shadow set/get/getActiveProjectTab/activeConversationId so the
    // (verbatim) reducer below reads & writes that session instead of globals.
    // LiveSession shares field names (streaming/messages/permissionRequest/…) with
    // the old top-level state, so the body needs no other changes.
    const sTab = tabFor(sid)
    const set = (patch: Partial<LiveSession> | ((s: LiveSession) => Partial<LiveSession>)) => setS(sid, patch)
    const get = () => ({
      ...getS(sid),
      activeConversationId: sid,
      addMessage: (m: ConversationMessage) => addMsg(sid, m),
      sendMessage: (t: string, i?: ImageAttachment[]) => useConversationStore.getState().sendMessage(t, i, sid),
      loadConversations: (pp?: string) => useConversationStore.getState().loadConversations(pp),
    })
    const getActiveProjectTab = () => sTab
    const activeConversationId = sid

    // Log every incoming event to processLogs
    {
      const eventType = String(event.type || 'unknown')
      const rawJson = JSON.stringify(event)
      let summary = ''
      if (eventType === 'assistant') {
        const msg = event.message as { model?: string; content?: Array<{ type: string; name?: string }>; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }
        const toolUses = msg?.content?.filter((b) => b.type === 'tool_use') || []
        const usage = msg?.usage
        const tokenInfo = usage
          ? ` in=${usage.input_tokens || 0} out=${usage.output_tokens || 0} cache_r=${usage.cache_read_input_tokens || 0} cache_w=${usage.cache_creation_input_tokens || 0}`
          : ''
        if (toolUses.length > 0) {
          summary = `model=${msg?.model || '?'} tools=[${toolUses.map((t) => t.name).join(', ')}]${tokenInfo}`
        } else {
          summary = `model=${msg?.model || '?'} content${tokenInfo}`
        }
      } else if (eventType === 'user') {
        const msg = event.message as { content?: Array<{ type: string; tool_use_id?: string }> }
        const results = msg?.content?.filter((b) => b.type === 'tool_result') || []
        summary = results.length > 0 ? `tool_result x${results.length}` : 'user message'
      } else if (eventType === 'result') {
        const ev = event as Record<string, unknown>
        summary = `cost=${ev.cost_usd || '?'} total=${ev.total_cost_usd || '?'} turns=${ev.num_turns || '?'} duration=${ev.duration_ms || '?'}ms`
      } else if (eventType === 'rate_limit_event') {
        const info = (event as Record<string, unknown>).rate_limit_info as { status?: string } | undefined
        summary = `status=${info?.status || '?'}`
      } else if (eventType === 'system') {
        summary = String((event as Record<string, unknown>).subtype || '')
      } else {
        summary = rawJson.slice(0, 120)
      }

      const logEntry: ProcessLogEntry = {
        timestamp: Date.now(),
        direction: 'in',
        eventType,
        summary,
        raw: rawJson,
      }
      set((s) => ({
        processLogs: s.processLogs.length >= MAX_PROCESS_LOGS
          ? [...s.processLogs.slice(-MAX_PROCESS_LOGS + 1), logEntry]
          : [...s.processLogs, logEntry],
      }))
    }

    switch (event.type) {
      case 'session:started': {
        set({ hasActiveSession: true, processLogs: [] })
        break
      }

      case 'assistant': {
        // The CLI sends assistant events with accumulated content blocks per turn.
        // Each assistant event replaces streaming text with this turn's text.
        // If previous streaming text exists (from a prior turn), commit it as a
        // message first so it doesn't get lost when we replace.
        const msg = event.message as { id?: string; content: ContentBlock[] }
        if (!msg?.content) break

        const tab = getActiveProjectTab()
        const convId = get().activeConversationId

        // Update streaming text/thinking from this turn's content
        const textContent = msg.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')
        const thinkingContent = msg.content
          .filter((b): b is { type: 'thinking'; thinking: string } => b.type === 'thinking')
          .map((b) => b.thinking)
          .join('')

        // Commit previous streaming text as a message before replacing it
        // This prevents message loss when Claude sends text → tool_use → more text
        const prevText = get().streaming.text
        if (textContent && prevText && prevText !== textContent) {
          const prevAgent = get().streaming.currentAgentName
          const agent = tab?.mode === 'team' && prevAgent
            ? tab.agents.find((a) => a.name === prevAgent)
            : null

          if (tab?.mode === 'team' && tab.agents.length > 0) {
            const segments = parseAgentSegments(prevText, tab.agents)
            for (const seg of segments) {
              get().addMessage({
                role: 'assistant',
                type: 'text',
                content: seg.text,
                agentId: seg.agentId,
                agentName: seg.agentName || undefined,
                agentIcon: seg.agentIcon,
                agentColor: seg.agentColor,
                timestamp: Date.now(),
              })
            }
          } else {
            get().addMessage({
              role: 'assistant',
              type: 'text',
              content: prevText,
              agentName: agent?.name,
              agentIcon: agent?.icon,
              agentColor: agent?.color,
              timestamp: Date.now(),
            })
          }
        }

        if (textContent || thinkingContent) {
          set((s) => {
            let currentAgentName = s.streaming.currentAgentName

            if (tab?.mode === 'team' && tab.agents.length > 0 && textContent) {
              currentAgentName = detectLastAgent(textContent, tab.agents) ?? currentAgentName
            }

            return {
              streaming: {
                ...s.streaming,
                isStreaming: true,
                text: textContent,
                thinking: thinkingContent || s.streaming.thinking,
                currentAgentName,
              },
            }
          })
        }

        // Accumulate token usage for analytics
        const usage = (event.message as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage
        if (usage) {
          const tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0)
          if (tokens > 0) {
            set((s) => ({
              streaming: { ...s.streaming, _turnTokens: s.streaming._turnTokens + tokens },
            }))
          }
        }

        // Extract tool_use blocks and add as separate messages
        const toolUseBlocks = msg.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
        for (const block of toolUseBlocks) {
          // Skip if already added (dedup by tool_use id)
          const alreadyAdded = get().messages.some((m) =>
            m.contentBlocks?.some((b) => b.type === 'tool_use' && (b as ToolUseBlock).id === block.id)
          )
          if (alreadyAdded) continue

          // Get current agent for attribution in team mode
          const currentAgent = get().streaming.currentAgentName
          const agent = tab?.mode === 'team' && currentAgent
            ? tab.agents.find((a) => a.name === currentAgent)
            : null

          const toolMsg: ConversationMessage = {
            role: 'assistant',
            type: 'tool_use',
            content: '',
            contentBlocks: [block],
            agentName: agent?.name,
            agentIcon: agent?.icon,
            agentColor: agent?.color,
            timestamp: Date.now(),
          }

          get().addMessage(toolMsg)
        }

        // Also mark streaming as active
        if (!get().streaming.isStreaming) {
          set((s) => ({ streaming: { ...s.streaming, isStreaming: true } }))
        }

        break
      }

      case 'permission_request': {
        const tool = event.tool as { name?: string; input?: Record<string, unknown> } | undefined
        const newPerm = {
          sessionId: event.sessionId as string,
          toolName: (tool?.name as string) || (event.tool_name as string) || 'unknown tool',
          toolInput: (tool?.input || event.tool_input || event.command || '') as Record<string, unknown>,
        }
        // If no active permission, set it directly; otherwise queue it
        if (!get().permissionRequest) {
          set({ permissionRequest: newPerm })
        } else {
          set((s) => ({ permissionQueue: [...s.permissionQueue, newPerm] }))
        }
        break
      }

      case 'ask_user_question': {
        const questions = event.questions as AskUserQuestionData['questions']
        set({
          askUserQuestion: {
            sessionId: event.sessionId as string,
            toolUseId: event.toolUseId as string,
            questions,
          },
        })
        break
      }

      case 'exit_plan_mode': {
        set({
          exitPlanMode: {
            sessionId: event.sessionId as string,
            toolUseId: event.toolUseId as string,
            input: (event.input as Record<string, unknown>) || {},
          },
        })
        break
      }

      case 'content_block_start': {
        const block = event.content_block as ContentBlock
        set((s) => ({
          streaming: {
            ...s.streaming,
            isStreaming: true,
            _lastActivityTime: Date.now(),
            contentBlocks: [...s.streaming.contentBlocks, block],
          },
        }))
        break
      }

      case 'content_block_delta': {
        const delta = event.delta as { type: string; text?: string; thinking?: string; partial_json?: string }
        if (delta.type === 'text_delta' && delta.text) {
          const tab = getActiveProjectTab()
          set((s) => {
            const newText = s.streaming.text + delta.text
            let currentAgentName = s.streaming.currentAgentName

            if (tab?.mode === 'team' && tab.agents.length > 0) {
              currentAgentName = detectLastAgent(newText, tab.agents) ?? currentAgentName
            }

            return {
              streaming: {
                ...s.streaming,
                text: newText,
                currentAgentName,
              },
            }
          })
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
          set((s) => ({
            streaming: {
              ...s.streaming,
              thinking: s.streaming.thinking + delta.thinking,
            },
          }))
        } else if (delta.type === 'input_json_delta' && delta.partial_json) {
          // Accumulate partial JSON for tool_use input
          set((s) => ({
            streaming: {
              ...s.streaming,
              _partialJson: s.streaming._partialJson + delta.partial_json,
            },
          }))
        }
        break
      }

      case 'content_block_stop': {
        // Finalize the last tool_use block with accumulated partial JSON input
        set((s) => {
          if (!s.streaming._partialJson) return s
          const blocks = [...s.streaming.contentBlocks]
          const lastBlock = blocks[blocks.length - 1]
          if (lastBlock?.type === 'tool_use') {
            try {
              const input = JSON.parse(s.streaming._partialJson)
              blocks[blocks.length - 1] = { ...lastBlock, input } as ContentBlock
            } catch { /* partial JSON incomplete, keep as-is */ }
          }
          return {
            streaming: {
              ...s.streaming,
              contentBlocks: blocks,
              _partialJson: '',
            },
          }
        })

        // Add completed tool_use/tool_result blocks as separate messages in the chat
        const { streaming: st } = get()
        const lastBlock = st.contentBlocks[st.contentBlocks.length - 1]
        if (lastBlock && (lastBlock.type === 'tool_use' || lastBlock.type === 'tool_result')) {
          const convId = get().activeConversationId

          // Get current agent attribution for team mode
          const tab = getActiveProjectTab()
          const agent = tab?.mode === 'team' && st.currentAgentName
            ? tab.agents.find((a) => a.name === st.currentAgentName)
            : null

          const msg: ConversationMessage = {
            role: 'assistant',
            type: lastBlock.type as 'tool_use' | 'tool_result',
            content: '',
            contentBlocks: [lastBlock],
            agentName: agent?.name,
            agentIcon: agent?.icon,
            agentColor: agent?.color,
            timestamp: Date.now(),
          }

          get().addMessage(msg)
        }
        break
      }

      case 'user': {
        // CLI sends tool_result blocks in user events — add as separate messages
        const userMsg = event.message as { content?: ContentBlock[] }
        if (!userMsg?.content) break

        const toolResults = userMsg.content.filter(
          (b): b is ToolResultBlock => b.type === 'tool_result'
        )

        for (const block of toolResults) {
          // Skip permission denials (handled by permission_request event)
          if (block.is_error && typeof block.content === 'string' &&
            (block.content.includes('requires approval') || block.content.includes('requested permissions') || block.content.includes("haven't granted"))) {
            continue
          }

          // Skip if already added (dedup by tool_use_id)
          const alreadyAdded = get().messages.some((m) =>
            m.contentBlocks?.some((b) => b.type === 'tool_result' && (b as ToolResultBlock).tool_use_id === block.tool_use_id)
          )
          if (alreadyAdded) continue

          const convId = get().activeConversationId
          const tab = getActiveProjectTab()
          const currentAgent = get().streaming.currentAgentName
          const agent = tab?.mode === 'team' && currentAgent
            ? tab.agents.find((a) => a.name === currentAgent)
            : null

          const resultMsg: ConversationMessage = {
            role: 'assistant',
            type: 'tool_result',
            content: '',
            contentBlocks: [block],
            agentName: agent?.name,
            agentIcon: agent?.icon,
            agentColor: agent?.color,
            timestamp: Date.now(),
          }

          get().addMessage(resultMsg)
        }
        break
      }

      case 'result': {
        // The result field can be either a string or an object with content[]
        const rawResult = event.result
        const isError = !!(event as Record<string, unknown>).is_error
        const streaming = get().streaming
        let finalText = ''

        if (typeof rawResult === 'string') {
          finalText = rawResult
        } else if (rawResult && typeof rawResult === 'object') {
          const resultObj = rawResult as { content?: ContentBlock[] }
          if (resultObj.content) {
            finalText = resultObj.content
              .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
              .map((b) => b.text)
              .join('')
          }
        }

        finalText = finalText || streaming.text

        // When the CLI signals an error and there's no content to show, surface a fallback
        // so the user isn't left staring at a frozen spinner with no feedback
        if (isError && !finalText) {
          finalText = '⚠️ The request could not be completed. The context may be too large for the model. Try starting a new conversation or reducing the amount of text.'
        }

        // Tool blocks (tool_use, tool_result) are already added as separate messages
        // by content_block_stop. Here we only handle the text content.
        if (finalText) {
          const tab = getActiveProjectTab()

          if (tab?.mode === 'team' && tab.agents.length > 0) {
            // In team mode, parse agent segments and create per-agent text messages
            const segments = parseAgentSegments(finalText, tab.agents)
            for (const seg of segments) {
              get().addMessage({
                role: 'assistant',
                type: 'text',
                content: seg.text,
                agentId: seg.agentId,
                agentName: seg.agentName || undefined,
                agentIcon: seg.agentIcon,
                agentColor: seg.agentColor,
                timestamp: Date.now(),
              })
            }
          } else {
            // Solo mode — add text as a message
            get().addMessage({
              role: 'assistant',
              type: 'text',
              content: finalText,
              timestamp: Date.now(),
            })
          }
        }

        // Record analytics entry
        const turnTokens = streaming._turnTokens
        const turnStart = streaming._turnStartTime
        if (turnTokens > 0 || (event as Record<string, unknown>).cost_usd) {
          const ev = event as Record<string, unknown>
          useAnalyticsStore.getState().addEntry({
            timestamp: Date.now(),
            agentName: streaming.currentAgentName,
            tokens: turnTokens,
            cost: parseFloat(String(ev.cost_usd || '0')) || 0,
            durationMs: ev.duration_ms
              ? parseInt(String(ev.duration_ms))
              : turnStart > 0 ? Date.now() - turnStart : 0,
            success: true,
            conversationId: get().activeConversationId,
          })
        }

        // Process next queued message if any
        const queue = get().messageQueue
        if (queue.length > 0) {
          const next = queue[0]
          // Keep isWaitingForResponse true to prevent UI flicker between queue items
          set({ messageQueue: queue.slice(1), streaming: { ...emptyStreaming } })
          // Send in next tick to let state settle
          setTimeout(async () => {
            try {
              await get().sendMessage(next.text, next.images)
            } catch (err) {
              console.error('[Queue] Failed to send queued message:', err)
              set({ isWaitingForResponse: false, streaming: { ...emptyStreaming } })
            }
          }, 100)
        } else {
          set({
            isWaitingForResponse: false,
            streaming: { ...emptyStreaming },
          })
          // Refresh usage stats after each completed response
          setTimeout(() => useUsageStore.getState().fetchStats(), 500)
        }

        // Auto-generate title from first assistant response
        const userMsgCount = get().messages.filter((m) => m.role === 'user').length
        if (userMsgCount <= 1 && activeConversationId) {
          const firstUserMsg = get().messages.find((m) => m.role === 'user')
          if (firstUserMsg) {
            api.conversations.updateTitle(
              activeConversationId,
              firstUserMsg.content.slice(0, 50)
            )
            const projectPath = useProjectStore.getState().activeProjectPath || ''
            get().loadConversations(projectPath)
          }
        }
        break
      }

      case 'session:ended': {
        set({
          isWaitingForResponse: false,
          hasActiveSession: false,
          streaming: { ...emptyStreaming },
          messageQueue: [],
        })
        break
      }

      case 'session:error': {
        const error = (event.error as string) || 'Unknown error'
        get().addMessage({
          role: 'assistant',
          type: 'text',
          content: `Error: ${error}`,
          timestamp: Date.now(),
        })
        set({
          isWaitingForResponse: false,
          hasActiveSession: false,
          streaming: { ...emptyStreaming },
          messageQueue: [],
        })
        break
      }

      case 'rate_limit_event':
      case 'raw':
      case 'stderr':
        // Informational events — no UI action needed
        break

      case 'system': {
        const subtype = (event as Record<string, unknown>).subtype as string | undefined
        if (subtype === 'api_retry') {
          set((s) => ({ streaming: { ...s.streaming, retrying: true } }))
        } else if (subtype === 'init') {
          set((s) => ({ streaming: { ...s.streaming, retrying: false } }))
        }
        break
      }

      case 'stderr_error': {
        // Claude CLI printed something error-like to stderr (e.g. context window exceeded)
        // Show it as an assistant error message so the user isn't left with a frozen spinner
        const errText = String((event as Record<string, unknown>).data || 'Unknown CLI error')
        get().addMessage({
          role: 'assistant',
          type: 'text',
          content: `⚠️ ${errText}`,
          timestamp: Date.now(),
        })
        // Don't clear isWaitingForResponse here — the CLI will close and session:ended will do that
        break
      }

      default: {
        // Catch permission-related events with alternate type names
        const eventType = String(event.type || '')
        if (eventType.includes('permission') || eventType.includes('tool_use_permission')) {
          const tool = event.tool as { name?: string; input?: Record<string, unknown> } | undefined
          const newPerm = {
            sessionId: event.sessionId as string,
            toolName: (tool?.name as string) || (event.tool_name as string) || (event.name as string) || 'unknown tool',
            toolInput: (tool?.input || event.tool_input || event.input || event.command || '') as Record<string, unknown>,
          }
          if (!get().permissionRequest) {
            set({ permissionRequest: newPerm })
          } else {
            set((s) => ({ permissionQueue: [...s.permissionQueue, newPerm] }))
          }
        } else {
          if (import.meta.env.DEV) {
            console.log('[ConversationStore] Unhandled event type:', eventType, JSON.stringify(event).slice(0, 300))
          }
        }
        break
      }
    }
  },

  handleMobileMessage: (conversationId, message, images) => {
    // Inject into the conversation's own session (works even when it isn't active —
    // already persisted to DB by relay-client).
    setS(conversationId, (s) => ({
      messages: [...s.messages, {
        role: 'user' as const,
        type: 'text' as const,
        content: message,
        images: images?.map((img) => ({ data: img.data, mediaType: img.mediaType, name: 'mobile-image' })),
        timestamp: Date.now(),
      }],
      isWaitingForResponse: true,
      streaming: { ...emptyStreaming, isStreaming: true, _turnStartTime: Date.now() },
    }))
  },

  addMessage: (message) => {
    // Append to the active conversation's session (id-safe DB persistence inside addMsg).
    const id = get().activeConversationId
    if (id) addMsg(id, message)
  },

  resetStreaming: () => {
    const id = get().activeConversationId
    if (id) setS(id, { streaming: { ...emptyStreaming } })
    else set({ streaming: { ...emptyStreaming } })
  },

  setReplyTo: (msg) => {
    set({ replyToMessage: msg })
  },

  setScrollToMessageId: (id) => {
    set({ scrollToMessageId: id })
  },

  dismissWorkflowSuggestion: async (mode) => {
    const suggestion = get().workflowSuggestion
    set({ workflowSuggestion: null })
    if (!suggestion) return
    // Silence this specific conversation immediately so it can't re-fire on a
    // later turn of the same chat this session.
    addDismissedConversationId(suggestion.conversationId)
    // Every tier is now backed by a repetition match, so mute the underlying
    // pattern by bagHash: "later" = 24h cooldown, "never" = permanent mute.
    if (repetitionDetector) {
      await repetitionDetector
        .dismissPattern(
          suggestion.projectPath,
          suggestion.match.bagHash,
          mode === 'never' ? 'permanent' : 'cooldown',
        )
        .catch(() => {})
    }
  },
  }
})

// After each turn resolves (streaming: true → false):
//   1. Run unified workflow-suggestion detection (repeated > candidate).
//   2. Schedule embedding indexing so this conversation contributes to future
//      cross-conversation matches.
let _indexTimer: ReturnType<typeof setTimeout> | null = null
useConversationStore.subscribe((state, prev) => {
  if (!(prev.isWaitingForResponse && !state.isWaitingForResponse)) return
  // The mirror also flips false when switching INTO an idle conversation from a
  // busy one (toMirror overwrites isWaitingForResponse). That's a view change, not
  // a turn finishing here — skip it so we don't index/suggest on the wrong chat.
  if (prev.activeConversationId !== state.activeConversationId) return

  const cid = state.activeConversationId
  const msgs = state.messages
  if (!cid) return

  // ── Unified workflow-suggestion detection ──────────────────────────────────
  // Skip if we already have a suggestion for this conversation, or if the user
  // dismissed one earlier in the session.
  const existing = state.workflowSuggestion
  const alreadySuggested = existing?.conversationId === cid
  const dismissedThisConv = getDismissedConversationIds().has(cid)
  if (!alreadySuggested && !dismissedThisConv) {
    const projectPath = useProjectStore.getState().activeProjectPath || ''
    const snapshot = toInputMessages(msgs)

    const evaluate = async () => {
      // Tier 1 — repetition detector (cross-conversation match).
      if (repetitionDetector) {
        try {
          const match = await repetitionDetector.detect(cid, projectPath, snapshot)
          if (match) {
            if (useConversationStore.getState().activeConversationId !== cid) return
            if (getDismissedConversationIds().has(cid)) return

            // Elevation: if any matched conversation was already saved as a
            // Task with a runnable workflow, surface "run existing" instead of
            // "build a new one". `similarConversationIds` is ordered by score
            // DESC, so picking the first hit respects ranking.
            const tasks = useTaskStore.getState().tasks
            const simSet = new Set(match.similarConversationIds)
            let matchingTask = null as null | { taskId: string; title: string; nodes: number }
            for (const sid of match.similarConversationIds) {
              const t = tasks.find(
                (tk) =>
                  tk.sourceConversationId === sid &&
                  tk.workflow?.nodes?.length &&
                  tk.workflow.nodes.length > 0,
              )
              if (t) {
                matchingTask = { taskId: t.id, title: t.title, nodes: t.workflow!.nodes.length }
                break
              }
            }
            // Fallback: also accept tasks whose source is the *primary* match
            // even if it somehow slipped out of similarConversationIds.
            if (!matchingTask && !simSet.has(match.primaryConversationId)) {
              const t = tasks.find(
                (tk) =>
                  tk.sourceConversationId === match.primaryConversationId &&
                  tk.workflow?.nodes?.length &&
                  tk.workflow.nodes.length > 0,
              )
              if (t) {
                matchingTask = { taskId: t.id, title: t.title, nodes: t.workflow!.nodes.length }
              }
            }

            if (matchingTask) {
              useConversationStore.setState({
                workflowSuggestion: {
                  tier: 'matched_workflow',
                  conversationId: cid,
                  projectPath,
                  taskId: matchingTask.taskId,
                  taskTitle: matchingTask.title,
                  nodeCount: matchingTask.nodes,
                  match,
                },
              })
              return
            }

            // ≥2 prior similar conversations = strong repetition ("repeated").
            // Exactly 1 = the second time you've done this — a softer
            // "candidate" nudge. Both are real cross-conversation matches.
            if (match.similarConversationIds.length >= 2) {
              useConversationStore.setState({
                workflowSuggestion: { tier: 'repeated', conversationId: cid, projectPath, match },
              })
            } else {
              useConversationStore.setState({
                workflowSuggestion: {
                  tier: 'candidate',
                  conversationId: cid,
                  projectPath,
                  toolCount: msgs.filter((m) => m.type === 'tool_use').length,
                  uniqueTools: collectUniqueTools(msgs),
                  match,
                },
              })
            }
            return
          }
        } catch {
          /* detector unavailable — no suggestion. We deliberately do NOT fall
             back to a single-conversation heuristic: a suggestion now requires
             genuine cross-conversation repetition, so we never nag on a one-off
             chat. */
        }
      }
    }

    void evaluate()
  }

  // ── Embedding index (unchanged) ─────────────────────────────────────────────
  if (repetitionDetector) {
    if (_indexTimer) clearTimeout(_indexTimer)
    _indexTimer = setTimeout(() => {
      void repetitionDetector.indexForFutureMatches(cid, toInputMessages(msgs)).catch(() => {})
    }, 30_000)
  }
})
