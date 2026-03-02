import { vi } from 'vitest'

/** Creates a full mock of window.api matching the Electron preload surface */
export function createMockApi() {
  return {
    cli: {
      check: vi.fn().mockResolvedValue({ available: true }),
      install: vi.fn().mockResolvedValue(true),
      checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
      login: vi.fn().mockResolvedValue(true),
      onInstallOutput: vi.fn().mockReturnValue(() => {}),
      onLoginOutput: vi.fn().mockReturnValue(() => {}),
    },
    deps: {
      checkAll: vi.fn().mockResolvedValue({
        git: { name: 'git', status: 'found' },
        node: { name: 'node', status: 'found' },
        claude: { name: 'claude', status: 'found' },
        allFound: true,
      }),
      getInstallInfo: vi.fn().mockResolvedValue({ url: '', instructions: '' }),
      openInstallPage: vi.fn().mockResolvedValue(null),
      setCustomPath: vi.fn().mockResolvedValue({ name: 'git', status: 'found' }),
      browseForBinary: vi.fn().mockResolvedValue(null),
      autoInstall: vi.fn().mockResolvedValue({ success: false, error: 'stub' }),
      onInstallProgress: vi.fn().mockReturnValue(() => {}),
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
    conversations: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((title: string) =>
        Promise.resolve({ id: 'test-conv', title, model: 'sonnet', working_directory: '', project_path: '', created_at: '', updated_at: '' })
      ),
      updateTitle: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
      getMessages: vi.fn().mockResolvedValue([]),
      saveMessage: vi.fn().mockResolvedValue(null),
      getMessage: vi.fn().mockResolvedValue(null),
      searchMessages: vi.fn().mockResolvedValue({ total: 0, messages: [] }),
    },
    projects: {
      getRecent: vi.fn().mockResolvedValue([]),
      addRecent: vi.fn().mockResolvedValue(null),
      removeRecent: vi.fn().mockResolvedValue(null),
      getSettings: vi.fn().mockResolvedValue({
        model: 'sonnet', permissionMode: 'bypass', mode: 'solo',
        agents: [], mcpServers: [],
      }),
      setSettings: vi.fn().mockResolvedValue(null),
    },
    terminal: {
      create: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockResolvedValue(null),
      resize: vi.fn().mockResolvedValue(null),
      destroy: vi.fn().mockResolvedValue(null),
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
    },
    processes: {
      list: vi.fn().mockResolvedValue([]),
      stop: vi.fn().mockResolvedValue(null),
      onUpdate: vi.fn().mockReturnValue(() => {}),
    },
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(null),
      getAll: vi.fn().mockResolvedValue({}),
    },
    mcp: {
      writeConfig: vi.fn().mockResolvedValue({ configPath: '/tmp/mcp.json', warnings: [] }),
    },
    files: {
      revertEdit: vi.fn().mockResolvedValue({ success: false, error: 'stub' }),
    },
    dialog: {
      openDirectory: vi.fn().mockResolvedValue(null),
      openExternal: vi.fn().mockResolvedValue(null),
    },
    menu: {
      setActiveProject: vi.fn(),
      rebuildMenu: vi.fn(),
      onMenuAction: vi.fn().mockReturnValue(() => {}),
    },
    storage: {
      getStats: vi.fn().mockResolvedValue({ conversations: 0, messages: 0, stories: 0, metrics: 0, dbSizeBytes: 0 }),
      clearConversations: vi.fn().mockResolvedValue(null),
      clearAllData: vi.fn().mockResolvedValue(null),
    },
    metrics: {
      setLicenseKey: vi.fn().mockResolvedValue(null),
      getMachineId: vi.fn().mockResolvedValue('test-machine-id'),
    },
    updater: {
      install: vi.fn().mockResolvedValue(null),
      onStatus: vi.fn().mockReturnValue(() => {}),
    },
    shell: {
      openPath: vi.fn().mockResolvedValue(''),
    },
    jira: {
      setActiveProject: vi.fn().mockResolvedValue(null),
      authorize: vi.fn().mockResolvedValue(null),
      disconnect: vi.fn().mockResolvedValue(null),
      getTokens: vi.fn().mockResolvedValue(null),
      getProjects: vi.fn().mockResolvedValue([]),
      getBoards: vi.fn().mockResolvedValue([]),
      getBoardIssues: vi.fn().mockResolvedValue([]),
      getSprints: vi.fn().mockResolvedValue([]),
      getSprintIssues: vi.fn().mockResolvedValue([]),
      getIssues: vi.fn().mockResolvedValue([]),
      createIssue: vi.fn().mockResolvedValue(null),
      createEpic: vi.fn().mockResolvedValue(null),
      createSubTask: vi.fn().mockResolvedValue(null),
      transitionIssue: vi.fn().mockResolvedValue(null),
      getTransitions: vi.fn().mockResolvedValue([]),
      getUsers: vi.fn().mockResolvedValue([]),
      getIssue: vi.fn().mockResolvedValue(null),
      saveBoardConfig: vi.fn().mockResolvedValue(null),
      getBoardConfig: vi.fn().mockResolvedValue(null),
    },
    stories: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
      getCriteria: vi.fn().mockResolvedValue([]),
      addCriterion: vi.fn().mockResolvedValue(null),
      updateCriterion: vi.fn().mockResolvedValue(null),
      deleteCriterion: vi.fn().mockResolvedValue(null),
      reorderCriteria: vi.fn().mockResolvedValue(null),
      pushToJira: vi.fn().mockResolvedValue(null),
      syncFromJira: vi.fn().mockResolvedValue(null),
      analyzeCoverage: vi.fn().mockResolvedValue(null),
      onCoverageProgress: vi.fn().mockReturnValue(() => {}),
    },
  }
}
