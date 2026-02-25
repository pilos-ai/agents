import { create } from 'zustand'
import { api } from '../api'
import { useProjectStore, getActiveProjectTab } from './useProjectStore'
import { buildTeamSystemPrompt } from '../utils/team-prompt-builder'
import { restoreAgentIds } from '../utils/agent-names'
import { AGENT_COLORS } from '../data/agent-templates'
import type { Conversation, ConversationMessage, ContentBlock, ClaudeEvent, ImageAttachment, AgentDefinition, ToolUseBlock, ToolResultBlock, AskUserQuestionData, ExitPlanModeData } from '../types'

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
  _partialJson: string
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
  permissionRequest: { sessionId: string; toolName: string; toolInput: Record<string, unknown> } | null
  askUserQuestion: AskUserQuestionData | null
  answeredQuestionIds: Set<string>
  exitPlanMode: ExitPlanModeData | null
  replyToMessage: ConversationMessage | null
  scrollToMessageId: number | null

  // Actions
  loadConversations: (projectPath?: string) => Promise<void>
  setActiveConversation: (id: string | null) => Promise<void>
  createConversation: (title?: string) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  sendMessage: (text: string, images?: ImageAttachment[]) => Promise<void>
  abortSession: () => void
  respondPermission: (allowed: boolean, always?: boolean) => void
  respondToQuestion: (answers: Record<string, string>) => void
  respondToPlanExit: (approved: boolean) => void
  handleClaudeEvent: (event: ClaudeEvent) => void
  addMessage: (message: ConversationMessage) => void
  resetStreaming: () => void
  setReplyTo: (msg: ConversationMessage | null) => void
  setScrollToMessageId: (id: number | null) => void
}

const emptyStreaming: StreamingState = {
  text: '',
  contentBlocks: [],
  thinking: '',
  isStreaming: false,
  currentAgentName: null,
  _partialJson: '',
}

/** Parse text into agent-attributed segments for team mode */
function parseAgentSegments(
  text: string,
  agents: AgentDefinition[]
): Array<{ agentName: string | null; agentId?: string; agentEmoji?: string; agentColor?: string; text: string }> {
  const agentNameSet = new Set(agents.map((a) => a.name))
  const lines = text.split('\n')
  const segments: Array<{ agentName: string | null; agentId?: string; agentEmoji?: string; agentColor?: string; text: string }> = []
  let current: { agentName: string | null; agentId?: string; agentEmoji?: string; agentColor?: string; lines: string[] } = {
    agentName: null,
    lines: [],
  }

  for (const line of lines) {
    const match = line.match(/^\[([A-Za-z_\s]+)\]\s*$/)
    if (match) {
      const name = match[1].trim()
      if (agentNameSet.has(name)) {
        // Flush current segment
        if (current.lines.length > 0 || current.agentName) {
          const text = current.lines.join('\n').trim()
          if (text) {
            segments.push({ agentName: current.agentName, agentId: current.agentId, agentEmoji: current.agentEmoji, agentColor: current.agentColor, text })
          }
        }
        const agent = agents.find((a) => a.name === name)
        current = {
          agentName: name,
          agentId: agent?.id,
          agentEmoji: agent?.emoji,
          agentColor: agent?.color,
          lines: [],
        }
        continue
      }
    }
    current.lines.push(line)
  }

  // Flush last segment
  const lastText = current.lines.join('\n').trim()
  if (lastText) {
    segments.push({ agentName: current.agentName, agentId: current.agentId, agentEmoji: current.agentEmoji, agentColor: current.agentColor, text: lastText })
  }

  return segments
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  streaming: { ...emptyStreaming },
  processLogs: [],
  isWaitingForResponse: false,
  hasActiveSession: false,
  permissionRequest: null,
  askUserQuestion: null,
  answeredQuestionIds: new Set(),
  exitPlanMode: null,
  replyToMessage: null,
  scrollToMessageId: null,

  loadConversations: async (projectPath?: string) => {
    const conversations = await api.conversations.list(projectPath)
    set({ conversations })
  },

  setActiveConversation: async (id) => {
    // Abort the previous chat's Claude process to prevent context divergence.
    // If we don't abort, the CLI keeps running and its internal state diverges
    // from the app's DB — causing context bleeding when resuming later.
    const prevId = get().activeConversationId
    if (prevId && prevId !== id && get().hasActiveSession) {
      api.claude.abort(prevId)
    }

    set({ activeConversationId: id, messages: [], streaming: { ...emptyStreaming }, hasActiveSession: false, permissionRequest: null, askUserQuestion: null, exitPlanMode: null, replyToMessage: null, scrollToMessageId: null })

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
                  agentEmoji: seg.agentEmoji,
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
        set({ messages })
      } else {
        set({ messages: loaded })
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
    if (get().activeConversationId === id) {
      set({ activeConversationId: null, messages: [] })
    }
    const projectPath = useProjectStore.getState().activeProjectPath || ''
    await get().loadConversations(projectPath)
  },

  sendMessage: async (text, images) => {
    let conversationId = get().activeConversationId
    if (!conversationId) {
      conversationId = await get().createConversation(text.slice(0, 50))
    }

    // Capture and clear reply-to state
    const replyTo = get().replyToMessage
    const replyToId = replyTo?.id
    set({ replyToMessage: null })

    // Restore any friendly agent names back to hex IDs for Claude CLI
    const cliText = restoreAgentIds(text)

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

    // Start or send to Claude
    set({ isWaitingForResponse: true, streaming: { ...emptyStreaming, isStreaming: true } })

    // Always start a new session if none is active for this conversation
    if (!get().hasActiveSession) {
      const hasHistory = get().messages.length > 1
      const tab = getActiveProjectTab()
      const projectPath = useProjectStore.getState().activeProjectPath || ''

      // Register this conversation for event routing
      useProjectStore.getState().registerConversation(conversationId, projectPath)

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

  abortSession: () => {
    const id = get().activeConversationId
    if (id) {
      api.claude.abort(id)
      set({ isWaitingForResponse: false, streaming: { ...emptyStreaming } })
    }
  },

  respondPermission: (allowed, always) => {
    const perm = get().permissionRequest
    if (perm) {
      api.claude.respondPermission(perm.sessionId, allowed, always)
      set({ permissionRequest: null })
    }
  },

  respondToQuestion: (answers) => {
    const q = get().askUserQuestion
    if (q) {
      api.claude.respondToQuestion(q.sessionId, answers)
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

  respondToPlanExit: (approved) => {
    const p = get().exitPlanMode
    if (p) {
      api.claude.respondToPlanExit(p.sessionId, approved)
      set({
        exitPlanMode: null,
        isWaitingForResponse: true,
        streaming: { ...emptyStreaming, isStreaming: true },
      })
    }
  },

  handleClaudeEvent: (event) => {
    const { activeConversationId } = get()
    if (event.sessionId !== activeConversationId) return

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
        // Extract tool_use blocks as separate messages, text/thinking → streaming.
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

        if (textContent || thinkingContent) {
          set((s) => {
            let currentAgentName = s.streaming.currentAgentName

            // Detect [AgentName] markers in team mode
            if (tab?.mode === 'team' && tab.agents.length > 0 && textContent) {
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

            return {
              streaming: {
                ...s.streaming,
                isStreaming: true,
                text: textContent || s.streaming.text,
                thinking: thinkingContent || s.streaming.thinking,
                currentAgentName,
              },
            }
          })
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
            agentEmoji: agent?.emoji,
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
        set({
          permissionRequest: {
            sessionId: event.sessionId as string,
            toolName: (tool?.name as string) || (event.tool_name as string) || 'unknown tool',
            toolInput: (tool?.input || event.tool_input || event.command || '') as Record<string, unknown>,
          },
        })
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

            // Detect [AgentName] markers in team mode
            if (tab?.mode === 'team' && tab.agents.length > 0) {
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
            agentEmoji: agent?.emoji,
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
            agentEmoji: agent?.emoji,
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
                agentEmoji: seg.agentEmoji,
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

        set({
          isWaitingForResponse: false,
          streaming: { ...emptyStreaming },
        })

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
        })
        break
      }

      case 'rate_limit_event':
      case 'system':
      case 'raw':
      case 'stderr':
        // Informational events — no UI action needed
        break

      default: {
        // Catch permission-related events with alternate type names
        const eventType = String(event.type || '')
        if (eventType.includes('permission') || eventType.includes('tool_use_permission')) {
          const tool = event.tool as { name?: string; input?: Record<string, unknown> } | undefined
          set({
            permissionRequest: {
              sessionId: event.sessionId as string,
              toolName: (tool?.name as string) || (event.tool_name as string) || (event.name as string) || 'unknown tool',
              toolInput: (tool?.input || event.tool_input || event.input || event.command || '') as Record<string, unknown>,
            },
          })
        } else {
          console.log('[ConversationStore] Unhandled event type:', eventType, JSON.stringify(event).slice(0, 300))
        }
        break
      }
    }
  },

  addMessage: (message) => {
    set((s) => ({ messages: [...s.messages, message] }))

    // Save to DB in background and update in-memory message with the assigned ID
    const convId = get().activeConversationId
    if (convId) {
      api.conversations.saveMessage(convId, {
        role: message.role,
        type: message.type,
        content: message.content,
        contentBlocks: message.contentBlocks,
        agentName: message.agentName,
        agentEmoji: message.agentEmoji,
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
}))
