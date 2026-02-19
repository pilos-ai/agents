import { create } from 'zustand'
import { api } from '../api'
import { useProjectStore, getActiveProjectTab } from './useProjectStore'
import { buildTeamSystemPrompt } from '../utils/team-prompt-builder'
import { AGENT_COLORS } from '../data/agent-templates'
import type { Conversation, ConversationMessage, ContentBlock, ClaudeEvent, ImageAttachment, AgentDefinition } from '../types'

interface StreamingState {
  text: string
  contentBlocks: ContentBlock[]
  thinking: string
  isStreaming: boolean
  currentAgentName: string | null
}

interface ConversationStore {
  // State
  conversations: Conversation[]
  activeConversationId: string | null
  messages: ConversationMessage[]
  streaming: StreamingState
  isWaitingForResponse: boolean
  hasActiveSession: boolean
  permissionRequest: { sessionId: string; toolName: string; toolInput: Record<string, unknown> } | null

  // Actions
  loadConversations: (projectPath?: string) => Promise<void>
  setActiveConversation: (id: string | null) => Promise<void>
  createConversation: (title?: string) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  sendMessage: (text: string, images?: ImageAttachment[]) => Promise<void>
  abortSession: () => void
  respondPermission: (allowed: boolean, always?: boolean) => void
  handleClaudeEvent: (event: ClaudeEvent) => void
  addMessage: (message: ConversationMessage) => void
  resetStreaming: () => void
}

const emptyStreaming: StreamingState = {
  text: '',
  contentBlocks: [],
  thinking: '',
  isStreaming: false,
  currentAgentName: null,
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
  isWaitingForResponse: false,
  hasActiveSession: false,
  permissionRequest: null,

  loadConversations: async (projectPath?: string) => {
    const conversations = await api.conversations.list(projectPath)
    set({ conversations })
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id, messages: [], streaming: { ...emptyStreaming }, hasActiveSession: false })
    if (id) {
      const messages = await api.conversations.getMessages(id)
      set({ messages })
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

    // Add user message (with image thumbnails for display)
    const userMsg: ConversationMessage = {
      role: 'user',
      type: 'text',
      content: text,
      images: images,
      timestamp: Date.now(),
    }
    set((s) => ({ messages: [...s.messages, userMsg] }))

    // Save to DB
    await api.conversations.saveMessage(conversationId, {
      role: 'user',
      type: 'text',
      content: text,
    })

    // Start or send to Claude
    set({ isWaitingForResponse: true, streaming: { ...emptyStreaming, isStreaming: true } })

    // Always start a new session if none is active for this conversation
    if (!get().hasActiveSession) {
      const hasHistory = get().messages.length > 1
      const tab = getActiveProjectTab()
      const projectPath = useProjectStore.getState().activeProjectPath || ''

      // Register this conversation for event routing
      useProjectStore.getState().registerConversation(conversationId, projectPath)

      // Build team system prompt if in team mode
      let appendSystemPrompt: string | undefined
      if (tab?.mode === 'team' && tab.agents.length > 0) {
        appendSystemPrompt = buildTeamSystemPrompt(tab.agents)
      }

      // Generate MCP config if servers are configured
      let mcpConfigPath: string | undefined
      if (tab?.mcpServers?.some((s) => s.enabled)) {
        mcpConfigPath = await api.mcp.writeConfig(projectPath, tab.mcpServers)
      }

      await api.claude.startSession(conversationId, {
        prompt: text,
        images: images,
        resume: hasHistory,
        workingDirectory: projectPath || undefined,
        model: tab?.model,
        permissionMode: tab?.permissionMode,
        appendSystemPrompt,
        mcpConfigPath,
      })
    } else {
      await api.claude.sendMessage(conversationId, text, images)
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

  handleClaudeEvent: (event) => {
    const { activeConversationId } = get()
    if (event.sessionId !== activeConversationId) return

    switch (event.type) {
      case 'session:started': {
        set({ hasActiveSession: true })
        break
      }

      case 'assistant': {
        // Each assistant event contains the full message with all content blocks so far.
        // We only care about the latest version (which has the most content blocks).
        const msg = event.message as { id?: string; content: ContentBlock[] }
        if (!msg?.content) break

        // Extract text from content blocks
        const textContent = msg.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('')

        if (!textContent) break // Skip thinking-only or tool_use-only messages

        // Check if we already have a message for this assistant turn
        // (the CLI sends updated assistant events as new blocks are added)
        const messages = get().messages
        const lastMsg = messages[messages.length - 1]
        if (lastMsg?.role === 'assistant' && lastMsg.type === 'text') {
          // Update the last assistant message in-place
          set({
            messages: [
              ...messages.slice(0, -1),
              { ...lastMsg, content: textContent, contentBlocks: msg.content },
            ],
          })
        } else {
          get().addMessage({
            role: 'assistant',
            type: 'text',
            content: textContent,
            contentBlocks: msg.content,
            timestamp: Date.now(),
          })
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
        const delta = event.delta as { type: string; text?: string; thinking?: string }
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
        }
        break
      }

      case 'content_block_stop': {
        // A content block finished
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

        if (finalText) {
          const tab = getActiveProjectTab()

          // In team mode, parse agent segments and create per-agent messages
          if (tab?.mode === 'team' && tab.agents.length > 0) {
            const segments = parseAgentSegments(finalText, tab.agents)

            // Remove any existing assistant message from streaming (assistant events)
            const messages = get().messages
            const lastMsg = messages[messages.length - 1]
            const baseMessages = lastMsg?.role === 'assistant' && lastMsg.type === 'text'
              ? messages.slice(0, -1)
              : [...messages]

            const agentMessages: ConversationMessage[] = segments.map((seg) => ({
              role: 'assistant' as const,
              type: 'text' as const,
              content: seg.text,
              agentId: seg.agentId,
              agentName: seg.agentName || undefined,
              agentEmoji: seg.agentEmoji,
              agentColor: seg.agentColor,
              timestamp: Date.now(),
            }))

            set({ messages: [...baseMessages, ...agentMessages] })
          } else {
            // Solo mode — same as before
            const messages = get().messages
            const lastMsg = messages[messages.length - 1]
            if (lastMsg?.role === 'assistant' && lastMsg.type === 'text') {
              set({
                messages: [
                  ...messages.slice(0, -1),
                  { ...lastMsg, content: finalText },
                ],
              })
            } else {
              get().addMessage({
                role: 'assistant',
                type: 'text',
                content: finalText,
                timestamp: Date.now(),
              })
            }
          }

          // Save full text to DB (single message regardless of mode)
          if (activeConversationId) {
            api.conversations.saveMessage(activeConversationId, {
              role: 'assistant',
              type: 'text',
              content: finalText,
            })
          }
        }

        set({
          isWaitingForResponse: false,
          streaming: { ...emptyStreaming },
        })

        // Auto-generate title from first assistant response
        if (get().messages.length <= 3 && activeConversationId) {
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
  },

  resetStreaming: () => {
    set({ streaming: { ...emptyStreaming } })
  },
}))
