import type { ElectronAPI } from './types'

const noop = () => {}
const noopAsync = () => Promise.resolve(null as never)
const noopUnsub = () => noop

const stubAPI: ElectronAPI = {
  cli: {
    check: () => Promise.resolve({ available: true, npmAvailable: true }),
    install: () => Promise.resolve(true),
    onInstallOutput: noopUnsub,
  },
  claude: {
    startSession: noopAsync,
    sendMessage: noopAsync,
    respondPermission: noopAsync,
    abort: noopAsync,
    onEvent: noopUnsub,
  },
  conversations: {
    list: () => Promise.resolve([]),
    get: noopAsync,
    create: (title: string) => Promise.resolve({ id: crypto.randomUUID(), title, model: 'sonnet', working_directory: '', project_path: '', created_at: '', updated_at: '' }),
    updateTitle: noopAsync,
    delete: noopAsync,
    getMessages: () => Promise.resolve([]),
    saveMessage: noopAsync,
  },
  projects: {
    getRecent: () => Promise.resolve([]),
    addRecent: noopAsync,
    removeRecent: noopAsync,
    getSettings: () => Promise.resolve({ model: 'sonnet', permissionMode: 'bypass', mode: 'solo' as const, agents: [], mcpServers: [] }),
    setSettings: noopAsync,
  },
  terminal: {
    create: noopAsync,
    write: noopAsync,
    resize: noopAsync,
    destroy: noopAsync,
    onData: noopUnsub,
    onExit: noopUnsub,
  },
  processes: {
    list: () => Promise.resolve([]),
    stop: noopAsync,
    onUpdate: noopUnsub,
  },
  settings: {
    get: noopAsync,
    set: noopAsync,
    getAll: () => Promise.resolve({}),
  },
  mcp: {
    writeConfig: () => Promise.resolve('/tmp/stub-mcp.json'),
  },
  files: {
    revertEdit: () => Promise.resolve({ success: false, error: 'stub' }),
  },
  dialog: {
    openDirectory: () => Promise.resolve(null),
  },
  menu: {
    setActiveProject: noop,
    rebuildMenu: noop,
    onMenuAction: noopUnsub,
  },
  jira: {
    setActiveProject: noopAsync,
    authorize: noopAsync as any,
    disconnect: noopAsync as any,
    getTokens: () => Promise.resolve(null) as any,
    getProjects: () => Promise.resolve([]),
    getBoards: () => Promise.resolve([]),
    getBoardIssues: () => Promise.resolve([]),
    getSprints: () => Promise.resolve([]),
    getSprintIssues: () => Promise.resolve([]),
    getIssues: () => Promise.resolve([]),
    createEpic: noopAsync,
    createSubTask: noopAsync,
    transitionIssue: noopAsync,
    getTransitions: () => Promise.resolve([]),
    getUsers: () => Promise.resolve([]),
    getIssue: noopAsync,
    saveBoardConfig: noopAsync as any,
    getBoardConfig: () => Promise.resolve(null) as any,
  },
  stories: {
    list: () => Promise.resolve([]),
    get: () => Promise.resolve(null),
    create: noopAsync,
    update: noopAsync,
    delete: noopAsync,
    getCriteria: () => Promise.resolve([]),
    addCriterion: noopAsync,
    updateCriterion: noopAsync,
    deleteCriterion: noopAsync,
    reorderCriteria: noopAsync,
    pushToJira: noopAsync,
    syncFromJira: noopAsync,
    analyzeCoverage: noopAsync,
    onCoverageProgress: noopUnsub,
  },
}

export const api: ElectronAPI = window.api ?? stubAPI
