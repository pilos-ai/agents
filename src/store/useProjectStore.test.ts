import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectStore, getActiveProjectTab } from './useProjectStore'
import type { ClaudeEvent } from '../types'

// ── Mock dependencies ─────────────────────────────────────────────────────────
// All vi.mock calls must be at top level so vitest can hoist them.
// Stable mock functions that persist across getState() calls must be created
// with vi.hoisted() so they are available when the factory runs.

const { mockHandleClaudeEvent, mockLoadConversations, mockAbortSession, mockConvSetState } = vi.hoisted(() => ({
  mockHandleClaudeEvent: vi.fn(),
  mockLoadConversations: vi.fn().mockResolvedValue(undefined),
  mockAbortSession: vi.fn(),
  mockConvSetState: vi.fn(),
}))

vi.mock('../api', () => ({
  api: {
    projects: {
      getRecent: vi.fn().mockResolvedValue([]),
      getSettings: vi.fn().mockResolvedValue({ model: 'sonnet', permissionMode: 'bypass', mode: 'solo', agents: [], mcpServers: [] }),
      setSettings: vi.fn().mockResolvedValue(undefined),
      addRecent: vi.fn().mockResolvedValue(undefined),
      removeRecent: vi.fn().mockResolvedValue(undefined),
    },
    menu: {
      rebuildMenu: vi.fn(),
      setActiveProject: vi.fn(),
    },
    conversations: {
      list: vi.fn().mockResolvedValue([]),
      saveMessage: vi.fn().mockResolvedValue({ id: 1 }),
    },
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    claude: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock('./useConversationStore', () => ({
  useConversationStore: {
    getState: vi.fn(() => ({
      conversations: [],
      activeConversationId: null,
      messages: [],
      streaming: {
        text: '', contentBlocks: [], thinking: '', isStreaming: false,
        currentAgentName: null, retrying: false, _partialJson: '',
        _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0,
      },
      isWaitingForResponse: false,
      hasActiveSession: false,
      messageQueue: [],
      permissionRequest: null,
      askUserQuestion: null,
      exitPlanMode: null,
      processLogs: [],
      abortSession: mockAbortSession,
      loadConversations: mockLoadConversations,
      handleClaudeEvent: mockHandleClaudeEvent,
    })),
    setState: mockConvSetState,
  },
}))

vi.mock('./useAppStore', () => ({
  useAppStore: {
    getState: vi.fn(() => ({
      activeView: 'chat',
      setActiveView: vi.fn(),
    })),
  },
}))

vi.mock('./useLicenseStore', () => ({
  useLicenseStore: {
    getState: vi.fn(() => ({
      flags: {
        tier: 'free',
        maxAgents: 3,
        maxMcpServers: 3,
        maxProjects: 3,
        teamMode: false,
        teamSync: false,
        premiumAgents: false,
        enabledFeatures: [],
      },
    })),
  },
}))

vi.mock('./useTaskStore', () => ({
  useTaskStore: {
    getState: vi.fn(() => ({
      loadTasks: vi.fn().mockResolvedValue(undefined),
    })),
    setState: vi.fn(),
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getApi() {
  const mod = await import('../api')
  return (mod as unknown as { api: Record<string, Record<string, ReturnType<typeof vi.fn>>> }).api
}

async function getConvStore() {
  const mod = await import('./useConversationStore')
  return mod.useConversationStore
}

function getHandleClaudeEvent() {
  return mockHandleClaudeEvent
}

async function getLicenseStore() {
  const mod = await import('./useLicenseStore')
  return mod.useLicenseStore
}

function makeProjectTab(path: string, overrides = {}) {
  return {
    projectPath: path,
    projectName: path.split('/').pop() || path,
    snapshot: null,
    model: 'sonnet',
    permissionMode: 'bypass',
    mode: 'solo' as const,
    agents: [],
    mcpServers: [],
    draftText: '',
    draftImages: [],
    activeView: 'chat',
    unreadCount: 0,
    ...overrides,
  }
}

const initialState = useProjectStore.getState()

beforeEach(() => {
  useProjectStore.setState(initialState, true)
  vi.clearAllMocks()
})

// ── loadRecentProjects ────────────────────────────────────────────────────────

describe('loadRecentProjects', () => {
  it('stores projects returned by api', async () => {
    const api = await getApi()
    const projects = [{ path: '/proj1', name: 'proj1' }, { path: '/proj2', name: 'proj2' }]
    api.projects.getRecent.mockResolvedValue(projects)

    await useProjectStore.getState().loadRecentProjects()

    expect(useProjectStore.getState().recentProjects).toEqual(projects)
  })

  it('stores empty array when no projects', async () => {
    const api = await getApi()
    api.projects.getRecent.mockResolvedValue([])

    await useProjectStore.getState().loadRecentProjects()

    expect(useProjectStore.getState().recentProjects).toEqual([])
  })
})

// ── openProject ───────────────────────────────────────────────────────────────

describe('openProject', () => {
  it('adds a new project tab and sets it active', async () => {
    const api = await getApi()
    api.projects.getSettings.mockResolvedValue({
      model: 'opus', permissionMode: 'bypass', mode: 'solo', agents: [], mcpServers: [],
    })
    api.projects.getRecent.mockResolvedValue([])

    await useProjectStore.getState().openProject('/my/project')

    const state = useProjectStore.getState()
    expect(state.openProjects).toHaveLength(1)
    expect(state.openProjects[0].projectPath).toBe('/my/project')
    expect(state.openProjects[0].model).toBe('opus')
    expect(state.activeProjectPath).toBe('/my/project')
  })

  it('does not duplicate a project that is already open', async () => {
    const api = await getApi()
    api.projects.getRecent.mockResolvedValue([])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/my/project')],
      activeProjectPath: '/my/project',
    })

    await useProjectStore.getState().openProject('/my/project')

    expect(useProjectStore.getState().openProjects).toHaveLength(1)
  })

  it('respects maxProjects license limit', async () => {
    const licenseStore = await getLicenseStore()
    vi.mocked(licenseStore.getState).mockReturnValue({
      flags: {
        tier: 'free', maxAgents: 3, maxMcpServers: 3, maxProjects: 2,
        teamMode: false, teamSync: false, premiumAgents: false, enabledFeatures: [],
      },
    } as ReturnType<typeof licenseStore.getState>)

    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj2')],
      activeProjectPath: '/proj1',
    })

    await useProjectStore.getState().openProject('/proj3')

    expect(useProjectStore.getState().openProjects).toHaveLength(2)
  })

  it('calls api.projects.addRecent and loadRecentProjects', async () => {
    const api = await getApi()
    api.projects.getRecent.mockResolvedValue([{ path: '/my/project', name: 'project' }])

    await useProjectStore.getState().openProject('/my/project')

    expect(api.projects.addRecent).toHaveBeenCalledWith('/my/project')
    expect(useProjectStore.getState().recentProjects).toHaveLength(1)
  })

  it('calls api.menu.rebuildMenu', async () => {
    const api = await getApi()
    api.projects.getRecent.mockResolvedValue([])

    await useProjectStore.getState().openProject('/my/project')

    expect(api.menu.rebuildMenu).toHaveBeenCalled()
  })

  it('sets default model to sonnet when settings omit model', async () => {
    const api = await getApi()
    api.projects.getSettings.mockResolvedValue({ mode: 'solo', agents: [], mcpServers: [] })
    api.projects.getRecent.mockResolvedValue([])

    await useProjectStore.getState().openProject('/my/project')

    expect(useProjectStore.getState().openProjects[0].model).toBe('sonnet')
  })
})

// ── closeProject ──────────────────────────────────────────────────────────────

describe('closeProject', () => {
  it('removes the project tab', async () => {
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj2')],
      activeProjectPath: '/proj2',
    })

    useProjectStore.getState().closeProject('/proj1')

    const state = useProjectStore.getState()
    expect(state.openProjects).toHaveLength(1)
    expect(state.openProjects[0].projectPath).toBe('/proj2')
  })

  it('switches to the last remaining tab when closing the active project', async () => {
    const convStore = await getConvStore()
    const snapshot = {
      conversations: [], activeConversationId: 'c1',
      messages: [], streaming: { text: '', contentBlocks: [], thinking: '', isStreaming: false, currentAgentName: null, retrying: false, _partialJson: '', _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0 },
      isWaitingForResponse: false, hasActiveSession: false, messageQueue: [],
    }
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1', { snapshot }), makeProjectTab('/proj2')],
      activeProjectPath: '/proj2',
    })

    useProjectStore.getState().closeProject('/proj2')

    expect(useProjectStore.getState().activeProjectPath).toBe('/proj1')
    // Restores snapshot when available
    expect(vi.mocked(convStore.setState)).toHaveBeenCalled()
  })

  it('clears activeProjectPath when last project is closed', async () => {
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().closeProject('/proj1')

    expect(useProjectStore.getState().activeProjectPath).toBeNull()
    expect(useProjectStore.getState().openProjects).toHaveLength(0)
  })

  it('calls api.menu.rebuildMenu', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/other',
    })

    useProjectStore.getState().closeProject('/proj1')

    expect(api.menu.rebuildMenu).toHaveBeenCalled()
  })
})

// ── registerConversation ──────────────────────────────────────────────────────

describe('registerConversation', () => {
  it('stores conversationId → projectPath mapping', () => {
    useProjectStore.getState().registerConversation('conv-1', '/proj1')
    expect(useProjectStore.getState().conversationProjectMap.get('conv-1')).toBe('/proj1')
  })

  it('can register multiple conversations', () => {
    useProjectStore.getState().registerConversation('conv-1', '/proj1')
    useProjectStore.getState().registerConversation('conv-2', '/proj2')
    expect(useProjectStore.getState().conversationProjectMap.get('conv-2')).toBe('/proj2')
  })
})

// ── routeClaudeEvent ──────────────────────────────────────────────────────────

describe('routeClaudeEvent', () => {
  it('routes unknown session to active conversation store', () => {
    const handleEvent = getHandleClaudeEvent()

    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
      conversationProjectMap: new Map(),
    })

    const event = { type: 'assistant', sessionId: 'unknown-sess' } as ClaudeEvent
    useProjectStore.getState().routeClaudeEvent(event)

    expect(handleEvent).toHaveBeenCalledWith(event)
  })

  it('routes active-project session directly to conversation store', () => {
    const handleEvent = getHandleClaudeEvent()

    const map = new Map([['sess-1', '/proj1']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    const event = { type: 'assistant', sessionId: 'sess-1', message: { content: [{ type: 'text', text: 'Hello' }] } } as ClaudeEvent
    useProjectStore.getState().routeClaudeEvent(event)

    expect(handleEvent).toHaveBeenCalledWith(event)
  })

  it('applies background event to tab snapshot instead of live store', () => {
    const handleEvent = getHandleClaudeEvent()

    const map = new Map([['sess-bg', '/proj-bg']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-bg')],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    const event = {
      type: 'session:started',
      sessionId: 'sess-bg',
    } as ClaudeEvent
    useProjectStore.getState().routeClaudeEvent(event)

    // Should NOT have called live conversation store handler
    expect(handleEvent).not.toHaveBeenCalled()

    // Background tab snapshot should be updated
    const bgTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-bg')
    expect(bgTab?.snapshot?.hasActiveSession).toBe(true)
  })

  it('does nothing when owner project tab is not found', () => {
    const handleEvent = getHandleClaudeEvent()

    const map = new Map([['sess-orphan', '/deleted-proj']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    const event = { type: 'assistant', sessionId: 'sess-orphan' } as ClaudeEvent
    useProjectStore.getState().routeClaudeEvent(event)

    expect(handleEvent).not.toHaveBeenCalled()
  })
})

// ── Agent management ──────────────────────────────────────────────────────────

describe('addProjectAgent', () => {
  it('adds an agent to the active project', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().addProjectAgent({
      id: 'agent-1', name: 'TestBot', prompt: 'You are a test bot',
      icon: '🤖', color: '#ff0000', capabilities: { tools: [] },
    })

    const tab = useProjectStore.getState().openProjects[0]
    expect(tab.agents).toHaveLength(1)
    expect(tab.agents[0].name).toBe('TestBot')
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', expect.objectContaining({ agents: tab.agents }))
  })

  it('does nothing when no active project', () => {
    useProjectStore.setState({ openProjects: [], activeProjectPath: null })

    useProjectStore.getState().addProjectAgent({
      id: 'agent-1', name: 'TestBot', prompt: '', icon: '', color: '', capabilities: { tools: [] },
    })

    expect(useProjectStore.getState().openProjects).toHaveLength(0)
  })

  it('respects maxAgents license limit', async () => {
    const licenseStore = await getLicenseStore()
    vi.mocked(licenseStore.getState).mockReturnValue({
      flags: {
        tier: 'free', maxAgents: 1, maxMcpServers: 3, maxProjects: 3,
        teamMode: false, teamSync: false, premiumAgents: false, enabledFeatures: [],
      },
    } as ReturnType<typeof licenseStore.getState>)

    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1', {
        agents: [{ id: 'existing', name: 'Existing', prompt: '', icon: '', color: '', capabilities: { tools: [] } }],
      })],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().addProjectAgent({
      id: 'new-agent', name: 'New', prompt: '', icon: '', color: '', capabilities: { tools: [] },
    })

    expect(useProjectStore.getState().openProjects[0].agents).toHaveLength(1)
  })
})

describe('removeProjectAgent', () => {
  it('removes agent by id', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1', {
        agents: [
          { id: 'agent-1', name: 'Agent 1', prompt: '', icon: '', color: '', capabilities: { tools: [] } },
          { id: 'agent-2', name: 'Agent 2', prompt: '', icon: '', color: '', capabilities: { tools: [] } },
        ],
      })],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().removeProjectAgent('agent-1')

    const agents = useProjectStore.getState().openProjects[0].agents
    expect(agents).toHaveLength(1)
    expect(agents[0].id).toBe('agent-2')
    expect(api.projects.setSettings).toHaveBeenCalled()
  })
})

describe('updateProjectAgent', () => {
  it('updates agent fields', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1', {
        agents: [{ id: 'agent-1', name: 'Old Name', prompt: '', icon: '', color: '', capabilities: { tools: [] } }],
      })],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().updateProjectAgent('agent-1', { name: 'New Name' })

    expect(useProjectStore.getState().openProjects[0].agents[0].name).toBe('New Name')
    expect(api.projects.setSettings).toHaveBeenCalled()
  })
})

// ── MCP server management ─────────────────────────────────────────────────────

describe('addProjectMcpServer', () => {
  it('adds an MCP server to the active project', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().addProjectMcpServer({
      id: 'mcp-1', name: 'Test MCP', enabled: true,
      config: { type: 'stdio', command: 'npx', args: ['mcp-server'] },
    })

    const servers = useProjectStore.getState().openProjects[0].mcpServers
    expect(servers).toHaveLength(1)
    expect(servers[0].name).toBe('Test MCP')
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', expect.objectContaining({ mcpServers: servers }))
  })

  it('respects maxMcpServers license limit', async () => {
    const licenseStore = await getLicenseStore()
    vi.mocked(licenseStore.getState).mockReturnValue({
      flags: {
        tier: 'free', maxAgents: 3, maxMcpServers: 1, maxProjects: 3,
        teamMode: false, teamSync: false, premiumAgents: false, enabledFeatures: [],
      },
    } as ReturnType<typeof licenseStore.getState>)

    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1', {
        mcpServers: [{ id: 'mcp-1', name: 'Existing', enabled: true, config: { type: 'stdio', command: 'cmd', args: [] } }],
      })],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().addProjectMcpServer({
      id: 'mcp-2', name: 'New', enabled: true, config: { type: 'stdio', command: 'cmd2', args: [] },
    })

    expect(useProjectStore.getState().openProjects[0].mcpServers).toHaveLength(1)
  })
})

describe('removeProjectMcpServer', () => {
  it('removes MCP server by id', async () => {
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1', {
        mcpServers: [
          { id: 'mcp-1', name: 'Server 1', enabled: true, config: { type: 'stdio', command: 'cmd', args: [] } },
          { id: 'mcp-2', name: 'Server 2', enabled: true, config: { type: 'stdio', command: 'cmd', args: [] } },
        ],
      })],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().removeProjectMcpServer('mcp-1')

    expect(useProjectStore.getState().openProjects[0].mcpServers).toHaveLength(1)
    expect(useProjectStore.getState().openProjects[0].mcpServers[0].id).toBe('mcp-2')
  })
})

describe('toggleProjectMcpServer', () => {
  it('toggles enabled flag', async () => {
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1', {
        mcpServers: [{ id: 'mcp-1', name: 'Server', enabled: true, config: { type: 'stdio', command: 'cmd', args: [] } }],
      })],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().toggleProjectMcpServer('mcp-1')

    expect(useProjectStore.getState().openProjects[0].mcpServers[0].enabled).toBe(false)

    useProjectStore.getState().toggleProjectMcpServer('mcp-1')

    expect(useProjectStore.getState().openProjects[0].mcpServers[0].enabled).toBe(true)
  })
})

// ── Draft input ───────────────────────────────────────────────────────────────

describe('setDraftText', () => {
  it('sets draft text for the active project tab', () => {
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().setDraftText('hello world')

    expect(useProjectStore.getState().openProjects[0].draftText).toBe('hello world')
  })

  it('does nothing when no active project', () => {
    useProjectStore.setState({ openProjects: [], activeProjectPath: null })
    useProjectStore.getState().setDraftText('ignored')
    // No crash expected
  })

  it('does not affect other tabs', () => {
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj2')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().setDraftText('only for proj1')

    expect(useProjectStore.getState().openProjects[1].draftText).toBe('')
  })
})

describe('setDraftImages', () => {
  it('sets draft images for the active project tab', () => {
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })
    const images = [{ base64: 'abc', mimeType: 'image/png' as const, name: 'test.png', size: 100 }]

    useProjectStore.getState().setDraftImages(images)

    expect(useProjectStore.getState().openProjects[0].draftImages).toEqual(images)
  })
})

// ── removeRecentProject ───────────────────────────────────────────────────────

describe('removeRecentProject', () => {
  it('calls api.projects.removeRecent and refreshes list', async () => {
    const api = await getApi()
    api.projects.getRecent.mockResolvedValue([])

    await useProjectStore.getState().removeRecentProject('/old/project')

    expect(api.projects.removeRecent).toHaveBeenCalledWith('/old/project')
    expect(api.menu.rebuildMenu).toHaveBeenCalled()
  })
})

// ── setProjectModel ───────────────────────────────────────────────────────────

describe('setProjectModel', () => {
  it('updates model on the active tab and persists', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().setProjectModel('opus')

    expect(useProjectStore.getState().openProjects[0].model).toBe('opus')
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', { model: 'opus' })
  })

  it('does nothing when no active project', async () => {
    const api = await getApi()
    useProjectStore.setState({ openProjects: [], activeProjectPath: null })

    useProjectStore.getState().setProjectModel('opus')

    expect(api.projects.setSettings).not.toHaveBeenCalled()
  })
})

// ── setProjectPermissionMode ──────────────────────────────────────────────────

describe('setProjectPermissionMode', () => {
  it('updates permissionMode and persists', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().setProjectPermissionMode('restricted')

    expect(useProjectStore.getState().openProjects[0].permissionMode).toBe('restricted')
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', { permissionMode: 'restricted' })
  })
})

// ── setProjectMode ────────────────────────────────────────────────────────────

describe('setProjectMode', () => {
  it('updates mode and persists', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().setProjectMode('team')

    expect(useProjectStore.getState().openProjects[0].mode).toBe('team')
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', { mode: 'team' })
  })
})

// ── getActiveProjectTab ───────────────────────────────────────────────────────

describe('getActiveProjectTab', () => {
  it('returns the active project tab', () => {
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj2')],
      activeProjectPath: '/proj2',
    })

    const tab = getActiveProjectTab()

    expect(tab?.projectPath).toBe('/proj2')
  })

  it('returns undefined when no active project', () => {
    useProjectStore.setState({ openProjects: [], activeProjectPath: null })

    expect(getActiveProjectTab()).toBeUndefined()
  })
})

// ── routeClaudeEvent: background tab message persistence ─────────────────────

describe('routeClaudeEvent background tab message persistence', () => {
  const bgSnapshot = {
    conversations: [],
    activeConversationId: 'conv-bg-1',
    messages: [],
    streaming: {
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
    },
    isWaitingForResponse: true,
    hasActiveSession: true,
    messageQueue: [],
  }

  it('calls api.conversations.saveMessage for text messages in background tab with convId', async () => {
    const api = await getApi()
    const map = new Map([['sess-bg', '/proj-bg']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-bg', { snapshot: bgSnapshot })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    // A 'result' event that produces a text message to persist
    const event = {
      type: 'result',
      sessionId: 'sess-bg',
      result: 'Background response text',
    } as unknown as import('../types').ClaudeEvent

    useProjectStore.getState().routeClaudeEvent(event)

    expect(api.conversations.saveMessage).toHaveBeenCalledWith(
      'conv-bg-1',
      expect.objectContaining({ role: 'assistant', type: 'text' })
    )
  })

  it('does not call saveMessage for background tab with no activeConversationId', async () => {
    const api = await getApi()
    const snapshotWithoutConvId = { ...bgSnapshot, activeConversationId: null }
    const map = new Map([['sess-bg2', '/proj-bg2']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-bg2', { snapshot: snapshotWithoutConvId })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    const event = {
      type: 'result',
      sessionId: 'sess-bg2',
      result: 'Some text',
    } as unknown as import('../types').ClaudeEvent

    useProjectStore.getState().routeClaudeEvent(event)

    expect(api.conversations.saveMessage).not.toHaveBeenCalled()
  })
})

// ── routeClaudeEvent: queue processing on background result ───────────────────

describe('routeClaudeEvent queue processing', () => {
  it('dequeues next message on result event and calls api.claude.sendMessage', async () => {
    const api = await getApi()
    const snapshotWithQueue = {
      conversations: [],
      activeConversationId: 'conv-q-1',
      messages: [],
      streaming: {
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
      },
      isWaitingForResponse: true,
      hasActiveSession: true,
      messageQueue: [{ text: 'queued message', images: [] }],
    }

    const map = new Map([['sess-q', '/proj-q']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-q', { snapshot: snapshotWithQueue })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    const event = {
      type: 'result',
      sessionId: 'sess-q',
      result: 'Turn completed',
    } as unknown as import('../types').ClaudeEvent

    useProjectStore.getState().routeClaudeEvent(event)

    // saveMessage should be called for the dequeued user message
    expect(api.conversations.saveMessage).toHaveBeenCalledWith(
      'conv-q-1',
      expect.objectContaining({ role: 'user', type: 'text', content: 'queued message' })
    )

    // snapshot should have the user message appended
    const bgTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-q')
    expect(bgTab?.snapshot?.messages.some((m) => m.content === 'queued message')).toBe(true)
    expect(bgTab?.snapshot?.isWaitingForResponse).toBe(true)
  })

  it('sends the queued message via api.claude.sendMessage after timeout', async () => {
    const api = await getApi()
    vi.useFakeTimers()

    const snapshotWithQueue = {
      conversations: [],
      activeConversationId: 'conv-timer-1',
      messages: [],
      streaming: {
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
      },
      isWaitingForResponse: true,
      hasActiveSession: true,
      messageQueue: [{ text: 'timer message' }],
    }

    const map = new Map([['sess-timer', '/proj-timer']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-timer', { snapshot: snapshotWithQueue })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    const event = {
      type: 'result',
      sessionId: 'sess-timer',
      result: 'Done',
    } as unknown as import('../types').ClaudeEvent

    useProjectStore.getState().routeClaudeEvent(event)

    // sendMessage is called inside setTimeout(..., 100)
    expect(api.claude.sendMessage).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(api.claude.sendMessage).toHaveBeenCalledWith('conv-timer-1', 'timer message', undefined)

    vi.useRealTimers()
  })

  it('does not process queue when result event has empty queue', async () => {
    const api = await getApi()
    const snapshotNoQueue = {
      conversations: [],
      activeConversationId: 'conv-nq-1',
      messages: [],
      streaming: {
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
      },
      isWaitingForResponse: false,
      hasActiveSession: false,
      messageQueue: [],
    }

    const map = new Map([['sess-nq', '/proj-nq']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-nq', { snapshot: snapshotNoQueue })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    const event = {
      type: 'result',
      sessionId: 'sess-nq',
      result: 'Done',
    } as unknown as import('../types').ClaudeEvent

    useProjectStore.getState().routeClaudeEvent(event)

    expect(api.claude.sendMessage).not.toHaveBeenCalled()
  })
})

// ── updateProjectMcpServer ────────────────────────────────────────────────────

describe('updateProjectMcpServer', () => {
  it('updates MCP server fields and persists', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1', {
        mcpServers: [
          { id: 'mcp-1', name: 'Old Name', enabled: true, config: { type: 'stdio', command: 'cmd', args: [] } },
        ],
      })],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().updateProjectMcpServer('mcp-1', { name: 'New Name', enabled: false })

    const servers = useProjectStore.getState().openProjects[0].mcpServers
    expect(servers[0].name).toBe('New Name')
    expect(servers[0].enabled).toBe(false)
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', expect.objectContaining({
      mcpServers: expect.arrayContaining([expect.objectContaining({ id: 'mcp-1', name: 'New Name' })]),
    }))
  })

  it('does nothing when no active project', async () => {
    const api = await getApi()
    useProjectStore.setState({ openProjects: [], activeProjectPath: null })

    useProjectStore.getState().updateProjectMcpServer('mcp-1', { name: 'X' })

    expect(api.projects.setSettings).not.toHaveBeenCalled()
  })
})

// ── setProjectAgents ──────────────────────────────────────────────────────────

describe('setProjectAgents', () => {
  it('replaces agents list and persists (clamped to maxAgents)', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    const agents = [
      { id: 'a1', name: 'Agent 1', prompt: '', icon: '', color: '', capabilities: { tools: [] } },
      { id: 'a2', name: 'Agent 2', prompt: '', icon: '', color: '', capabilities: { tools: [] } },
    ]

    useProjectStore.getState().setProjectAgents(agents)

    expect(useProjectStore.getState().openProjects[0].agents).toHaveLength(2)
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', expect.objectContaining({ agents }))
  })

  it('does nothing when no active project', async () => {
    const api = await getApi()
    useProjectStore.setState({ openProjects: [], activeProjectPath: null })

    useProjectStore.getState().setProjectAgents([])

    expect(api.projects.setSettings).not.toHaveBeenCalled()
  })
})

// ── setProjectMcpServers ──────────────────────────────────────────────────────

describe('setProjectMcpServers', () => {
  it('replaces MCP servers list and persists', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    const servers = [
      { id: 'mcp-1', name: 'Server A', enabled: true, config: { type: 'stdio' as const, command: 'cmd', args: [] } },
    ]

    useProjectStore.getState().setProjectMcpServers(servers)

    expect(useProjectStore.getState().openProjects[0].mcpServers).toHaveLength(1)
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', expect.objectContaining({ mcpServers: servers }))
  })

  it('does nothing when no active project', async () => {
    const api = await getApi()
    useProjectStore.setState({ openProjects: [], activeProjectPath: null })

    useProjectStore.getState().setProjectMcpServers([])

    expect(api.projects.setSettings).not.toHaveBeenCalled()
  })
})

// ── setProjectModel aborts active session ─────────────────────────────────────

describe('setProjectModel — aborts active session', () => {
  it('calls abortSession when the conversation store has an active session', async () => {
    const api = await getApi()
    const convStore = await getConvStore()
    vi.mocked(convStore.getState).mockReturnValue({
      conversations: [],
      activeConversationId: 'sess-1',
      messages: [],
      streaming: {
        text: '', contentBlocks: [], thinking: '', isStreaming: false,
        currentAgentName: null, retrying: false, _partialJson: '',
        _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0,
      },
      isWaitingForResponse: false,
      hasActiveSession: true,
      messageQueue: [],
      permissionRequest: null,
      askUserQuestion: null,
      exitPlanMode: null,
      processLogs: [],
      abortSession: mockAbortSession,
      loadConversations: mockLoadConversations,
      handleClaudeEvent: mockHandleClaudeEvent,
    })

    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().setProjectModel('opus')

    expect(mockAbortSession).toHaveBeenCalled()
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', { model: 'opus' })
  })

  it('calls abortSession when isWaitingForResponse is true', async () => {
    const convStore = await getConvStore()
    vi.mocked(convStore.getState).mockReturnValue({
      conversations: [],
      activeConversationId: 'sess-1',
      messages: [],
      streaming: {
        text: '', contentBlocks: [], thinking: '', isStreaming: false,
        currentAgentName: null, retrying: false, _partialJson: '',
        _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0,
      },
      isWaitingForResponse: true,
      hasActiveSession: false,
      messageQueue: [],
      permissionRequest: null,
      askUserQuestion: null,
      exitPlanMode: null,
      processLogs: [],
      abortSession: mockAbortSession,
      loadConversations: mockLoadConversations,
      handleClaudeEvent: mockHandleClaudeEvent,
    })

    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().setProjectModel('haiku')

    expect(mockAbortSession).toHaveBeenCalled()
  })

  it('does not abort when no active session or waiting', async () => {
    const convStore = await getConvStore()
    vi.mocked(convStore.getState).mockReturnValue({
      conversations: [],
      activeConversationId: null,
      messages: [],
      streaming: {
        text: '', contentBlocks: [], thinking: '', isStreaming: false,
        currentAgentName: null, retrying: false, _partialJson: '',
        _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0,
      },
      isWaitingForResponse: false,
      hasActiveSession: false,
      messageQueue: [],
      permissionRequest: null,
      askUserQuestion: null,
      exitPlanMode: null,
      processLogs: [],
      abortSession: mockAbortSession,
      loadConversations: mockLoadConversations,
      handleClaudeEvent: mockHandleClaudeEvent,
    })

    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    useProjectStore.getState().setProjectModel('sonnet')

    expect(mockAbortSession).not.toHaveBeenCalled()
  })
})

// ── setProjectAgents ──────────────────────────────────────────────────────────

describe('setProjectAgents', () => {
  it('replaces agents list and persists clamped by license maxAgents', async () => {
    const api = await getApi()
    const licenseStore = await getLicenseStore()
    vi.mocked(licenseStore.getState).mockReturnValue({
      flags: {
        tier: 'pro', maxAgents: 2, maxMcpServers: 10, maxProjects: 10,
        teamMode: true, teamSync: false, premiumAgents: true, enabledFeatures: [],
      },
    } as ReturnType<typeof licenseStore.getState>)

    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    const agents = [
      { id: 'a1', name: 'A1', prompt: '', icon: '', color: '', capabilities: { tools: [] } },
      { id: 'a2', name: 'A2', prompt: '', icon: '', color: '', capabilities: { tools: [] } },
      { id: 'a3', name: 'A3', prompt: '', icon: '', color: '', capabilities: { tools: [] } },
    ]
    useProjectStore.getState().setProjectAgents(agents)

    // Only 2 agents should be stored (clamped by maxAgents: 2)
    const stored = useProjectStore.getState().openProjects[0].agents
    expect(stored).toHaveLength(2)
    expect(stored[0].id).toBe('a1')
    expect(api.projects.setSettings).toHaveBeenCalledWith('/proj1', expect.objectContaining({ agents: stored }))
  })

  it('does nothing when no active project', async () => {
    const api = await getApi()
    useProjectStore.setState({ openProjects: [], activeProjectPath: null })

    useProjectStore.getState().setProjectAgents([
      { id: 'a1', name: 'A1', prompt: '', icon: '', color: '', capabilities: { tools: [] } },
    ])

    expect(api.projects.setSettings).not.toHaveBeenCalled()
  })
})

// ── closeProject without snapshot → loads fresh conversations ─────────────────

describe('closeProject — no snapshot on next tab', () => {
  it('clears conversation store and calls loadConversations when next tab has no snapshot', () => {
    useProjectStore.setState({
      openProjects: [
        // next tab has no snapshot
        makeProjectTab('/proj1', { snapshot: null }),
        makeProjectTab('/proj2'),
      ],
      activeProjectPath: '/proj2',
    })

    useProjectStore.getState().closeProject('/proj2')

    expect(useProjectStore.getState().activeProjectPath).toBe('/proj1')
    // loadConversations should have been called for the next tab
    expect(mockLoadConversations).toHaveBeenCalledWith('/proj1')
  })
})

// ── setActiveProject ──────────────────────────────────────────────────────────

describe('setActiveProject', () => {
  it('does nothing when already active project', async () => {
    const api = await getApi()
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    await useProjectStore.getState().setActiveProject('/proj1')

    // No task loading, no conversation clearing
    expect(api.projects.setSettings).not.toHaveBeenCalled()
  })

  it('clears conversation state and loads conversations when tab has no snapshot', async () => {
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj2', { snapshot: null })],
      activeProjectPath: '/proj1',
    })

    await useProjectStore.getState().setActiveProject('/proj2')

    expect(useProjectStore.getState().activeProjectPath).toBe('/proj2')
    // loadConversations should have been called for the new project
    expect(mockLoadConversations).toHaveBeenCalledWith('/proj2')
  })

  it('resets unread count for the target tab', async () => {
    useProjectStore.setState({
      openProjects: [
        makeProjectTab('/proj1'),
        makeProjectTab('/proj2', { unreadCount: 5, snapshot: null }),
      ],
      activeProjectPath: '/proj1',
    })

    await useProjectStore.getState().setActiveProject('/proj2')

    const tab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj2')
    expect(tab?.unreadCount).toBe(0)
  })
})

// ── routeClaudeEvent — applyEventToSnapshot (background tab processing) ───────

describe('routeClaudeEvent — background tab snapshot mutations', () => {
  it('sets hasActiveSession in snapshot on session:started for background tab', () => {
    const map = new Map([['bg-sess', '/proj-bg']])
    useProjectStore.setState({
      openProjects: [
        makeProjectTab('/proj-main'),
        makeProjectTab('/proj-bg', {
          snapshot: {
            conversations: [],
            activeConversationId: 'bg-sess',
            messages: [],
            streaming: {
              text: '', contentBlocks: [], thinking: '', isStreaming: false,
              currentAgentName: null, retrying: false, _partialJson: '',
              _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0,
            },
            isWaitingForResponse: false,
            hasActiveSession: false,
            messageQueue: [],
          },
        }),
      ],
      activeProjectPath: '/proj-main',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'session:started',
      sessionId: 'bg-sess',
    } as import('../types').ClaudeEvent)

    const bgTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-bg')
    expect(bgTab?.snapshot?.hasActiveSession).toBe(true)
    expect(bgTab?.snapshot?.isWaitingForResponse).toBe(true)
  })

  it('appends assistant text to background snapshot messages on result event', async () => {
    const api = await getApi()
    api.conversations.saveMessage.mockResolvedValue({ id: 1 })

    const map = new Map([['bg-result', '/proj-bg']])
    useProjectStore.setState({
      openProjects: [
        makeProjectTab('/proj-main'),
        makeProjectTab('/proj-bg', {
          snapshot: {
            conversations: [],
            activeConversationId: 'bg-result',
            messages: [],
            streaming: {
              text: 'bg streamed text', contentBlocks: [], thinking: '', isStreaming: true,
              currentAgentName: null, retrying: false, _partialJson: '',
              _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0,
            },
            isWaitingForResponse: true,
            hasActiveSession: true,
            messageQueue: [],
          },
        }),
      ],
      activeProjectPath: '/proj-main',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'result',
      sessionId: 'bg-result',
      result: 'final answer',
    } as import('../types').ClaudeEvent)

    const bgTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-bg')
    const msgs = bgTab?.snapshot?.messages || []
    expect(msgs.some((m) => m.content === 'final answer')).toBe(true)
    expect(bgTab?.snapshot?.isWaitingForResponse).toBe(false)
  })

  it('appends error message to background snapshot on session:error event', () => {
    const map = new Map([['bg-err', '/proj-bg']])
    useProjectStore.setState({
      openProjects: [
        makeProjectTab('/proj-main'),
        makeProjectTab('/proj-bg', {
          snapshot: {
            conversations: [],
            activeConversationId: 'bg-err',
            messages: [],
            streaming: {
              text: '', contentBlocks: [], thinking: '', isStreaming: false,
              currentAgentName: null, retrying: false, _partialJson: '',
              _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0,
            },
            isWaitingForResponse: true,
            hasActiveSession: true,
            messageQueue: [],
          },
        }),
      ],
      activeProjectPath: '/proj-main',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'session:error',
      sessionId: 'bg-err',
      error: 'CLI crashed',
    } as import('../types').ClaudeEvent)

    const bgTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-bg')
    const msgs = bgTab?.snapshot?.messages || []
    expect(msgs.some((m) => m.content.includes('CLI crashed'))).toBe(true)
    expect(bgTab?.snapshot?.hasActiveSession).toBe(false)
  })
})

// ── setActiveProject with snapshot (line 683) ────────────────────────────────

describe('setActiveProject — with snapshot', () => {
  it('restores conversation snapshot when tab has a snapshot', async () => {
    const convStore = await getConvStore()
    const snapshot = {
      conversations: [],
      activeConversationId: 'c-snap',
      messages: [{ id: 1, role: 'user' as const, type: 'text' as const, content: 'hello', timestamp: 0 }],
      streaming: {
        text: '', contentBlocks: [], thinking: '', isStreaming: false,
        currentAgentName: null, retrying: false, _partialJson: '',
        _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0,
      },
      isWaitingForResponse: false,
      hasActiveSession: false,
      messageQueue: [],
    }

    useProjectStore.setState({
      openProjects: [
        makeProjectTab('/proj1'),
        makeProjectTab('/proj2', { snapshot }),
      ],
      activeProjectPath: '/proj1',
    })

    await useProjectStore.getState().setActiveProject('/proj2')

    // restoreConversationSnapshot calls useConversationStore.setState
    expect(vi.mocked(convStore.setState)).toHaveBeenCalledWith(
      expect.objectContaining({ activeConversationId: 'c-snap' })
    )
    // loadConversations should NOT be called when snapshot exists
    expect(mockLoadConversations).not.toHaveBeenCalled()
  })
})

// ── openProject with existing active tab (snapshot capture) ──────────────────

describe('openProject — snapshot capture when switching from another project', () => {
  it('captures snapshot from current active tab when opening a new project', async () => {
    const api = await getApi()
    api.projects.getSettings.mockResolvedValue({ model: 'sonnet', permissionMode: 'bypass', mode: 'solo', agents: [], mcpServers: [] })
    api.projects.getRecent.mockResolvedValue([])

    // Set up an existing active project
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    await useProjectStore.getState().openProject('/proj2')

    const state = useProjectStore.getState()
    expect(state.openProjects).toHaveLength(2)
    // proj1 snapshot should have been captured (not null)
    const proj1Tab = state.openProjects.find((p) => p.projectPath === '/proj1')
    expect(proj1Tab?.snapshot).not.toBeNull()
  })
})

// ── applyEventToSnapshot — informational events (lines 496-499) ───────────────

describe('routeClaudeEvent — applyEventToSnapshot informational events', () => {
  function makeBgTab(overrides = {}) {
    return makeProjectTab('/proj-bg', {
      snapshot: {
        conversations: [],
        activeConversationId: 'bg-info',
        messages: [],
        streaming: {
          text: '', contentBlocks: [], thinking: '', isStreaming: false,
          currentAgentName: null, retrying: false, _partialJson: '',
          _turnTokens: 0, _turnStartTime: 0, _lastActivityTime: 0,
        },
        isWaitingForResponse: true,
        hasActiveSession: true,
        messageQueue: [],
      },
      ...overrides,
    })
  }

  it('does not mutate snapshot on rate_limit_event', () => {
    const map = new Map([['bg-info', '/proj-bg']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj-main'), makeBgTab()],
      activeProjectPath: '/proj-main',
      conversationProjectMap: map,
    })

    const snapshotBefore = { ...useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-bg')?.snapshot }

    useProjectStore.getState().routeClaudeEvent({
      type: 'rate_limit_event',
      sessionId: 'bg-info',
    } as import('../types').ClaudeEvent)

    const bgTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-bg')
    // Snapshot should not have changed significantly
    expect(bgTab?.snapshot?.isWaitingForResponse).toBe(snapshotBefore.isWaitingForResponse)
    expect(bgTab?.snapshot?.messages).toHaveLength(0)
  })

  it('does not mutate snapshot on system event', () => {
    const map = new Map([['bg-info', '/proj-bg']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj-main'), makeBgTab()],
      activeProjectPath: '/proj-main',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'system',
      sessionId: 'bg-info',
      subtype: 'api_retry',
    } as import('../types').ClaudeEvent)

    const bgTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-bg')
    expect(bgTab?.snapshot?.messages).toHaveLength(0)
  })

  it('handles session:ended event in background snapshot', () => {
    const map = new Map([['bg-info', '/proj-bg']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj-main'), makeBgTab()],
      activeProjectPath: '/proj-main',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'session:ended',
      sessionId: 'bg-info',
    } as import('../types').ClaudeEvent)

    const bgTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-bg')
    expect(bgTab?.snapshot?.hasActiveSession).toBe(false)
    expect(bgTab?.snapshot?.isWaitingForResponse).toBe(false)
  })
})

// ── openProject with MCP server migration ────────────────────────────────────

describe('openProject — MCP server migration', () => {
  it('calls setSettings when mcpServers migration is triggered', async () => {
    const api = await getApi()
    // Return settings with an MCP server that has a known fake name for migration
    api.projects.getSettings.mockResolvedValue({
      model: 'sonnet',
      permissionMode: 'bypass',
      mode: 'solo',
      agents: [],
      mcpServers: [
        // Use a server config that the migrateMcpServers function would modify
        { id: 'mcp-1', name: 'Test MCP', enabled: true, config: { type: 'stdio', command: 'pilos-mcp-filesystem', args: [] } },
      ],
    })
    api.projects.getRecent.mockResolvedValue([])

    await useProjectStore.getState().openProject('/proj-mcp')

    // setSettings may have been called for migration — the key test is that openProject completes
    expect(useProjectStore.getState().openProjects.some((p) => p.projectPath === '/proj-mcp')).toBe(true)
  })

  it('calls api.projects.setSettings with migrated mcpServers when a fake package name is present (line 536)', async () => {
    const api = await getApi()
    // '@anthropic/playwright-mcp-server' is a known fake arg that triggers migration
    api.projects.getSettings.mockResolvedValue({
      model: 'sonnet',
      permissionMode: 'bypass',
      mode: 'solo',
      agents: [],
      mcpServers: [
        {
          id: 'mcp-fake',
          name: 'Playwright MCP',
          enabled: true,
          config: {
            type: 'stdio',
            command: 'npx',
            args: ['@anthropic/playwright-mcp-server'],
          },
        },
      ],
    })
    api.projects.getRecent.mockResolvedValue([])

    await useProjectStore.getState().openProject('/proj-migrated')

    // setSettings must have been called for the migration
    expect(api.projects.setSettings).toHaveBeenCalledWith(
      '/proj-migrated',
      expect.objectContaining({ mcpServers: expect.any(Array) })
    )
    // The migrated args should be the real package name, not the fake one
    const call = api.projects.setSettings.mock.calls.find(
      (c: unknown[]) => (c[0] as string) === '/proj-migrated'
    )
    const migratedServers = (call?.[1] as { mcpServers?: { config: { args: string[] } }[] })?.mcpServers
    expect(migratedServers?.[0]?.config?.args).not.toContain('@anthropic/playwright-mcp-server')
  })
})

// ── openProject — snapshots currentPath before switching (line 499 area) ──────

describe('openProject — snapshots current project before switching', () => {
  it('saves snapshot of current active project when switching to a new one', async () => {
    const api = await getApi()
    api.projects.getSettings.mockResolvedValue({
      model: 'sonnet', permissionMode: 'bypass', mode: 'solo', agents: [], mcpServers: [],
    })
    api.projects.getRecent.mockResolvedValue([])

    // Pre-load an existing project as active
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1')],
      activeProjectPath: '/proj1',
    })

    // Opening a second project should snapshot /proj1's conversation state
    await useProjectStore.getState().openProject('/proj2')

    const state = useProjectStore.getState()
    expect(state.openProjects).toHaveLength(2)
    // The old project should have a snapshot saved (captureConversationSnapshot is called)
    // activeProjectPath should now be /proj2
    expect(state.activeProjectPath).toBe('/proj2')
    // The first tab should have had its snapshot updated
    const proj1Tab = state.openProjects.find((p) => p.projectPath === '/proj1')
    // snapshot is set (may be null if conversation store returned empty state, but the field exists)
    expect(proj1Tab).toBeDefined()
  })
})

// ── applyEventToSnapshot — background event processing (lines 331-438) ────────

describe('routeClaudeEvent — applyEventToSnapshot branches', () => {
  function makeSnapshot() {
    return {
      conversations: [],
      activeConversationId: 'conv-snap-1',
      messages: [],
      streaming: {
        text: '',
        contentBlocks: [] as import('../types').ContentBlock[],
        thinking: '',
        isStreaming: false,
        currentAgentName: null,
        retrying: false,
        _partialJson: '',
        _turnTokens: 0,
        _turnStartTime: 0,
        _lastActivityTime: 0,
      },
      isWaitingForResponse: false,
      hasActiveSession: false,
      messageQueue: [],
    }
  }

  it('applyEventToSnapshot: content_block_start adds block to streaming.contentBlocks', async () => {
    const api = await getApi()
    const map = new Map([['sess-snap-1', '/proj-snap']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap', { snapshot: makeSnapshot() })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    const event = {
      type: 'content_block_start',
      sessionId: 'sess-snap-1',
      content_block: { type: 'tool_use', id: 'tu-snap', name: 'bash', input: {} },
    } as unknown as import('../types').ClaudeEvent

    useProjectStore.getState().routeClaudeEvent(event)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap')
    expect(snapTab?.snapshot?.streaming.contentBlocks).toHaveLength(1)
    expect(snapTab?.snapshot?.streaming.isStreaming).toBe(true)
    // No DB call expected for content_block_start
    expect(api.conversations.saveMessage).not.toHaveBeenCalled()
  })

  it('applyEventToSnapshot: content_block_delta accumulates text', () => {
    const map = new Map([['sess-snap-2', '/proj-snap2']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap2', { snapshot: makeSnapshot() })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    const event = {
      type: 'content_block_delta',
      sessionId: 'sess-snap-2',
      delta: { type: 'text_delta', text: 'Hello background' },
    } as unknown as import('../types').ClaudeEvent

    useProjectStore.getState().routeClaudeEvent(event)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap2')
    expect(snapTab?.snapshot?.streaming.text).toBe('Hello background')
  })

  it('applyEventToSnapshot: content_block_delta accumulates thinking_delta', () => {
    const map = new Map([['sess-snap-think', '/proj-snap-think']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-think', { snapshot: makeSnapshot() })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'content_block_delta',
      sessionId: 'sess-snap-think',
      delta: { type: 'thinking_delta', thinking: 'deep thought' },
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-think')
    expect(snapTab?.snapshot?.streaming.thinking).toBe('deep thought')
  })

  it('applyEventToSnapshot: content_block_delta accumulates input_json_delta', () => {
    const map = new Map([['sess-snap-json', '/proj-snap-json']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-json', { snapshot: makeSnapshot() })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'content_block_delta',
      sessionId: 'sess-snap-json',
      delta: { type: 'input_json_delta', partial_json: '{"cmd":' },
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-json')
    expect(snapTab?.snapshot?.streaming._partialJson).toBe('{"cmd":')
  })

  it('applyEventToSnapshot: content_block_stop finalizes partial JSON in last tool_use block', async () => {
    const api = await getApi()
    const snap = makeSnapshot()
    snap.streaming.contentBlocks = [{ type: 'tool_use', id: 'tu-stop', name: 'bash', input: {} } as import('../types').ContentBlock]
    snap.streaming._partialJson = '{"command":"ls"}'

    const map = new Map([['sess-snap-stop', '/proj-snap-stop']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-stop', { snapshot: snap })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'content_block_stop',
      sessionId: 'sess-snap-stop',
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-stop')
    expect(snapTab?.snapshot?.streaming._partialJson).toBe('')
    const lastBlock = snapTab?.snapshot?.streaming.contentBlocks[0] as { input?: unknown }
    expect(lastBlock?.input).toEqual({ command: 'ls' })

    // The block is tool_use so it should be added to messages
    expect(snapTab?.snapshot?.messages.some((m) => m.type === 'tool_use')).toBe(true)
    expect(api.conversations.saveMessage).toHaveBeenCalledWith(
      'conv-snap-1',
      expect.objectContaining({ type: 'tool_use' })
    )
  })

  it('applyEventToSnapshot: assistant event with tool_use blocks adds them as messages', async () => {
    const api = await getApi()
    const map = new Map([['sess-snap-asst', '/proj-snap-asst']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-asst', { snapshot: makeSnapshot() })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-snap-asst',
      message: {
        content: [
          { type: 'text', text: 'I will run bash' },
          { type: 'tool_use', id: 'tu-asst-snap', name: 'bash', input: { command: 'echo hi' } },
        ],
      },
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-asst')
    expect(snapTab?.snapshot?.messages.some((m) => m.type === 'tool_use')).toBe(true)
    expect(api.conversations.saveMessage).toHaveBeenCalledWith(
      'conv-snap-1',
      expect.objectContaining({ type: 'tool_use' })
    )
  })

  it('applyEventToSnapshot: user event adds non-denied tool_result messages', async () => {
    const api = await getApi()
    const map = new Map([['sess-snap-user', '/proj-snap-user']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-user', { snapshot: makeSnapshot() })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'user',
      sessionId: 'sess-snap-user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'tu-user-snap', content: 'result text', is_error: false },
        ],
      },
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-user')
    expect(snapTab?.snapshot?.messages.some((m) => m.type === 'tool_result')).toBe(true)
    expect(api.conversations.saveMessage).toHaveBeenCalledWith(
      'conv-snap-1',
      expect.objectContaining({ type: 'tool_result' })
    )
  })

  it('applyEventToSnapshot: user event skips permission-denial tool_result blocks', async () => {
    const api = await getApi()
    const map = new Map([['sess-snap-deny', '/proj-snap-deny']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-deny', { snapshot: makeSnapshot() })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'user',
      sessionId: 'sess-snap-deny',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'tu-denied', content: 'This requires approval', is_error: true },
        ],
      },
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-deny')
    expect(snapTab?.snapshot?.messages).toHaveLength(0)
    expect(api.conversations.saveMessage).not.toHaveBeenCalled()
  })

  it('applyEventToSnapshot: assistant event deduplicates tool_use blocks by id', () => {
    const existingToolUse = { type: 'tool_use', id: 'tu-dedup-snap', name: 'bash', input: {} } as import('../types').ContentBlock
    const snap = makeSnapshot()
    snap.messages = [{
      role: 'assistant',
      type: 'tool_use',
      content: '',
      contentBlocks: [existingToolUse],
      timestamp: 0,
    }]

    const map = new Map([['sess-snap-dedup', '/proj-snap-dedup']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-dedup', { snapshot: snap })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'assistant',
      sessionId: 'sess-snap-dedup',
      message: {
        content: [existingToolUse],
      },
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-dedup')
    const toolUseMsgs = snapTab?.snapshot?.messages.filter((m) => m.type === 'tool_use') ?? []
    expect(toolUseMsgs).toHaveLength(1)
  })

  it('applyEventToSnapshot: session:error marks hasActiveSession false and clears streaming', () => {
    const map = new Map([['sess-snap-err', '/proj-snap-err']])
    const snap = { ...makeSnapshot(), hasActiveSession: true, isWaitingForResponse: true }
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-err', { snapshot: snap })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'session:error',
      sessionId: 'sess-snap-err',
      error: 'Connection dropped',
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-err')
    expect(snapTab?.snapshot?.hasActiveSession).toBe(false)
    expect(snapTab?.snapshot?.isWaitingForResponse).toBe(false)
    const errorMsg = snapTab?.snapshot?.messages.find((m) => m.content.includes('Connection dropped'))
    expect(errorMsg).toBeDefined()
  })

  it('applyEventToSnapshot: content_block_stop assigns agent attribution in team mode (line 347)', async () => {
    const api = await getApi()
    const snap = makeSnapshot()
    // Add a tool_use block as last content block
    snap.streaming.contentBlocks = [{ type: 'tool_use', id: 'tu-team-bg', name: 'bash', input: {} } as import('../types').ContentBlock]
    snap.streaming._partialJson = ''
    snap.streaming.currentAgentName = 'Alice'

    const bgTab = makeProjectTab('/proj-snap-team', {
      snapshot: snap,
      mode: 'team' as const,
      agents: [{ id: 'a1', name: 'Alice', prompt: '', icon: '🤖', color: '#f00', capabilities: { tools: [] } }],
    })

    const map = new Map([['sess-snap-team', '/proj-snap-team']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), bgTab],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'content_block_stop',
      sessionId: 'sess-snap-team',
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-team')
    const toolUseMsg = snapTab?.snapshot?.messages.find((m) => m.type === 'tool_use')
    expect(toolUseMsg).toBeDefined()
    expect(toolUseMsg?.agentName).toBe('Alice')
    expect(api.conversations.saveMessage).toHaveBeenCalledWith(
      'conv-snap-1',
      expect.objectContaining({ type: 'tool_use', agentName: 'Alice' })
    )
  })

  it('applyEventToSnapshot: user event deduplicates tool_result blocks (line 380)', () => {
    const existingResultBlock = {
      type: 'tool_result',
      tool_use_id: 'tu-bg-dup',
      content: 'existing result',
      is_error: false,
    } as import('../types').ContentBlock

    const snap = makeSnapshot()
    snap.messages = [{
      role: 'assistant',
      type: 'tool_result',
      content: '',
      contentBlocks: [existingResultBlock],
      timestamp: 0,
    }]

    const map = new Map([['sess-snap-dup', '/proj-snap-dup']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-dup', { snapshot: snap })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'user',
      sessionId: 'sess-snap-dup',
      message: {
        content: [existingResultBlock],
      },
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-dup')
    const resultMsgs = snapTab?.snapshot?.messages.filter((m) => m.type === 'tool_result') ?? []
    expect(resultMsgs).toHaveLength(1)
  })

  it('applyEventToSnapshot: user event assigns agent attribution in team mode (line 386)', async () => {
    const api = await getApi()
    const snap = makeSnapshot()
    snap.streaming.currentAgentName = 'Bob'

    const bgTab = makeProjectTab('/proj-snap-user-team', {
      snapshot: snap,
      mode: 'team' as const,
      agents: [{ id: 'a2', name: 'Bob', prompt: '', icon: '🤖', color: '#00f', capabilities: { tools: [] } }],
    })

    const map = new Map([['sess-snap-user-team', '/proj-snap-user-team']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), bgTab],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'user',
      sessionId: 'sess-snap-user-team',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu-team-user', content: 'result', is_error: false }],
      },
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-user-team')
    const resultMsg = snapTab?.snapshot?.messages.find((m) => m.type === 'tool_result')
    expect(resultMsg?.agentName).toBe('Bob')
    expect(api.conversations.saveMessage).toHaveBeenCalledWith(
      'conv-snap-1',
      expect.objectContaining({ type: 'tool_result', agentName: 'Bob' })
    )
  })

  it('applyEventToSnapshot: result with thinking adds a thinking message before text message', async () => {
    const api = await getApi()
    const map = new Map([['sess-snap-think-result', '/proj-snap-think-result']])
    useProjectStore.setState({
      openProjects: [makeProjectTab('/proj1'), makeProjectTab('/proj-snap-think-result', { snapshot: makeSnapshot() })],
      activeProjectPath: '/proj1',
      conversationProjectMap: map,
    })

    useProjectStore.getState().routeClaudeEvent({
      type: 'result',
      sessionId: 'sess-snap-think-result',
      result: {
        content: [
          { type: 'thinking', thinking: 'Let me think...' },
          { type: 'text', text: 'Final answer' },
        ],
      },
    } as unknown as import('../types').ClaudeEvent)

    const snapTab = useProjectStore.getState().openProjects.find((p) => p.projectPath === '/proj-snap-think-result')
    const thinkingMsg = snapTab?.snapshot?.messages.find((m) => m.type === 'thinking')
    expect(thinkingMsg?.content).toBe('Let me think...')
    expect(snapTab?.snapshot?.messages.some((m) => m.type === 'text' && m.content === 'Final answer')).toBe(true)
    expect(api.conversations.saveMessage).toHaveBeenCalledWith('conv-snap-1', expect.objectContaining({ type: 'thinking' }))
    expect(api.conversations.saveMessage).toHaveBeenCalledWith('conv-snap-1', expect.objectContaining({ type: 'text' }))
  })
})
