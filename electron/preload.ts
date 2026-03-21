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
    getUsageStats: () => ipcRenderer.invoke('cli:getUsageStats'),
    getClaudeUsage: () => ipcRenderer.invoke('cli:getClaudeUsage'),
  },

  // Dependency Checker
  deps: {
    checkAll: () => ipcRenderer.invoke('deps:checkAll'),
    getInstallInfo: (tool: string) => ipcRenderer.invoke('deps:getInstallInfo', tool),
    openInstallPage: (tool: string) => ipcRenderer.invoke('deps:openInstallPage', tool),
    setCustomPath: (tool: string, binaryPath: string) =>
      ipcRenderer.invoke('deps:setCustomPath', tool, binaryPath),
    browseForBinary: (tool: string) => ipcRenderer.invoke('deps:browseForBinary', tool),
    autoInstall: (tool: string) => ipcRenderer.invoke('deps:autoInstall', tool),
    onInstallProgress: (callback: (data: { tool: string; message: string }) => void) => {
      const handler = (_event: unknown, data: { tool: string; message: string }) => callback(data)
      ipcRenderer.on('deps:install-progress', handler)
      return () => ipcRenderer.removeListener('deps:install-progress', handler)
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
    respondToPlanExit: (sessionId: string, approved: boolean, feedback?: string) =>
      ipcRenderer.invoke('claude:respondToPlanExit', sessionId, approved, feedback),
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
    getMessage: (messageId: number) =>
      ipcRenderer.invoke('conversations:getMessage', messageId),
    searchMessages: (query: string, options: Record<string, unknown>) =>
      ipcRenderer.invoke('conversations:searchMessages', query, options),
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
    readFile: (filePath: string) =>
      ipcRenderer.invoke('files:readFile', filePath),
    readDir: (dirPath: string, recursive?: boolean) =>
      ipcRenderer.invoke('files:readDir', dirPath, recursive),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('files:writeFile', filePath, content),
  },

  // Dialogs
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openPath: (options?: { directory?: boolean }) => ipcRenderer.invoke('dialog:openPath', options),
    openExternal: (url: string) => ipcRenderer.invoke('dialog:openExternal', url),
    saveFile: (options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke('dialog:saveFile', options),
    openFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke('dialog:openFile', options),
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

  // Shell
  shell: {
    openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
    showContextMenu: (text: string, isEditable?: boolean) => ipcRenderer.invoke('shell:showContextMenu', text, isEditable),
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
    createIssue: (projectKey: string, summary: string, description: string, issueType: string) =>
      ipcRenderer.invoke('jira:createIssue', projectKey, summary, description, issueType),
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

  // Storage
  storage: {
    getStats: () => ipcRenderer.invoke('storage:getStats'),
    clearConversations: () => ipcRenderer.invoke('storage:clearConversations'),
    clearAllData: () => ipcRenderer.invoke('storage:clearAllData'),
  },

  // Mobile / Pairing
  mobile: {
    connect: () => ipcRenderer.invoke('mobile:connect'),
    disconnect: () => ipcRenderer.invoke('mobile:disconnect'),
    getStatus: () => ipcRenderer.invoke('mobile:getStatus'),
    requestPairingToken: () => ipcRenderer.invoke('mobile:requestPairingToken'),
    approvePairing: (requestId: string) => ipcRenderer.invoke('mobile:approvePairing', requestId),
    denyPairing: (requestId: string) => ipcRenderer.invoke('mobile:denyPairing', requestId),
    listPairedDevices: () => ipcRenderer.invoke('mobile:listPairedDevices'),
    revokeDevice: (deviceId: string) => ipcRenderer.invoke('mobile:revokeDevice', deviceId),
    onPairingRequest: (callback: (data: { requestId: string; deviceName: string; deviceId: string }) => void) => {
      const handler = (_event: unknown, data: { requestId: string; deviceName: string; deviceId: string }) => callback(data)
      ipcRenderer.on('mobile:pairingRequest', handler)
      return () => ipcRenderer.removeListener('mobile:pairingRequest', handler)
    },
    onDeviceApproved: (callback: (data: { deviceId: string; deviceName: string }) => void) => {
      const handler = (_event: unknown, data: { deviceId: string; deviceName: string }) => callback(data)
      ipcRenderer.on('mobile:deviceApproved', handler)
      return () => ipcRenderer.removeListener('mobile:deviceApproved', handler)
    },
    onDeviceRevoked: (callback: (data: { deviceId: string }) => void) => {
      const handler = (_event: unknown, data: { deviceId: string }) => callback(data)
      ipcRenderer.on('mobile:deviceRevoked', handler)
      return () => ipcRenderer.removeListener('mobile:deviceRevoked', handler)
    },
    onStatus: (callback: (data: { connected: boolean; mobileCount: number }) => void) => {
      const handler = (_event: unknown, data: { connected: boolean; mobileCount: number }) => callback(data)
      ipcRenderer.on('mobile:status', handler)
      return () => ipcRenderer.removeListener('mobile:status', handler)
    },
    onNewMessage: (callback: (data: { conversationId: string; message: string; images?: Array<{ data: string; mediaType: string }> }) => void) => {
      const handler = (_event: unknown, data: { conversationId: string; message: string; images?: Array<{ data: string; mediaType: string }> }) => callback(data)
      ipcRenderer.on('mobile:newMessage', handler)
      return () => ipcRenderer.removeListener('mobile:newMessage', handler)
    },
    broadcastUserMessage: (conversationId: string, message: string, images?: Array<{ data: string; mediaType: string }>) =>
      ipcRenderer.invoke('mobile:broadcastUserMessage', conversationId, message, images),
  },

  // Metrics
  metrics: {
    setLicenseKey: (key: string) => ipcRenderer.invoke('metrics:setLicenseKey', key),
    getMachineId: () => ipcRenderer.invoke('metrics:getMachineId') as Promise<string>,
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

  // Scheduler (background task execution)
  scheduler: {
    onTriggerTask: (callback: (data: { taskId: string; trigger: string; projectPath?: string }) => void) => {
      const handler = (_event: unknown, data: { taskId: string; trigger: string; projectPath?: string }) => callback(data)
      ipcRenderer.on('scheduler:trigger-task', handler)
      return () => ipcRenderer.removeListener('scheduler:trigger-task', handler)
    },
    onNavigateToTask: (callback: (taskId: string) => void) => {
      const handler = (_event: unknown, taskId: string) => callback(taskId)
      ipcRenderer.on('scheduler:navigate-to-task', handler)
      return () => ipcRenderer.removeListener('scheduler:navigate-to-task', handler)
    },
    reportTaskStarted: (data: { taskId: string; taskTitle: string }) => {
      ipcRenderer.send('scheduler:task-started', data)
    },
    reportTaskCompleted: (data: { taskId: string; status: string; summary: string; taskTitle: string }) => {
      ipcRenderer.send('scheduler:task-completed', data)
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
