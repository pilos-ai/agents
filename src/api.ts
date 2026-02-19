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
    getSettings: () => Promise.resolve({ model: 'sonnet', permissionMode: 'bypass', mode: 'solo' as const, agents: [] }),
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
  dialog: {
    openDirectory: () => Promise.resolve(null),
  },
}

export const api: ElectronAPI = window.api ?? stubAPI
