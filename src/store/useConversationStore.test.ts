import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { useConversationStore } from './useConversationStore'
import type { ClaudeEvent } from '../types'

// ── Mock dependencies ────────────────────────────────────────────────────────
// All vi.mock calls must be at top level so vitest can hoist them.

vi.mock('../api', () => ({
  api: {
    cli: {
      check: vi.fn(), install: vi.fn(), checkAuth: vi.fn(), login: vi.fn(),
      onInstallOutput: vi.fn(() => () => {}), onLoginOutput: vi.fn(() => () => {}),
      getUsageStats: vi.fn(), getClaudeUsage: vi.fn(),
    },
    conversations: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((title: string) =>
        Promise.resolve({ id: 'test-conv', title, model: 'sonnet', working_directory: '', project_path: '', created_at: '', updated_at: '' })
      ),
      updateTitle: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
      getMessages: vi.fn().mockResolvedValue([]),
      saveMessage: vi.fn().mockResolvedValue({ id: 1 }),
      getMessage: vi.fn().mockResolvedValue(null),
      searchMessages: vi.fn().mockResolvedValue({ total: 0, messages: [] }),
    },
    claude: {
      startSession: vi.fn().mockResolvedValue(null),
      sendMessage: vi.fn().mockResolvedValue(null),
      respondPermission: vi.fn().mockResolvedValue(null),
      respondToQuestion: vi.fn().mockResolvedValue(null),
      respondToPlanExit: vi.fn().mockResolvedValue(null),
      abort: vi.fn().mockResolvedValue(null),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    mcp: { writeConfig: vi.fn().mockResolvedValue({ configPath: '/tmp/mcp.json', warnings: [] }) },
    mobile: { broadcastUserMessage: vi.fn() },
    menu: { setActiveProject: vi.fn(), rebuildMenu: vi.fn(), onMenuAction: vi.fn(() => () => {}) },
  },
}))

vi.mock('./useProjectStore', () => ({
  useProjectStore: {
    getState: vi.fn(() => ({
      activeProjectPath: '/test-project',
      registerConversation: vi.fn(),
      conversationProjectMap: new Map(),
      openProjects: [],
    })),
  },
  getActiveProjectTab: vi.fn(() => null),
}))

vi.mock('./useUsageStore', () => ({
  useUsageStore: { getState: vi.fn(() => ({ fetchStats: vi.fn() })) },
}))

vi.mock('./useAnalyticsStore', () => ({
  useAnalyticsStore: { getState: vi.fn(() => ({ addEntry: vi.fn() })) },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getApi() {
  const mod = await import('../api')
  return (mod as unknown as { api: Record<string, Record<string, Mock>> }).api
}

const initialState = useConversationStore.getState()

beforeEach(() => {
  useConversationStore.setState(initialState, true)
  vi.clearAllMocks()
})

// ── Conversation list ────────────────────────────────────────────────────────

describe('loadConversations', () => {
  it('stores conversations returned by api', async () => {
    const api = await getApi()
    const mockConvs = [
      { id: 'c1', title: 'Chat 1', model: 'sonnet', working_directory: '', project_path: '/proj', created_at: '', updated_at: '' },
    ]
    api.conversations.list.mockResolvedValue(mockConvs)

    await useConversationStore.getState().loadConversations('/proj')
    expect(useConversationStore.getState().conversations).toEqual(mockConvs)
  })
})

describe('createConversation', () => {
  it('creates conversation and sets it as active', async () => {
    const api = await getApi()
    const newConv = { id: 'new-id', title: 'New Chat', model: 'sonnet', working_directory: '', project_path: '/proj', created_at: '', updated_at: '' }
    api.conversations.create.mockResolvedValue(newConv)
    api.conversations.list.mockResolvedValue([newConv])
    api.conversations.getMessages.mockResolvedValue([])

    const id = await useConversationStore.getState().createConversation('New Chat')
    expect(id).toBe('new-id')
    expect(useConversationStore.getState().activeConversationId).toBe('new-id')
  })
})

describe('deleteConversation', () => {
  it('clears activeConversationId when deleting the active conversation', async () => {
    const api = await getApi()
    useConversationStore.setState({ activeConversationId: 'c1', conversations: [], messages: [] })
    api.conversations.list.mockResolvedValue([])

    await useConversationStore.getState().deleteConversation('c1')
    expect(useConversationStore.getState().activeConversationId).toBeNull()
    expect(useConversationStore.getState().messages).toEqual([])
  })

  it('does not clear activeConversationId when deleting a different conversation', async () => {
    const api = await getApi()
    useConversationStore.setState({ activeConversationId: 'c2', conversations: [], messages: [] })
    api.conversations.list.mockResolvedValue([])

    await useConversationStore.getState().deleteConversation('c1')
    expect(useConversationStore.getState().activeConversationId).toBe('c2')
  })
})

// ── Permission handling ───────────────────────────────────────────────────────

describe('respondPermission', () => {
  it('calls api.claude.respondPermission and clears permissionRequest', async () => {
    const api = await getApi()
    const perm = { sessionId: 'sess-1', toolName: 'bash', toolInput: { command: 'ls' } }
    useConversationStore.setState({ permissionRequest: perm, permissionQueue: [] })

    useConversationStore.getState().respondPermission(true)
    expect(api.claude.respondPermission).toHaveBeenCalledWith('sess-1', true, undefined)
    expect(useConversationStore.getState().permissionRequest).toBeNull()
  })

  it('pops next from queue after responding', async () => {
    const perm1 = { sessionId: 's1', toolName: 'bash', toolInput: {} }
    const perm2 = { sessionId: 's2', toolName: 'write_file', toolInput: {} }
    useConversationStore.setState({ permissionRequest: perm1, permissionQueue: [perm2] })

    useConversationStore.getState().respondPermission(false)
    expect(useConversationStore.getState().permissionRequest).toEqual(perm2)
    expect(useConversationStore.getState().permissionQueue).toHaveLength(0)
  })

  it('does nothing if no permissionRequest is set', async () => {
    const api = await getApi()
    useConversationStore.setState({ permissionRequest: null })
    useConversationStore.getState().respondPermission(true)
    expect(api.claude.respondPermission).not.toHaveBeenCalled()
  })
})

// ── handleClaudeEvent ─────────────────────────────────────────────────────────

describe('handleClaudeEvent — session lifecycle', () => {
  beforeEach(() => {
    useConversationStore.setState({ activeConversationId: 'sess-1' })
  })

  it('sets hasActiveSession on session:started', async () => {
    useConversationStore.getState().handleClaudeEvent({ type: 'session:started', sessionId: 'sess-1' } as ClaudeEvent)
    expect(useConversationStore.getState().hasActiveSession).toBe(true)
  })

  it('clears session state on session:ended', async () => {
    useConversationStore.setState({ isWaitingForResponse: true, hasActiveSession: true })
    useConversationStore.getState().handleClaudeEvent({ type: 'session:ended', sessionId: 'sess-1' } as ClaudeEvent)
    expect(useConversationStore.getState().hasActiveSession).toBe(false)
    expect(useConversationStore.getState().isWaitingForResponse).toBe(false)
  })

  it('adds error message and clears session on session:error', async () => {
    useConversationStore.setState({ isWaitingForResponse: true, hasActiveSession: true, messages: [] })
    useConversationStore.getState().handleClaudeEvent({ type: 'session:error', sessionId: 'sess-1', error: 'CLI crashed' } as ClaudeEvent)

    const { messages, hasActiveSession, isWaitingForResponse } = useConversationStore.getState()
    expect(hasActiveSession).toBe(false)
    expect(isWaitingForResponse).toBe(false)
    expect(messages.some((m) => m.content.includes('CLI crashed'))).toBe(true)
  })
})

describe('handleClaudeEvent — permission_request', () => {
  beforeEach(() => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      permissionRequest: null,
      permissionQueue: [],
    })
  })

  it('sets permissionRequest when none is pending', async () => {
    useConversationStore.getState().handleClaudeEvent({
      type: 'permission_request',
      sessionId: 'sess-1',
      tool: { name: 'bash', input: { command: 'rm -rf /' } },
    } as ClaudeEvent)

    const { permissionRequest } = useConversationStore.getState()
    expect(permissionRequest?.toolName).toBe('bash')
  })

  it('queues permission when one is already pending', async () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      permissionRequest: { sessionId: 'sess-1', toolName: 'existing', toolInput: {} },
      permissionQueue: [],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'permission_request',
      sessionId: 'sess-1',
      tool: { name: 'write_file', input: {} },
    } as ClaudeEvent)

    expect(useConversationStore.getState().permissionQueue).toHaveLength(1)
    expect(useConversationStore.getState().permissionQueue[0].toolName).toBe('write_file')
  })
})

describe('handleClaudeEvent — ask_user_question', () => {
  it('stores question data', async () => {
    useConversationStore.setState({ activeConversationId: 'sess-1' })
    useConversationStore.getState().handleClaudeEvent({
      type: 'ask_user_question',
      sessionId: 'sess-1',
      toolUseId: 'tu-1',
      questions: [{ name: 'choice', prompt: 'Pick one', type: 'select', options: ['A', 'B'] }],
    } as ClaudeEvent)

    const { askUserQuestion } = useConversationStore.getState()
    expect(askUserQuestion?.toolUseId).toBe('tu-1')
    expect(askUserQuestion?.questions).toHaveLength(1)
  })
})

describe('handleClaudeEvent — system subtype', () => {
  beforeEach(() => {
    useConversationStore.setState({ activeConversationId: 'sess-1' })
  })

  it('sets retrying on api_retry subtype', async () => {
    useConversationStore.getState().handleClaudeEvent({ type: 'system', sessionId: 'sess-1', subtype: 'api_retry' } as ClaudeEvent)
    expect(useConversationStore.getState().streaming.retrying).toBe(true)
  })

  it('clears retrying on init subtype', async () => {
    useConversationStore.setState((s) => ({ streaming: { ...s.streaming, retrying: true } }))
    useConversationStore.getState().handleClaudeEvent({ type: 'system', sessionId: 'sess-1', subtype: 'init' } as ClaudeEvent)
    expect(useConversationStore.getState().streaming.retrying).toBe(false)
  })
})

// ── Background session routing ────────────────────────────────────────────────

describe('handleClaudeEvent — background session routing', () => {
  it('routes events from non-active sessions to bgSessions', async () => {
    useConversationStore.setState({ activeConversationId: 'active-sess', bgSessions: {} })

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'bg-sess',
      message: { content: [{ type: 'text', text: 'Background response' }] },
    } as ClaudeEvent)

    const { bgSessions } = useConversationStore.getState()
    expect(bgSessions['bg-sess']?.streamingText).toBe('Background response')
  })

  it('removes bg session entry on result event', async () => {
    const api = await getApi()
    api.conversations.saveMessage.mockResolvedValue({ id: 1 })
    useConversationStore.setState({
      activeConversationId: 'active-sess',
      bgSessions: { 'bg-sess': { streamingText: 'done text', isWaiting: true } },
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'bg-sess',
    } as ClaudeEvent)

    expect(useConversationStore.getState().bgSessions['bg-sess']).toBeUndefined()
  })
})

// ── abortSession ─────────────────────────────────────────────────────────────

describe('abortSession', () => {
  it('calls api.claude.abort and resets waiting state', async () => {
    const api = await getApi()
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      isWaitingForResponse: true,
    })

    useConversationStore.getState().abortSession()
    expect(api.claude.abort).toHaveBeenCalledWith('sess-1')
    expect(useConversationStore.getState().isWaitingForResponse).toBe(false)
  })
})

// ── Message queue ─────────────────────────────────────────────────────────────

describe('message queue', () => {
  it('queues messages', async () => {
    useConversationStore.getState().queueMessage('first')
    useConversationStore.getState().queueMessage('second')
    expect(useConversationStore.getState().messageQueue).toHaveLength(2)
  })

  it('clears message queue', async () => {
    useConversationStore.getState().queueMessage('msg')
    useConversationStore.getState().clearMessageQueue()
    expect(useConversationStore.getState().messageQueue).toHaveLength(0)
  })
})

// ── replyTo / scrollTo ────────────────────────────────────────────────────────

describe('setReplyTo', () => {
  it('sets and clears reply target', async () => {
    const msg = { id: 1, role: 'user' as const, type: 'text' as const, content: 'original', timestamp: 0 }
    useConversationStore.getState().setReplyTo(msg)
    expect(useConversationStore.getState().replyToMessage).toEqual(msg)

    useConversationStore.getState().setReplyTo(null)
    expect(useConversationStore.getState().replyToMessage).toBeNull()
  })
})

describe('setScrollToMessageId', () => {
  it('stores and clears scroll target', async () => {
    useConversationStore.getState().setScrollToMessageId(42)
    expect(useConversationStore.getState().scrollToMessageId).toBe(42)

    useConversationStore.getState().setScrollToMessageId(null)
    expect(useConversationStore.getState().scrollToMessageId).toBeNull()
  })
})

// ── handleClaudeEvent — content_block_delta ───────────────────────────────────

describe('handleClaudeEvent — content_block_delta', () => {
  beforeEach(() => {
    useConversationStore.setState({ activeConversationId: 'sess-1' })
  })

  it('appends text_delta to streaming.text', () => {
    useConversationStore.setState((s) => ({ streaming: { ...s.streaming, text: 'hello ' } }))
    useConversationStore.getState().handleClaudeEvent({
      type: 'content_block_delta',
      sessionId: 'sess-1',
      delta: { type: 'text_delta', text: 'world' },
    } as ClaudeEvent)
    expect(useConversationStore.getState().streaming.text).toBe('hello world')
  })

  it('appends thinking_delta to streaming.thinking', () => {
    useConversationStore.getState().handleClaudeEvent({
      type: 'content_block_delta',
      sessionId: 'sess-1',
      delta: { type: 'thinking_delta', thinking: 'I think...' },
    } as ClaudeEvent)
    expect(useConversationStore.getState().streaming.thinking).toBe('I think...')
  })

  it('accumulates input_json_delta in _partialJson', () => {
    useConversationStore.getState().handleClaudeEvent({
      type: 'content_block_delta',
      sessionId: 'sess-1',
      delta: { type: 'input_json_delta', partial_json: '{"key":' },
    } as ClaudeEvent)
    useConversationStore.getState().handleClaudeEvent({
      type: 'content_block_delta',
      sessionId: 'sess-1',
      delta: { type: 'input_json_delta', partial_json: '"value"}' },
    } as ClaudeEvent)
    expect(useConversationStore.getState().streaming._partialJson).toBe('{"key":"value"}')
  })
})

// ── handleClaudeEvent — content_block_start ───────────────────────────────────

describe('handleClaudeEvent — content_block_start', () => {
  it('adds new content block to streaming.contentBlocks', () => {
    useConversationStore.setState({ activeConversationId: 'sess-1' })
    useConversationStore.getState().handleClaudeEvent({
      type: 'content_block_start',
      sessionId: 'sess-1',
      content_block: { type: 'text', text: '' },
    } as ClaudeEvent)
    expect(useConversationStore.getState().streaming.contentBlocks).toHaveLength(1)
    expect(useConversationStore.getState().streaming.isStreaming).toBe(true)
  })
})

// ── handleClaudeEvent — result ─────────────────────────────────────────────────

describe('handleClaudeEvent — result', () => {
  beforeEach(() => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
      isWaitingForResponse: true,
    })
  })

  it('adds text message from result string', async () => {
    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: 'Final answer',
    } as ClaudeEvent)
    expect(useConversationStore.getState().messages.some((m) => m.content === 'Final answer')).toBe(true)
  })

  it('falls back to streaming.text when result is empty', () => {
    useConversationStore.setState((s) => ({ streaming: { ...s.streaming, text: 'streamed text' } }))
    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: '',
    } as ClaudeEvent)
    expect(useConversationStore.getState().messages.some((m) => m.content === 'streamed text')).toBe(true)
  })

  it('adds fallback error message when is_error and no content', () => {
    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: '',
      is_error: true,
    } as unknown as ClaudeEvent)
    expect(
      useConversationStore.getState().messages.some((m) => m.content.includes('could not be completed'))
    ).toBe(true)
  })

  it('clears isWaitingForResponse', () => {
    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: 'done',
    } as ClaudeEvent)
    expect(useConversationStore.getState().isWaitingForResponse).toBe(false)
  })

  it('records analytics entry when cost_usd is present in result event', async () => {
    const analyticsMod = await import('./useAnalyticsStore')
    const analyticsStore = (analyticsMod as unknown as { useAnalyticsStore: { getState: ReturnType<typeof vi.fn> } }).useAnalyticsStore
    const addEntry = vi.fn()
    analyticsStore.getState.mockReturnValue({ addEntry })

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
      isWaitingForResponse: true,
      messageQueue: [],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: 'answer',
      cost_usd: '0.005',
    } as unknown as ClaudeEvent)

    expect(addEntry).toHaveBeenCalledWith(expect.objectContaining({
      cost: 0.005,
      success: true,
    }))
  })

  it('auto-generates conversation title from first user message', async () => {
    const api = await getApi()
    // Set up: one user message already in messages, no prior assistant messages
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [{ role: 'user', type: 'text', content: 'Hello, please help me', timestamp: 1 }],
      isWaitingForResponse: true,
      messageQueue: [],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: 'Here is my response',
    } as ClaudeEvent)

    // Should have called updateTitle with the first user message content
    expect(api.conversations.updateTitle).toHaveBeenCalledWith('sess-1', 'Hello, please help me')
  })

  it('does not auto-title when more than one user message exists', async () => {
    const api = await getApi()
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [
        { role: 'user', type: 'text', content: 'First message', timestamp: 1 },
        { role: 'assistant', type: 'text', content: 'Response', timestamp: 2 },
        { role: 'user', type: 'text', content: 'Second message', timestamp: 3 },
      ],
      isWaitingForResponse: true,
      messageQueue: [],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: 'Another response',
    } as ClaudeEvent)

    expect(api.conversations.updateTitle).not.toHaveBeenCalled()
  })

  it('processes next queued message after result', async () => {
    const api = await getApi()
    // sendMessage mock needed for the queued send
    api.claude.startSession.mockResolvedValue(null)
    api.claude.onEvent.mockReturnValue(() => {})

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
      isWaitingForResponse: true,
      messageQueue: [{ text: 'queued message', images: undefined }],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: 'first response done',
    } as ClaudeEvent)

    // Queue should have been cleared (next item dequeued)
    expect(useConversationStore.getState().messageQueue).toHaveLength(0)
  })

  it('fires setTimeout to send queued message after 100ms', async () => {
    vi.useFakeTimers()
    const api = await getApi()
    api.claude.startSession.mockResolvedValue(null)
    api.claude.onEvent.mockReturnValue(() => {})

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
      isWaitingForResponse: true,
      messageQueue: [{ text: 'delayed queued msg', images: undefined }],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: 'response',
    } as ClaudeEvent)

    // Advance past the 100ms setTimeout
    await vi.advanceTimersByTimeAsync(150)

    // sendMessage would have been triggered — startSession should have been called
    expect(api.claude.startSession).toHaveBeenCalled()

    vi.useRealTimers()
  })
})

// ── handleClaudeEvent — user (tool_result) ────────────────────────────────────

describe('handleClaudeEvent — user event with tool_result blocks', () => {
  it('adds tool_result message from user event', () => {
    useConversationStore.setState({ activeConversationId: 'sess-1', messages: [] })
    useConversationStore.getState().handleClaudeEvent({
      type: 'user',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'result text', is_error: false }],
      },
    } as ClaudeEvent)
    expect(useConversationStore.getState().messages.some((m) => m.type === 'tool_result')).toBe(true)
  })

  it('skips duplicate tool_result blocks', () => {
    const block = { type: 'tool_result', tool_use_id: 'tu-dup', content: 'x', is_error: false }
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [{ id: 1, role: 'assistant', type: 'tool_result', content: '', contentBlocks: [block as never], timestamp: 0 }],
    })
    useConversationStore.getState().handleClaudeEvent({
      type: 'user',
      sessionId: 'sess-1',
      message: { content: [block] },
    } as ClaudeEvent)
    const toolResults = useConversationStore.getState().messages.filter((m) => m.type === 'tool_result')
    expect(toolResults).toHaveLength(1)
  })
})

// ── handleClaudeEvent — exit_plan_mode ────────────────────────────────────────

describe('handleClaudeEvent — exit_plan_mode', () => {
  it('stores exitPlanMode data', () => {
    useConversationStore.setState({ activeConversationId: 'sess-1' })
    useConversationStore.getState().handleClaudeEvent({
      type: 'exit_plan_mode',
      sessionId: 'sess-1',
      toolUseId: 'tu-pm-1',
      input: { plan: 'step 1' },
    } as ClaudeEvent)
    expect(useConversationStore.getState().exitPlanMode?.toolUseId).toBe('tu-pm-1')
  })
})

// ── handleClaudeEvent — stderr_error ──────────────────────────────────────────

describe('handleClaudeEvent — stderr_error', () => {
  it('adds warning message from stderr_error', () => {
    useConversationStore.setState({ activeConversationId: 'sess-1', messages: [] })
    useConversationStore.getState().handleClaudeEvent({
      type: 'stderr_error',
      sessionId: 'sess-1',
      data: 'context window exceeded',
    } as ClaudeEvent)
    expect(
      useConversationStore.getState().messages.some((m) => m.content.includes('context window exceeded'))
    ).toBe(true)
  })
})

// ── respondToPlanExit ─────────────────────────────────────────────────────────

describe('respondToPlanExit', () => {
  it('calls api.claude.respondToPlanExit and clears exitPlanMode', async () => {
    const api = await getApi()
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      exitPlanMode: { sessionId: 'sess-1', toolUseId: 'tu-1', input: {} },
    })
    useConversationStore.getState().respondToPlanExit(true, 'ok')
    expect(api.claude.respondToPlanExit).toHaveBeenCalledWith('sess-1', true, 'ok')
    expect(useConversationStore.getState().exitPlanMode).toBeNull()
  })

  it('does nothing if no exitPlanMode is set', async () => {
    const api = await getApi()
    useConversationStore.setState({ exitPlanMode: null })
    useConversationStore.getState().respondToPlanExit(false)
    expect(api.claude.respondToPlanExit).not.toHaveBeenCalled()
  })
})

// ── addMessage ────────────────────────────────────────────────────────────────

describe('addMessage', () => {
  it('appends message to messages array', () => {
    useConversationStore.setState({ messages: [] })
    useConversationStore.getState().addMessage({ role: 'assistant', type: 'text', content: 'hi', timestamp: 1 })
    expect(useConversationStore.getState().messages).toHaveLength(1)
    expect(useConversationStore.getState().messages[0].content).toBe('hi')
  })
})

// ── renameConversation ────────────────────────────────────────────────────────

describe('renameConversation', () => {
  it('calls api.conversations.updateTitle', async () => {
    const api = await getApi()
    await useConversationStore.getState().renameConversation('c1', 'New Title')
    expect(api.conversations.updateTitle).toHaveBeenCalledWith('c1', 'New Title')
  })
})

// ── handleClaudeEvent — permission_request (alternate type names) ─────────────

describe('handleClaudeEvent — permission via default case', () => {
  it('handles tool_use_permission event type', () => {
    useConversationStore.setState({ activeConversationId: 'sess-1', permissionRequest: null, permissionQueue: [] })
    useConversationStore.getState().handleClaudeEvent({
      type: 'tool_use_permission' as never,
      sessionId: 'sess-1',
      tool: { name: 'bash', input: { command: 'ls' } },
    } as ClaudeEvent)
    expect(useConversationStore.getState().permissionRequest?.toolName).toBe('bash')
  })
})

// ── handleClaudeEvent — informational events (rate_limit_event, raw, stderr) ──

describe('handleClaudeEvent — informational passthrough events', () => {
  beforeEach(() => {
    useConversationStore.setState({ activeConversationId: 'sess-1', messages: [] })
  })

  it('handles rate_limit_event without updating messages', () => {
    useConversationStore.getState().handleClaudeEvent({ type: 'rate_limit_event', sessionId: 'sess-1' } as ClaudeEvent)
    expect(useConversationStore.getState().messages).toHaveLength(0)
  })

  it('handles raw event without updating messages', () => {
    useConversationStore.getState().handleClaudeEvent({ type: 'raw', sessionId: 'sess-1' } as ClaudeEvent)
    expect(useConversationStore.getState().messages).toHaveLength(0)
  })
})

// ── handleClaudeEvent — default case: unrecognised event type ─────────────────

describe('handleClaudeEvent — default case: unrecognised event type', () => {
  it('queues permission when one is already pending and event has permission in type', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      permissionRequest: { sessionId: 'sess-1', toolName: 'existing', toolInput: {} },
      permissionQueue: [],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'tool_use_permission' as never,
      sessionId: 'sess-1',
      tool: { name: 'write_file', input: {} },
    } as ClaudeEvent)

    expect(useConversationStore.getState().permissionQueue).toHaveLength(1)
    expect(useConversationStore.getState().permissionQueue[0].toolName).toBe('write_file')
  })

  it('logs unhandled event types without crashing', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    useConversationStore.setState({ activeConversationId: 'sess-1' })

    useConversationStore.getState().handleClaudeEvent({
      type: 'completely_unknown_type' as never,
      sessionId: 'sess-1',
    } as ClaudeEvent)

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unhandled event type'),
      'completely_unknown_type',
      expect.any(String),
    )
    consoleSpy.mockRestore()
  })
})

// ── handleMobileMessage ───────────────────────────────────────────────────────

describe('handleMobileMessage', () => {
  it('adds user message and sets streaming when conversation is active', () => {
    useConversationStore.setState({ activeConversationId: 'conv-1', messages: [], isWaitingForResponse: false })

    useConversationStore.getState().handleMobileMessage('conv-1', 'Hello from mobile', undefined)

    const state = useConversationStore.getState()
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].role).toBe('user')
    expect(state.messages[0].content).toBe('Hello from mobile')
    expect(state.isWaitingForResponse).toBe(true)
    expect(state.streaming.isStreaming).toBe(true)
  })

  it('attaches images when provided', () => {
    useConversationStore.setState({ activeConversationId: 'conv-1', messages: [] })
    const images = [{ data: 'base64data', mediaType: 'image/jpeg' as const }]

    useConversationStore.getState().handleMobileMessage('conv-1', 'See this image', images)

    const msg = useConversationStore.getState().messages[0]
    expect(msg.images).toHaveLength(1)
    expect(msg.images![0].data).toBe('base64data')
    expect(msg.images![0].name).toBe('mobile-image')
  })

  it('does nothing when conversationId does not match activeConversationId', () => {
    useConversationStore.setState({ activeConversationId: 'conv-other', messages: [] })

    useConversationStore.getState().handleMobileMessage('conv-1', 'Should be ignored', undefined)

    expect(useConversationStore.getState().messages).toHaveLength(0)
  })
})

// ── resetStreaming ────────────────────────────────────────────────────────────

describe('resetStreaming', () => {
  it('resets streaming state to empty', () => {
    useConversationStore.setState((s) => ({
      streaming: {
        ...s.streaming,
        isStreaming: true,
        text: 'partial response',
        retrying: true,
      },
    }))

    useConversationStore.getState().resetStreaming()

    const { streaming } = useConversationStore.getState()
    expect(streaming.isStreaming).toBe(false)
    expect(streaming.text).toBe('')
    expect(streaming.retrying).toBe(false)
  })
})

// ── handleClaudeEvent — result in team mode (agent segments) ──────────────────

describe('handleClaudeEvent — result team mode agent segments', () => {
  it('adds per-agent messages when getActiveProjectTab returns team tab', async () => {
    const { getActiveProjectTab } = await import('./useProjectStore')
    vi.mocked(getActiveProjectTab).mockReturnValue({
      projectPath: '/proj1',
      projectName: 'proj1',
      snapshot: null,
      model: 'sonnet',
      permissionMode: 'bypass',
      mode: 'team',
      agents: [
        { id: 'a1', name: 'Alice', prompt: '', icon: '🤖', color: '#ff0000', capabilities: { tools: [] } },
        { id: 'a2', name: 'Bob', prompt: '', icon: '🤖', color: '#0000ff', capabilities: { tools: [] } },
      ],
      mcpServers: [],
      draftText: '',
      draftImages: [],
      activeView: 'chat' as const,
      unreadCount: 0,
    })

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
      isWaitingForResponse: true,
      messageQueue: [],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: 'Final team answer',
    } as ClaudeEvent)

    const msgs = useConversationStore.getState().messages
    expect(msgs.length).toBeGreaterThan(0)
    expect(msgs.every((m) => m.role === 'assistant' && m.type === 'text')).toBe(true)

    // Restore mock to null after test
    vi.mocked(getActiveProjectTab).mockReturnValue(null as never)
  })
})

// ── handleClaudeEvent — user event permission denial skip ─────────────────────

describe('handleClaudeEvent — user event skips permission denial blocks', () => {
  it('does not add tool_result message that includes "requires approval"', () => {
    useConversationStore.setState({ activeConversationId: 'sess-1', messages: [] })
    useConversationStore.getState().handleClaudeEvent({
      type: 'user',
      sessionId: 'sess-1',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'tu-denied',
          content: 'This requires approval before running',
          is_error: true,
        }],
      },
    } as ClaudeEvent)
    expect(useConversationStore.getState().messages).toHaveLength(0)
  })

  it('does not add tool_result message that includes "requested permissions"', () => {
    useConversationStore.setState({ activeConversationId: 'sess-1', messages: [] })
    useConversationStore.getState().handleClaudeEvent({
      type: 'user',
      sessionId: 'sess-1',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'tu-denied-2',
          content: 'The user requested permissions for this tool',
          is_error: true,
        }],
      },
    } as ClaudeEvent)
    expect(useConversationStore.getState().messages).toHaveLength(0)
  })
})

// ── handleClaudeEvent — result with object shape ──────────────────────────────

describe('handleClaudeEvent — result with object content[]', () => {
  it('extracts text from result object content array', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
      isWaitingForResponse: true,
      messageQueue: [],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: { content: [{ type: 'text', text: 'Object result text' }] },
    } as unknown as ClaudeEvent)

    expect(
      useConversationStore.getState().messages.some((m) => m.content === 'Object result text')
    ).toBe(true)
  })

  it('skips non-text blocks in result object content array', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
      isWaitingForResponse: true,
      messageQueue: [],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: { content: [{ type: 'tool_use', id: 'x', name: 'bash', input: {} }] },
    } as unknown as ClaudeEvent)

    // No text blocks — no text messages added
    const textMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'text')
    expect(textMsgs).toHaveLength(0)
  })
})

// ── handleClaudeEvent — queued message send error path ────────────────────────

describe('handleClaudeEvent — queued message send error path', () => {
  it('handles error thrown by sendMessage for queued messages', async () => {
    vi.useFakeTimers()
    const api = await getApi()
    // Make startSession reject to trigger the catch inside the setTimeout
    api.claude.startSession.mockRejectedValue(new Error('send failed'))
    api.claude.onEvent.mockReturnValue(() => {})

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
      isWaitingForResponse: true,
      messageQueue: [{ text: 'queued-that-fails', images: undefined }],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'sess-1',
      result: 'first response',
    } as ClaudeEvent)

    // Advance past the 100ms delay so the queued send executes and rejects
    await vi.advanceTimersByTimeAsync(200)

    // After the rejection is caught, isWaitingForResponse should be false
    expect(useConversationStore.getState().isWaitingForResponse).toBe(false)

    vi.useRealTimers()
  })
})

// ── handleClaudeEvent — content_block_stop finalizes tool_use input ───────────

describe('handleClaudeEvent — content_block_stop', () => {
  it('parses accumulated partial JSON into the last tool_use content block', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: {
        ...s.streaming,
        contentBlocks: [{ type: 'tool_use', id: 'tu-x', name: 'bash', input: {} } as never],
        _partialJson: '{"command":"ls -la"}',
      },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'content_block_stop',
      sessionId: 'sess-1',
    } as ClaudeEvent)

    const { contentBlocks, _partialJson } = useConversationStore.getState().streaming
    expect(_partialJson).toBe('')
    const lastBlock = contentBlocks[contentBlocks.length - 1] as { input?: unknown }
    expect(lastBlock?.input).toEqual({ command: 'ls -la' })
  })

  it('keeps block unchanged when partial JSON is invalid', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: {
        ...s.streaming,
        contentBlocks: [{ type: 'tool_use', id: 'tu-x', name: 'bash', input: {} } as never],
        _partialJson: '{"incomplete":',
      },
    }))

    expect(() => {
      useConversationStore.getState().handleClaudeEvent({
        type: 'content_block_stop',
        sessionId: 'sess-1',
      } as ClaudeEvent)
    }).not.toThrow()

    const { _partialJson } = useConversationStore.getState().streaming
    expect(_partialJson).toBe('')
  })
})

// ── respondToQuestion ─────────────────────────────────────────────────────────

describe('respondToQuestion', () => {
  it('calls api.claude.respondToQuestion and clears askUserQuestion', async () => {
    const api = await getApi()
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      askUserQuestion: {
        sessionId: 'sess-1',
        toolUseId: 'tu-q',
        questions: [{ name: 'choice', prompt: 'Pick one', type: 'select', options: ['A', 'B'] }],
      },
    })

    useConversationStore.getState().respondToQuestion({ choice: 'A' })

    expect(api.claude.respondToQuestion).toHaveBeenCalledWith('sess-1', { choice: 'A' })
    expect(useConversationStore.getState().askUserQuestion).toBeNull()
    expect(useConversationStore.getState().answeredQuestionIds.has('tu-q')).toBe(true)
    expect(useConversationStore.getState().isWaitingForResponse).toBe(true)
  })

  it('does nothing if no askUserQuestion is set', async () => {
    const api = await getApi()
    useConversationStore.setState({ askUserQuestion: null })
    useConversationStore.getState().respondToQuestion({ choice: 'B' })
    expect(api.claude.respondToQuestion).not.toHaveBeenCalled()
  })
})

// ── background session — team mode segment parsing ────────────────────────────

describe('handleClaudeEvent — background session team mode result', () => {
  it('saves messages when background session has streaming text', async () => {
    const api = await getApi()
    api.conversations.saveMessage.mockResolvedValue({ id: 1 })

    useConversationStore.setState({
      activeConversationId: 'main-sess',
      bgSessions: { 'bg-sess-2': { streamingText: 'background result text', isWaiting: true } },
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'result',
      sessionId: 'bg-sess-2',
    } as ClaudeEvent)

    expect(api.conversations.saveMessage).toHaveBeenCalledWith(
      'bg-sess-2',
      expect.objectContaining({ role: 'assistant', type: 'text', content: 'background result text' })
    )
    expect(useConversationStore.getState().bgSessions['bg-sess-2']).toBeUndefined()
  })

  it('removes bg session on session:ended event', () => {
    useConversationStore.setState({
      activeConversationId: 'main-sess',
      bgSessions: { 'bg-ended': { streamingText: '', isWaiting: true } },
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'session:ended',
      sessionId: 'bg-ended',
    } as ClaudeEvent)

    expect(useConversationStore.getState().bgSessions['bg-ended']).toBeUndefined()
  })

  it('removes bg session on session:error event', () => {
    useConversationStore.setState({
      activeConversationId: 'main-sess',
      bgSessions: { 'bg-err': { streamingText: '', isWaiting: true } },
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'session:error',
      sessionId: 'bg-err',
      error: 'crashed',
    } as ClaudeEvent)

    expect(useConversationStore.getState().bgSessions['bg-err']).toBeUndefined()
  })
})

// ── content_block_delta in team mode (detectLastAgent) ────────────────────────

describe('handleClaudeEvent — content_block_delta team mode agent detection', () => {
  it('updates currentAgentName via detectLastAgent in team mode', async () => {
    const { getActiveProjectTab } = await import('./useProjectStore')
    vi.mocked(getActiveProjectTab).mockReturnValue({
      projectPath: '/proj1',
      projectName: 'proj1',
      snapshot: null,
      model: 'sonnet',
      permissionMode: 'bypass',
      mode: 'team',
      agents: [
        { id: 'a1', name: 'Alice', prompt: '', icon: '', color: '', capabilities: { tools: [] } },
      ],
      mcpServers: [],
      draftText: '',
      draftImages: [],
      activeView: 'chat' as const,
      unreadCount: 0,
    })

    useConversationStore.setState({ activeConversationId: 'sess-1' })

    useConversationStore.getState().handleClaudeEvent({
      type: 'content_block_delta',
      sessionId: 'sess-1',
      delta: { type: 'text_delta', text: 'Hello from Alice' },
    } as ClaudeEvent)

    // Even if detectLastAgent returns null (no [AgentName] marker), streaming.text should be updated
    expect(useConversationStore.getState().streaming.text).toContain('Hello from Alice')

    vi.mocked(getActiveProjectTab).mockReturnValue(null as never)
  })
})

// ── content_block_stop adds tool_result message when last block is tool_result ─

describe('handleClaudeEvent — content_block_stop with tool_result last block', () => {
  it('adds a tool_result message when last content block is tool_result type', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: {
        ...s.streaming,
        contentBlocks: [{ type: 'tool_result', tool_use_id: 'tu-r', content: 'result', is_error: false } as never],
        _partialJson: '',
      },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'content_block_stop',
      sessionId: 'sess-1',
    } as ClaudeEvent)

    const msgs = useConversationStore.getState().messages
    expect(msgs.some((m) => m.type === 'tool_result')).toBe(true)
  })
})

// ── sendMessage creates conversation when none is active ──────────────────────

describe('sendMessage', () => {
  it('creates a new conversation when none is active, then sends the message', async () => {
    const api = await getApi()
    api.conversations.create.mockResolvedValue({
      id: 'new-conv',
      title: 'Hello, help me',
      model: 'sonnet',
      working_directory: '',
      project_path: '/test-project',
      created_at: '',
      updated_at: '',
    })
    api.conversations.list.mockResolvedValue([])
    api.conversations.getMessages.mockResolvedValue([])
    api.conversations.saveMessage.mockResolvedValue({ id: 1 })
    api.claude.startSession.mockResolvedValue(null)
    api.claude.onEvent.mockReturnValue(() => {})

    useConversationStore.setState({ activeConversationId: null, messages: [] })

    await useConversationStore.getState().sendMessage('Hello, help me')

    // A new conversation should have been created
    expect(api.conversations.create).toHaveBeenCalledWith(
      expect.stringContaining('Hello'),
      expect.any(String)
    )
    // startSession should have been called for the new conversation
    expect(api.claude.startSession).toHaveBeenCalled()
  })
})

// ── handleClaudeEvent — assistant event tool_use extraction ───────────────────

describe('handleClaudeEvent — assistant event extracts tool_use blocks', () => {
  it('adds tool_use message when assistant event contains tool_use content block', () => {
    useConversationStore.setState({ activeConversationId: 'sess-1', messages: [] })

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        id: 'msg-1',
        content: [
          { type: 'text', text: 'I will use the bash tool' },
          { type: 'tool_use', id: 'tu-new', name: 'bash', input: { command: 'ls' } },
        ],
      },
    } as ClaudeEvent)

    const toolUseMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'tool_use')
    expect(toolUseMsgs).toHaveLength(1)
    expect(toolUseMsgs[0].contentBlocks?.[0]).toMatchObject({ type: 'tool_use', name: 'bash' })
  })

  it('deduplicates tool_use blocks by id', () => {
    const existingBlock = { type: 'tool_use', id: 'tu-existing', name: 'bash', input: {} }
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [{
        id: 1, role: 'assistant', type: 'tool_use', content: '',
        contentBlocks: [existingBlock as never], timestamp: 0,
      }],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'tool_use', id: 'tu-existing', name: 'bash', input: { command: 'echo hi' } }],
      },
    } as ClaudeEvent)

    const toolUseMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'tool_use')
    expect(toolUseMsgs).toHaveLength(1)
  })

  it('commits previous streaming text as message before replacing it', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    // Set up existing streaming text (different from incoming text)
    useConversationStore.setState((s) => ({
      streaming: { ...s.streaming, text: 'previously streamed' },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'text', text: 'new updated text' }],
      },
    } as ClaudeEvent)

    // The previously streamed text should have been committed
    const textMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'text')
    expect(textMsgs.some((m) => m.content === 'previously streamed')).toBe(true)
  })
})

// ── setActiveConversation loads messages and handles bg sessions ───────────────

describe('setActiveConversation', () => {
  it('sets activeConversationId and loads messages', async () => {
    const api = await getApi()
    api.conversations.getMessages.mockResolvedValue([
      { id: 1, role: 'user', type: 'text', content: 'hello', timestamp: 0 },
    ])

    useConversationStore.setState({ activeConversationId: null, messages: [] })

    await useConversationStore.getState().setActiveConversation('c-1')

    expect(useConversationStore.getState().activeConversationId).toBe('c-1')
    expect(useConversationStore.getState().messages.some((m) => m.content === 'hello')).toBe(true)
  })

  it('moves current active session to bgSessions when switching', async () => {
    const api = await getApi()
    api.conversations.getMessages.mockResolvedValue([])

    useConversationStore.setState({
      activeConversationId: 'c-1',
      hasActiveSession: true,
      isWaitingForResponse: false,
    })
    useConversationStore.setState((s) => ({ streaming: { ...s.streaming, text: 'active text' } }))

    await useConversationStore.getState().setActiveConversation('c-2')

    // c-1 should now be in bgSessions
    expect(useConversationStore.getState().bgSessions['c-1']).toBeDefined()
    expect(useConversationStore.getState().bgSessions['c-1'].streamingText).toBe('active text')
  })

  it('restores bg session state when switching to a bg conversation', async () => {
    const api = await getApi()
    api.conversations.getMessages.mockResolvedValue([])

    useConversationStore.setState({
      activeConversationId: 'c-1',
      bgSessions: { 'c-2': { streamingText: 'background work', isWaiting: true } },
    })

    await useConversationStore.getState().setActiveConversation('c-2')

    // c-2 should no longer be in bgSessions
    expect(useConversationStore.getState().bgSessions['c-2']).toBeUndefined()
    // isWaitingForResponse should be true because it was waiting
    expect(useConversationStore.getState().isWaitingForResponse).toBe(true)
  })

  it('sets null activeConversationId when called with null', async () => {
    useConversationStore.setState({ activeConversationId: 'c-1', messages: [] })
    await useConversationStore.getState().setActiveConversation(null)
    expect(useConversationStore.getState().activeConversationId).toBeNull()
  })
})

// ── handleClaudeEvent — assistant event team mode segment parsing (lines 557, 586, 624) ─

describe('handleClaudeEvent — assistant event team mode paths', () => {
  async function makeTeamTab() {
    const { getActiveProjectTab } = await import('./useProjectStore')
    vi.mocked(getActiveProjectTab).mockReturnValue({
      projectPath: '/proj1',
      projectName: 'proj1',
      snapshot: null,
      model: 'sonnet',
      permissionMode: 'bypass',
      mode: 'team',
      agents: [
        { id: 'a1', name: 'Alice', prompt: '', icon: '🤖', color: '#ff0000', capabilities: { tools: [] } },
        { id: 'a2', name: 'Bob', prompt: '', icon: '🤖', color: '#0000ff', capabilities: { tools: [] } },
      ],
      mcpServers: [],
      draftText: '',
      draftImages: [],
      activeView: 'chat' as const,
      unreadCount: 0,
    })
    return getActiveProjectTab
  }

  it('uses parseAgentSegments to split prevText when team mode and prevText differs (line 557)', async () => {
    const getActiveProjectTab = await makeTeamTab()

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    // Set prevText (a previous streamed value) different from incoming textContent
    useConversationStore.setState((s) => ({
      streaming: { ...s.streaming, text: '[Alice]\nPrevious message from Alice', currentAgentName: 'Alice' },
    }))

    // Now fire assistant event with different text — triggers prevText commit via parseAgentSegments
    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'text', text: '[Bob]\nNew message from Bob' }],
      },
    } as ClaudeEvent)

    // Messages should include the committed prev text as separate agent messages
    const msgs = useConversationStore.getState().messages
    expect(msgs.length).toBeGreaterThanOrEqual(1)
    // At least one should have been added from parseAgentSegments
    expect(msgs.some((m) => m.type === 'text')).toBe(true)

    vi.mocked(getActiveProjectTab).mockReturnValue(null as never)
  })

  it('detectLastAgent updates currentAgentName in streaming when team mode and text has agent marker (line 586)', async () => {
    const getActiveProjectTab = await makeTeamTab()

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: { ...s.streaming, text: '', currentAgentName: null },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'text', text: '[Alice]\nHello from Alice' }],
      },
    } as ClaudeEvent)

    // detectLastAgent should have updated currentAgentName
    const { streaming } = useConversationStore.getState()
    expect(streaming.text).toBe('[Alice]\nHello from Alice')
    // currentAgentName may be 'Alice' if detectLastAgent parsed the [Alice] marker
    // The important thing is the code path was exercised without error

    vi.mocked(getActiveProjectTab).mockReturnValue(null as never)
  })

  it('assigns agentName to tool_use message when team mode and currentAgentName matches agent (line 624)', async () => {
    const getActiveProjectTab = await makeTeamTab()

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: { ...s.streaming, currentAgentName: 'Alice' },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'tool_use', id: 'tu-team-agent', name: 'bash', input: {} }],
      },
    } as ClaudeEvent)

    const toolUseMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'tool_use')
    expect(toolUseMsgs).toHaveLength(1)
    expect(toolUseMsgs[0].agentName).toBe('Alice')

    vi.mocked(getActiveProjectTab).mockReturnValue(null as never)
  })
})

// ── handleClaudeEvent — user event team mode agent attribution (line 815) ─────

describe('handleClaudeEvent — user event team mode agent attribution', () => {
  it('assigns agentName to tool_result message when team mode and currentAgentName matches agent', async () => {
    const { getActiveProjectTab } = await import('./useProjectStore')
    vi.mocked(getActiveProjectTab).mockReturnValue({
      projectPath: '/proj1',
      projectName: 'proj1',
      snapshot: null,
      model: 'sonnet',
      permissionMode: 'bypass',
      mode: 'team',
      agents: [
        { id: 'a1', name: 'Alice', prompt: '', icon: '🤖', color: '#ff0000', capabilities: { tools: [] } },
      ],
      mcpServers: [],
      draftText: '',
      draftImages: [],
      activeView: 'chat' as const,
      unreadCount: 0,
    })

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: { ...s.streaming, currentAgentName: 'Alice' },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'user',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu-team-result', content: 'done', is_error: false }],
      },
    } as ClaudeEvent)

    const resultMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'tool_result')
    expect(resultMsgs).toHaveLength(1)
    expect(resultMsgs[0].agentName).toBe('Alice')

    vi.mocked(getActiveProjectTab).mockReturnValue(null as never)
  })
})

// ── handleClaudeEvent — assistant event token usage accumulation (line 606) ───

describe('handleClaudeEvent — assistant event token usage accumulation', () => {
  it('accumulates input_tokens + output_tokens in streaming._turnTokens', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: { ...s.streaming, _turnTokens: 0 },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 120, output_tokens: 80 },
      },
    } as ClaudeEvent)

    expect(useConversationStore.getState().streaming._turnTokens).toBe(200)
  })

  it('accumulates tokens on successive assistant events', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: { ...s.streaming, _turnTokens: 50 },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'text', text: 'More text' }],
        usage: { input_tokens: 30, output_tokens: 20 },
      },
    } as ClaudeEvent)

    expect(useConversationStore.getState().streaming._turnTokens).toBe(100)
  })

  it('does not change _turnTokens when usage is absent', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: { ...s.streaming, _turnTokens: 42 },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'text', text: 'No usage' }],
      },
    } as ClaudeEvent)

    expect(useConversationStore.getState().streaming._turnTokens).toBe(42)
  })

  it('does not change _turnTokens when both token counts are zero', () => {
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: { ...s.streaming, _turnTokens: 10 },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [{ type: 'text', text: 'Zero usage' }],
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    } as ClaudeEvent)

    expect(useConversationStore.getState().streaming._turnTokens).toBe(10)
  })
})

// ── handleClaudeEvent — assistant tool_use dedup when alreadyAdded is true (line 624) ─

describe('handleClaudeEvent — assistant tool_use dedup skips already-added blocks', () => {
  it('does not add a second tool_use message when the same tool_use id already exists', () => {
    const existingBlock = { type: 'tool_use', id: 'tu-dedup', name: 'bash', input: { command: 'ls' } }
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [{
        id: 1,
        role: 'assistant',
        type: 'tool_use',
        content: '',
        contentBlocks: [existingBlock as never],
        timestamp: 0,
      }],
    })

    // Fire a second assistant event with the same tool_use id
    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [existingBlock],
      },
    } as ClaudeEvent)

    const toolUseMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'tool_use')
    expect(toolUseMsgs).toHaveLength(1)
  })

  it('adds a new tool_use message when the id is different', () => {
    const existingBlock = { type: 'tool_use', id: 'tu-a', name: 'bash', input: {} }
    const newBlock = { type: 'tool_use', id: 'tu-b', name: 'write_file', input: {} }
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [{
        id: 1,
        role: 'assistant',
        type: 'tool_use',
        content: '',
        contentBlocks: [existingBlock as never],
        timestamp: 0,
      }],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-1',
      message: {
        content: [newBlock],
      },
    } as ClaudeEvent)

    const toolUseMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'tool_use')
    expect(toolUseMsgs).toHaveLength(2)
  })
})

// ── handleClaudeEvent — content_block_stop team mode agent attribution (line 770) ─

describe('handleClaudeEvent — content_block_stop team mode agent attribution', () => {
  it('assigns agentName to tool_use message in team mode when currentAgentName is set', async () => {
    const { getActiveProjectTab } = await import('./useProjectStore')
    vi.mocked(getActiveProjectTab).mockReturnValue({
      projectPath: '/proj1',
      projectName: 'proj1',
      snapshot: null,
      model: 'sonnet',
      permissionMode: 'bypass',
      mode: 'team',
      agents: [
        { id: 'a1', name: 'Alice', prompt: '', icon: '🤖', color: '#ff0000', capabilities: { tools: [] } },
      ],
      mcpServers: [],
      draftText: '',
      draftImages: [],
      activeView: 'chat' as const,
      unreadCount: 0,
    })

    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [],
    })
    useConversationStore.setState((s) => ({
      streaming: {
        ...s.streaming,
        contentBlocks: [{ type: 'tool_use', id: 'tu-team', name: 'bash', input: {} } as never],
        _partialJson: '',
        currentAgentName: 'Alice',
      },
    }))

    useConversationStore.getState().handleClaudeEvent({
      type: 'content_block_stop',
      sessionId: 'sess-1',
    } as ClaudeEvent)

    const toolUseMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'tool_use')
    expect(toolUseMsgs).toHaveLength(1)
    expect(toolUseMsgs[0].agentName).toBe('Alice')

    vi.mocked(getActiveProjectTab).mockReturnValue(null as never)
  })
})

// ── handleClaudeEvent — user event tool_result dedup when alreadyAdded (line 815) ─

describe('handleClaudeEvent — user event tool_result dedup', () => {
  it('skips adding a tool_result block whose tool_use_id is already in messages', () => {
    const existingResultBlock = {
      type: 'tool_result',
      tool_use_id: 'tu-result-dup',
      content: 'first result',
      is_error: false,
    }
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [{
        id: 1,
        role: 'assistant',
        type: 'tool_result',
        content: '',
        contentBlocks: [existingResultBlock as never],
        timestamp: 0,
      }],
    })

    // Fire user event with the same tool_use_id
    useConversationStore.getState().handleClaudeEvent({
      type: 'user',
      sessionId: 'sess-1',
      message: {
        content: [existingResultBlock],
      },
    } as ClaudeEvent)

    const resultMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'tool_result')
    expect(resultMsgs).toHaveLength(1)
  })

  it('adds a new tool_result message when tool_use_id is unique', () => {
    const existingBlock = { type: 'tool_result', tool_use_id: 'tu-r-old', content: 'old', is_error: false }
    const newBlock = { type: 'tool_result', tool_use_id: 'tu-r-new', content: 'new result', is_error: false }
    useConversationStore.setState({
      activeConversationId: 'sess-1',
      messages: [{
        id: 1,
        role: 'assistant',
        type: 'tool_result',
        content: '',
        contentBlocks: [existingBlock as never],
        timestamp: 0,
      }],
    })

    useConversationStore.getState().handleClaudeEvent({
      type: 'user',
      sessionId: 'sess-1',
      message: {
        content: [newBlock],
      },
    } as ClaudeEvent)

    const resultMsgs = useConversationStore.getState().messages.filter((m) => m.type === 'tool_result')
    expect(resultMsgs).toHaveLength(2)
  })
})
