const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // CLI Checker
  cli: {
    check: () => ipcRenderer.invoke('cli:check'),
    install: () => ipcRenderer.invoke('cli:install'),
    checkAuth: () => ipcRenderer.invoke('cli:checkAuth'),
    login: () => ipcRenderer.invoke('cli:login'),
    onInstallOutput: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data)
      ipcRenderer.on('cli:installOutput', handler)
      return () => ipcRenderer.removeListener('cli:installOutput', handler)
    },
    onLoginOutput: (callback: (data: string) => void) => {
      const handler = (_event: unknown, data: string) => callback(data)
      ipcRenderer.on('cli:loginOutput', handler)
      return () => ipcRenderer.removeListener('cli:loginOutput', handler)
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
    respondToQuestion: (sessionId: string, answers: Record<string, string>) =>
      ipcRenderer.invoke('claude:respondToQuestion', sessionId, answers),
    respondToPlanExit: (sessionId: string, approved: boolean) =>
      ipcRenderer.invoke('claude:respondToPlanExit', sessionId, approved),
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

  // Files
  files: {
    revertEdit: (filePath: string, oldString: string, newString: string) =>
      ipcRenderer.invoke('files:revertEdit', filePath, oldString, newString),
  },

  // Dialogs
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openExternal: (url: string) => ipcRenderer.invoke('dialog:openExternal', url),
  },

  // Menu
  menu: {
    setActiveProject: (project: { path: string; name: string } | null) =>
      ipcRenderer.send('menu:setActiveProject', project),
    rebuildMenu: () => ipcRenderer.send('menu:rebuildMenu'),
    onMenuAction: (callback: (action: string, ...args: unknown[]) => void) => {
      const channels = [
        'menu:openSettings',
        'menu:openProject',
        'menu:newConversation',
        'menu:openRecentProject',
        'menu:closeProject',
        'menu:openProjectSettings',
        'menu:toggleRightPanel',
      ]
      const handlers = channels.map((ch) => {
        const handler = (_event: unknown, ...args: unknown[]) => callback(ch, ...args)
        ipcRenderer.on(ch, handler)
        return { channel: ch, handler }
      })
      return () => {
        for (const { channel, handler } of handlers) {
          ipcRenderer.removeListener(channel, handler)
        }
      }
    },
  },

  // Jira
  jira: {
    setActiveProject: (projectPath: string) => ipcRenderer.invoke('jira:setActiveProject', projectPath),
    authorize: (projectPath: string) => ipcRenderer.invoke('jira:authorize', projectPath),
    disconnect: (projectPath: string) => ipcRenderer.invoke('jira:disconnect', projectPath),
    getTokens: (projectPath: string) => ipcRenderer.invoke('jira:getTokens', projectPath),
    getProjects: () => ipcRenderer.invoke('jira:getProjects'),
    getBoards: (projectKey: string) => ipcRenderer.invoke('jira:getBoards', projectKey),
    getBoardIssues: (boardId: number) => ipcRenderer.invoke('jira:getBoardIssues', boardId),
    getSprints: (boardId: number) => ipcRenderer.invoke('jira:getSprints', boardId),
    getSprintIssues: (sprintId: number) => ipcRenderer.invoke('jira:getSprintIssues', sprintId),
    getIssues: (jql: string) => ipcRenderer.invoke('jira:getIssues', jql),
    createEpic: (projectKey: string, summary: string, description: string) =>
      ipcRenderer.invoke('jira:createEpic', projectKey, summary, description),
    createSubTask: (parentKey: string, summary: string, description: string) =>
      ipcRenderer.invoke('jira:createSubTask', parentKey, summary, description),
    transitionIssue: (issueKey: string, transitionId: string) =>
      ipcRenderer.invoke('jira:transitionIssue', issueKey, transitionId),
    getTransitions: (issueKey: string) => ipcRenderer.invoke('jira:getTransitions', issueKey),
    getUsers: (projectKey: string) => ipcRenderer.invoke('jira:getUsers', projectKey),
    getIssue: (issueKey: string) => ipcRenderer.invoke('jira:getIssue', issueKey),
    saveBoardConfig: (projectPath: string, config: { projectKey: string; boardId: number; boardName: string }) =>
      ipcRenderer.invoke('jira:saveBoardConfig', projectPath, config),
    getBoardConfig: (projectPath: string) => ipcRenderer.invoke('jira:getBoardConfig', projectPath),
  },

  // Metrics
  metrics: {
    setLicenseKey: (key: string) => ipcRenderer.invoke('metrics:setLicenseKey', key),
  },

  // Updates
  updater: {
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data)
      ipcRenderer.on('update:status', handler)
      return () => ipcRenderer.removeListener('update:status', handler)
    },
  },

  // Stories
  stories: {
    list: (projectPath: string) => ipcRenderer.invoke('stories:list', projectPath),
    get: (id: string) => ipcRenderer.invoke('stories:get', id),
    create: (story: Record<string, unknown>) => ipcRenderer.invoke('stories:create', story),
    update: (id: string, updates: Record<string, unknown>) => ipcRenderer.invoke('stories:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('stories:delete', id),
    getCriteria: (storyId: string) => ipcRenderer.invoke('stories:getCriteria', storyId),
    addCriterion: (storyId: string, description: string) =>
      ipcRenderer.invoke('stories:addCriterion', storyId, description),
    updateCriterion: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('stories:updateCriterion', id, updates),
    deleteCriterion: (id: string) => ipcRenderer.invoke('stories:deleteCriterion', id),
    reorderCriteria: (storyId: string, criterionIds: string[]) =>
      ipcRenderer.invoke('stories:reorderCriteria', storyId, criterionIds),
    pushToJira: (storyId: string, projectKey: string) =>
      ipcRenderer.invoke('stories:pushToJira', storyId, projectKey),
    syncFromJira: (storyId: string) => ipcRenderer.invoke('stories:syncFromJira', storyId),
    analyzeCoverage: (storyId: string) => ipcRenderer.invoke('stories:analyzeCoverage', storyId),
    onCoverageProgress: (callback: (data: unknown) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data)
      ipcRenderer.on('stories:coverageProgress', handler)
      return () => ipcRenderer.removeListener('stories:coverageProgress', handler)
    },
  },
})
