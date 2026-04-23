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
 * Workflow suggestion shape exposed to the UI. Three tiers, strongest first:
 *  - `matched_workflow` → repetition detector matched a prior conversation that
 *                         was already saved as a Task. We can skip "build a
 *                         workflow" and offer to run the existing one.
 *  - `repeated`         → cross-conversation repetition detector found ≥N similar
 *                         prior conversations. Strong signal; copy emphasises
 *                         "you've done this before" — offer to save as workflow.
 *  - `candidate`        → no prior match, but the conversation is substantial
 *                         enough (≥3 tool calls, ≥2 turns each side) that it's
 *                         probably worth offering to save as a workflow.
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
    }

const CANDIDATE_MIN_TOOL_USE = 3
const CANDIDATE_MIN_USER_MSGS = 2
const CANDIDATE_MIN_ASSISTANT_MSGS = 2
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

function passesCandidateHeuristic(messages: ConversationMessage[]): boolean {
  let toolUse = 0
  let userText = 0
  let assistantText = 0
  for (const m of messages) {
    if (m.type === 'tool_use') toolUse++
    else if (m.type === 'text') {
      if (m.role === 'user') userText++
      else if (m.role === 'assistant') assistantText++
    }
  }
  return (
    toolUse >= CANDIDATE_MIN_TOOL_USE &&
    userText >= CANDIDATE_MIN_USER_MSGS &&
    assistantText >= CANDIDATE_MIN_ASSISTANT_MSGS
  )
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
  // background sessions: conversations processing while another is active
  bgSessions: Record<string, { streamingText: string; isWaiting: boolean }>
  permissionRequest: { sessionId: string; toolName: string; toolInput: Record<string, unknown> } | null
  permissionQueue: Array<{ sessionId: string; toolName: string; toolInput: Record<string, unknown> }>
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
  createConversation: (title?: string) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  sendMessage: (text: string, images?: ImageAttachment[]) => Promise<void>
  queueMessage: (text: string, images?: ImageAttachment[]) => void
  clearMessageQueue: () => void
  abortSession: () => void
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

// ── Inactivity timeout ────────────────────────────────────────────────────────

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  streaming: { ...emptyStreaming },
  processLogs: [],
  isWaitingForResponse: false,
  hasActiveSession: false,
  isLoadingMessages: false,
  bgSessions: {},
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
    const prevId = get().activeConversationId

    // Move the previous active session into background tracking (don't abort it).
    // Check both hasActiveSession AND isWaitingForResponse: the latter is set in sendMessage
    // BEFORE startSession fires, so we correctly handle the race where the user switches
    // before session:started arrives.
    if (prevId && prevId !== id && (get().hasActiveSession || get().isWaitingForResponse)) {
      const curStreamingText = get().streaming.text
      set((s) => ({
        bgSessions: { ...s.bgSessions, [prevId]: { streamingText: curStreamingText, isWaiting: true } },
      }))
    }

    // Restore state for the target conversation if it was running in the background
    const bg = id ? get().bgSessions[id] : undefined
    const inProgress = !!bg

    set((s) => {
      const updated = { ...s.bgSessions }
      if (id) delete updated[id] // it's now the active conversation
      return {
        bgSessions: updated,
        activeConversationId: id,
        messages: [],
        streaming: { ...emptyStreaming },
        hasActiveSession: inProgress,
        isWaitingForResponse: inProgress,
        isLoadingMessages: !!id,
        permissionRequest: null,
        permissionQueue: [],
        askUserQuestion: null,
        exitPlanMode: null,
        replyToMessage: null,
        scrollToMessageId: null,
        messageQueue: [],
        workflowSuggestion: null,
      }
    })

    // Register the new conversation for event routing
    if (id) {
      const projectPath = useProjectStore.getState().activeProjectPath || ''
      useProjectStore.getState().registerConversation(id, projectPath)
    }

    if (id) {
      const loaded = await api.conversations.getMessages(id)

      // For old messages without agent attribution, re-parse [AgentName] markers
      const tab = getActiveProjectTab()
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
        set({ messages, isLoadingMessages: false })
      } else {
        set({ messages: loaded, isLoadingMessages: false })
      }
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
      return s.activeConversationId === id
        ? { activeConversationId: null, messages: [], stoppedLoops: stopped }
        : { stoppedLoops: stopped }
    })
    const projectPath = useProjectStore.getState().activeProjectPath || ''
    await get().loadConversations(projectPath)
  },

  renameConversation: async (id, title) => {
    await api.conversations.updateTitle(id, title)
    const projectPath = useProjectStore.getState().activeProjectPath || ''
    await get().loadConversations(projectPath)
  },

  sendMessage: async (text, images) => {
    let conversationId = get().activeConversationId
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

    // Capture and clear reply-to state
    const replyTo = get().replyToMessage
    const replyToId = replyTo?.id
    set({ replyToMessage: null })

    // Restore any friendly agent names back to hex IDs for Claude CLI
    let cliText = restoreAgentIds(text)

    // Save user message to DB first to get the assigned ID
    const saved = await api.conversations.saveMessage(conversationId, {
      role: 'user',
      type: 'text',
      content: text,
      replyToId: replyToId,
    })

    // Add user message with DB-assigned ID
    const userMsg: ConversationMessage = {
      id: saved.id,
      role: 'user',
      type: 'text',
      content: text,
      images: images,
      replyToId: replyToId,
      timestamp: Date.now(),
    }
    set((s) => ({ messages: [...s.messages, userMsg] }))

    // Broadcast user message to mobile clients (best-effort, non-blocking)
    api.mobile?.broadcastUserMessage(conversationId, text, images)?.catch(() => {})

    const turnStartTime = Date.now()
    set({ isWaitingForResponse: true, streaming: { ...emptyStreaming, isStreaming: true, _turnStartTime: turnStartTime, _lastActivityTime: turnStartTime } })

    // Always start a new session if none is active for this conversation
    if (!get().hasActiveSession) {
      const hasHistory = get().messages.length > 1
      const tab = getActiveProjectTab()
      const projectPath = useProjectStore.getState().activeProjectPath || ''

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
        get().addMessage({
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
      set((s) => ({
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
      const tab = getActiveProjectTab()
      if (tab?.mode === 'team' && tab.agents.length > 0) {
        const hint = buildMessageContextHint(cliText, tab.agents)
        if (hint) cliText = hint + cliText
      }
      await api.claude.sendMessage(conversationId, cliText, images)
      set((s) => ({
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
    set((s) => ({
      messageQueue: [...s.messageQueue, { text, images }],
    }))
  },

  clearMessageQueue: () => {
    set({ messageQueue: [] })
  },

  abortSession: () => {
    const id = get().activeConversationId
    if (id) {
      api.claude.abort(id).catch((err) => console.error('[abortSession] Failed to abort:', err))
      set((s) => {
        const bg = { ...s.bgSessions }
        delete bg[id]
        return { isWaitingForResponse: false, streaming: { ...emptyStreaming }, messageQueue: [], bgSessions: bg }
      })
    }
  },

  stopLoop: (conversationId) => {
    const id = conversationId ?? get().activeConversationId
    if (!id) return
    if (get().activeConversationId === id && get().isWaitingForResponse) {
      api.claude.abort(id).catch((err) => console.error('[stopLoop] Failed to abort:', err))
    }
    set((s) => {
      const bg = { ...s.bgSessions }
      delete bg[id]
      const patch: Partial<ConversationStore> = {
        stoppedLoops: { ...s.stoppedLoops, [id]: true },
        bgSessions: bg,
      }
      if (get().activeConversationId === id) {
        patch.isWaitingForResponse = false
        patch.streaming = { ...emptyStreaming }
        patch.messageQueue = []
      }
      return patch as Partial<ConversationStore>
    })
  },

  respondPermission: (allowed, always) => {
    const perm = get().permissionRequest
    if (perm) {
      api.claude.respondPermission(perm.sessionId, allowed, always)
        .catch((err) => console.error('[respondPermission] Failed to respond:', err))
      // Pop next from queue, or null if empty
      const queue = [...get().permissionQueue]
      const next = queue.shift() || null
      set({ permissionRequest: next, permissionQueue: queue })
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
        return {
          askUserQuestion: null,
          answeredQuestionIds: ids,
          isWaitingForResponse: true,
          streaming: { ...emptyStreaming, isStreaming: true },
        }
      })
    }
  },

  respondToPlanExit: (approved, feedback) => {
    const p = get().exitPlanMode
    if (p) {
      api.claude.respondToPlanExit(p.sessionId, approved, feedback)
        .catch((err) => console.error('[respondToPlanExit] Failed to respond:', err))
      set({
        exitPlanMode: null,
        isWaitingForResponse: true,
        streaming: { ...emptyStreaming, isStreaming: true },
      })
    }
  },

  handleClaudeEvent: (event) => {
    const { activeConversationId } = get()

    // Handle background session events (conversations running while another is active)
    if (event.sessionId !== activeConversationId) {
      const bgId = event.sessionId
      if (!bgId) return

      if (event.type === 'assistant') {
        // Track latest streaming text so we can save it when result fires.
        // Auto-create the bgSessions entry if missing (handles the race where the user
        // switched before session:started arrived and hasActiveSession was still false).
        const msg = event.message as { content?: Array<{ type: string; text?: string }> }
        const textContent = msg?.content
          ?.filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('') ?? ''
        if (textContent) {
          set((s) => {
            const bg = s.bgSessions[bgId] ?? { streamingText: '', isWaiting: true }
            return { bgSessions: { ...s.bgSessions, [bgId]: { ...bg, streamingText: textContent } } }
          })
        }
      } else if (event.type === 'result') {
        // Save the final text to DB so it's there when the user switches back.
        // bg may be undefined if assistant events arrived before bgSessions entry was created.
        const bg = get().bgSessions[bgId]
        const finalText = bg?.streamingText ?? ''
        if (finalText) {
          // Get project tab for team mode agent parsing
          const projectPath = useProjectStore.getState().conversationProjectMap.get(bgId)
          const tab = projectPath
            ? useProjectStore.getState().openProjects.find((p) => p.projectPath === projectPath)
            : null

          if (tab?.mode === 'team' && tab.agents.length > 0) {
            const segments = parseAgentSegments(finalText, tab.agents)
            for (const seg of segments) {
              api.conversations.saveMessage(bgId, {
                role: 'assistant', type: 'text', content: seg.text,
                agentName: seg.agentName || undefined, agentIcon: seg.agentIcon, agentColor: seg.agentColor,
              }).catch((err) => console.error('[bgSession] Failed to save message:', err))
            }
          } else {
            api.conversations.saveMessage(bgId, { role: 'assistant', type: 'text', content: finalText })
              .catch((err) => console.error('[bgSession] Failed to save message:', err))
          }
        }
        // Session work is done — remove from bgSessions
        set((s) => { const bg = { ...s.bgSessions }; delete bg[bgId]; return { bgSessions: bg } })
      } else if (event.type === 'session:ended' || event.type === 'session:error') {
        set((s) => { const bg = { ...s.bgSessions }; delete bg[bgId]; return { bgSessions: bg } })
      }
      return
    }

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
          console.log('[ConversationStore] Unhandled event type:', eventType, JSON.stringify(event).slice(0, 300))
        }
        break
      }
    }
  },

  handleMobileMessage: (conversationId, message, images) => {
    // Only inject if this conversation is currently active
    if (get().activeConversationId !== conversationId) return

    // Add the user message to the UI (already persisted to DB by relay-client)
    set((s) => ({
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
    // Capture convId BEFORE set() to avoid race condition where user switches
    // conversations between set() and the DB save, causing messages to be
    // saved under the wrong conversation ID.
    const convId = get().activeConversationId
    set((s) => ({ messages: [...s.messages, message] }))

    // Save to DB in background and update in-memory message with the assigned ID
    if (convId) {
      api.conversations.saveMessage(convId, {
        role: message.role,
        type: message.type,
        content: message.content,
        contentBlocks: message.contentBlocks,
        agentName: message.agentName,
        agentIcon: message.agentIcon,
        agentColor: message.agentColor,
        replyToId: message.replyToId,
      }).then((saved) => {
        if (saved?.id) {
          set((s) => ({
            messages: s.messages.map((m) => m === message ? { ...m, id: saved.id } : m),
          }))
        }
      })
    }
  },

  resetStreaming: () => {
    set({ streaming: { ...emptyStreaming } })
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
    if (suggestion.tier === 'repeated' || suggestion.tier === 'matched_workflow') {
      if (!repetitionDetector) return
      await repetitionDetector
        .dismissPattern(
          suggestion.projectPath,
          suggestion.match.bagHash,
          mode === 'never' ? 'permanent' : 'cooldown',
        )
        .catch(() => {})
    } else {
      // Candidate-tier: silence by conversation id so we don't re-suggest on
      // subsequent turns of the same chat. "never" is a no-op here — there's
      // no cross-conversation pattern to mute yet.
      addDismissedConversationId(suggestion.conversationId)
    }
  },
}))

// After each turn resolves (streaming: true → false):
//   1. Run unified workflow-suggestion detection (repeated > candidate).
//   2. Schedule embedding indexing so this conversation contributes to future
//      cross-conversation matches.
let _indexTimer: ReturnType<typeof setTimeout> | null = null
useConversationStore.subscribe((state, prev) => {
  if (!(prev.isWaitingForResponse && !state.isWaitingForResponse)) return

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

            useConversationStore.setState({
              workflowSuggestion: { tier: 'repeated', conversationId: cid, projectPath, match },
            })
            return
          }
        } catch {
          /* detector unavailable — fall through to candidate tier */
        }
      }

      // Tier 2 — candidate heuristic (substantial single conversation).
      if (passesCandidateHeuristic(msgs)) {
        if (useConversationStore.getState().activeConversationId !== cid) return
        if (getDismissedConversationIds().has(cid)) return
        const toolCount = msgs.filter((m) => m.type === 'tool_use').length
        const uniqueTools = collectUniqueTools(msgs)
        useConversationStore.setState({
          workflowSuggestion: {
            tier: 'candidate',
            conversationId: cid,
            projectPath,
            toolCount,
            uniqueTools,
          },
        })
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
