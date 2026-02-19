const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // CLI Checker
  cli: {
    check: () => ipcRenderer.invoke('cli:check'),
    install: () => ipcRenderer.invoke('cli:install'),
    onInstallOutput: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data)
      ipcRenderer.on('cli:installOutput', handler)
      return () => ipcRenderer.removeListener('cli:installOutput', handler)
    },
  },

  // Claude CLI
  claude: {
    startSession: (sessionId: string, options: Record<string, unknown>) =>
      ipcRenderer.invoke('claude:startSession', sessionId, options),
    sendMessage: (sessionId: string, message: string, images?: Array<{ data: string; mediaType: string }>) =>
      ipcRenderer.invoke('claude:sendMessage', sessionId, message, images),
    respondPermission: (sessionId: string, allowed: boolean, always?: boolean) =>
      ipcRenderer.invoke('claude:respondPermission', sessionId, allowed, always),
    abort: (sessionId: string) =>
      ipcRenderer.invoke('claude:abort', sessionId),
    onEvent: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data)
      ipcRenderer.on('claude:event', handler)
      return () => ipcRenderer.removeListener('claude:event', handler)
    },
  },

  // Conversations
  conversations: {
    list: (projectPath?: string) => ipcRenderer.invoke('conversations:list', projectPath),
    get: (id: string) => ipcRenderer.invoke('conversations:get', id),
    create: (title: string, projectPath?: string) => ipcRenderer.invoke('conversations:create', title, projectPath),
    updateTitle: (id: string, title: string) =>
      ipcRenderer.invoke('conversations:updateTitle', id, title),
    delete: (id: string) => ipcRenderer.invoke('conversations:delete', id),
    getMessages: (conversationId: string) =>
      ipcRenderer.invoke('conversations:getMessages', conversationId),
    saveMessage: (conversationId: string, message: Record<string, unknown>) =>
      ipcRenderer.invoke('conversations:saveMessage', conversationId, message),
  },

  // Projects
  projects: {
    getRecent: () => ipcRenderer.invoke('projects:getRecent'),
    addRecent: (dirPath: string) => ipcRenderer.invoke('projects:addRecent', dirPath),
    removeRecent: (dirPath: string) => ipcRenderer.invoke('projects:removeRecent', dirPath),
    getSettings: (dirPath: string) => ipcRenderer.invoke('projects:getSettings', dirPath),
    setSettings: (dirPath: string, settings: Record<string, unknown>) =>
      ipcRenderer.invoke('projects:setSettings', dirPath, settings),
  },

  // Terminal
  terminal: {
    create: (id: string, options?: Record<string, unknown>) =>
      ipcRenderer.invoke('terminal:create', id, options),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', id, cols, rows),
    destroy: (id: string) => ipcRenderer.invoke('terminal:destroy', id),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_event: unknown, id: string, data: string) => callback(id, data)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
    onExit: (callback: (id: string, code: number) => void) => {
      const handler = (_event: unknown, id: string, code: number) => callback(id, code)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.removeListener('terminal:exit', handler)
    },
  },

  // Process Tracker
  processes: {
    list: () => ipcRenderer.invoke('processes:list'),
    stop: (pid: number) => ipcRenderer.invoke('processes:stop', pid),
    onUpdate: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data)
      ipcRenderer.on('processes:update', handler)
      return () => ipcRenderer.removeListener('processes:update', handler)
    },
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // MCP
  mcp: {
    writeConfig: (projectPath: string, servers: unknown[]) =>
      ipcRenderer.invoke('mcp:writeConfig', projectPath, servers),
  },

  // Dialogs
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },
})
