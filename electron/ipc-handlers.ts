import { ipcMain, dialog, BrowserWindow } from 'electron'
import { ClaudeProcess } from './core/claude-process'
import { TerminalManager } from './core/terminal-manager'
import { ProcessTracker } from './core/process-tracker'
import { Database } from './core/database'
import { SettingsStore } from './services/settings-store'
import { CliChecker } from './services/cli-checker'
import { writeMcpConfig } from './services/mcp-config-writer'
import type { MetricsCollector } from './services/metrics-collector'

let claudeProcess: ClaudeProcess
let terminalManager: TerminalManager
let processTracker: ProcessTracker
let database: Database
let settings: SettingsStore
let cliChecker: CliChecker
let metricsCollector: MetricsCollector | null = null
let jiraOAuth: any  // Dynamically loaded from @pilos/agents-pm
let jiraClient: any // Dynamically loaded from @pilos/agents-pm

export async function registerIpcHandlers(mainWindow: BrowserWindow, settingsStore: SettingsStore, db?: Database, metrics?: MetricsCollector): Promise<void> {
  settings = settingsStore
  database = db || new Database()
  metricsCollector = metrics || null
  claudeProcess = new ClaudeProcess(mainWindow, settings)
  terminalManager = new TerminalManager(mainWindow)
  processTracker = new ProcessTracker(mainWindow)
  cliChecker = new CliChecker(mainWindow)

  // Dynamically load PM/Jira services if available
  let hasPm = false
  try {
    const pm = await import('@pilos/agents-pm/electron')
    jiraOAuth = new pm.JiraOAuth(settings)
    jiraClient = new pm.JiraClient(jiraOAuth)
    hasPm = true
  } catch {
    // PM package not available — Jira/Stories handlers won't be registered
  }

  // ── CLI Checker ──
  ipcMain.handle('cli:check', async () => {
    return cliChecker.check()
  })

  ipcMain.handle('cli:install', async () => {
    return cliChecker.install()
  })

  ipcMain.handle('cli:checkAuth', async () => {
    return cliChecker.checkAuth()
  })

  ipcMain.handle('cli:login', async () => {
    return cliChecker.login()
  })

  // ── Claude CLI ──
  ipcMain.handle('claude:startSession', async (_event, sessionId: string, options) => {
    metricsCollector?.trackSessionStarted()

    // Look up stored CLI session ID for resume
    if (options.resume) {
      const storedCliId = database.getConversationCliSessionId(sessionId)
      if (storedCliId) {
        options.cliSessionId = storedCliId
        console.log(`[IPC] Resuming session ${sessionId} with CLI session ${storedCliId}`)
      }
    }

    const cliSessionId = await claudeProcess.startSession(sessionId, options)

    // Store the CLI session ID for future resume
    database.updateConversationCliSessionId(sessionId, cliSessionId)
    return cliSessionId
  })

  ipcMain.handle('claude:sendMessage', async (_event, sessionId: string, message: string, images?: Array<{ data: string; mediaType: string }>) => {
    metricsCollector?.trackMessageSent()
    return claudeProcess.sendMessage(sessionId, message, images)
  })

  ipcMain.handle('claude:respondPermission', async (_event, sessionId: string, allowed: boolean, always?: boolean) => {
    return claudeProcess.respondPermission(sessionId, allowed, always || false)
  })

  ipcMain.handle('claude:respondToQuestion', async (_event, sessionId: string, answers: Record<string, string>) => {
    return claudeProcess.respondToQuestion(sessionId, answers)
  })

  ipcMain.handle('claude:respondToPlanExit', async (_event, sessionId: string, approved: boolean) => {
    return claudeProcess.respondToPlanExit(sessionId, approved)
  })

  ipcMain.handle('claude:abort', async (_event, sessionId: string) => {
    return claudeProcess.abort(sessionId)
  })

  // ── Conversations ──
  ipcMain.handle('conversations:list', async (_event, projectPath?: string) => {
    return database.listConversations(projectPath)
  })

  ipcMain.handle('conversations:get', async (_event, id: string) => {
    return database.getConversation(id)
  })

  ipcMain.handle('conversations:create', async (_event, title: string, projectPath?: string) => {
    return database.createConversation(title, projectPath || '')
  })

  ipcMain.handle('conversations:updateTitle', async (_event, id: string, title: string) => {
    return database.updateConversationTitle(id, title)
  })

  ipcMain.handle('conversations:delete', async (_event, id: string) => {
    return database.deleteConversation(id)
  })

  ipcMain.handle('conversations:getMessages', async (_event, conversationId: string) => {
    const rows = database.getMessages(conversationId)
    // Map DB snake_case to renderer camelCase
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      type: r.type,
      content: r.content,
      toolName: r.tool_name,
      toolInput: r.tool_input,
      toolResult: r.tool_result,
      agentName: r.agent_name,
      agentEmoji: r.agent_emoji,
      agentColor: r.agent_color,
      contentBlocks: r.content_blocks ? JSON.parse(r.content_blocks) : undefined,
      replyToId: r.reply_to_id ?? undefined,
      timestamp: new Date(r.created_at).getTime(),
    }))
  })

  ipcMain.handle('conversations:saveMessage', async (_event, conversationId: string, message) => {
    // Map renderer camelCase to DB snake_case
    return database.saveMessage(conversationId, {
      role: message.role,
      type: message.type,
      content: message.content,
      tool_name: message.toolName,
      tool_input: message.toolInput,
      tool_result: message.toolResult,
      agent_name: message.agentName,
      agent_emoji: message.agentEmoji,
      agent_color: message.agentColor,
      content_blocks: message.contentBlocks ? JSON.stringify(message.contentBlocks) : null,
      reply_to_id: message.replyToId ?? null,
    })
  })

  ipcMain.handle('conversations:getMessage', async (_event, messageId: number) => {
    const r = database.getMessage(messageId)
    if (!r) return null
    return {
      id: r.id,
      role: r.role,
      type: r.type,
      content: r.content,
      toolName: r.tool_name,
      toolInput: r.tool_input,
      toolResult: r.tool_result,
      agentName: r.agent_name,
      agentEmoji: r.agent_emoji,
      agentColor: r.agent_color,
      contentBlocks: r.content_blocks ? JSON.parse(r.content_blocks) : undefined,
      replyToId: r.reply_to_id ?? undefined,
      timestamp: new Date(r.created_at).getTime(),
    }
  })

  ipcMain.handle('conversations:searchMessages', async (_event, query: string, options: { conversationId?: string; projectPath?: string; limit?: number; offset?: number }) => {
    const result = database.searchMessages(query, options)
    return {
      total: result.total,
      messages: result.messages.map((r) => ({
        id: r.id as number,
        conversationId: r.conversation_id as string,
        conversationTitle: r.conversation_title as string,
        role: r.role as string,
        type: r.type as string,
        content: r.content as string,
        snippet: r.snippet as string,
        timestamp: new Date(r.created_at as string).getTime(),
      })),
    }
  })

  // ── Terminal ──
  ipcMain.handle('terminal:create', async (_event, id: string, options) => {
    return terminalManager.create(id, options)
  })

  ipcMain.handle('terminal:write', async (_event, id: string, data: string) => {
    return terminalManager.write(id, data)
  })

  ipcMain.handle('terminal:resize', async (_event, id: string, cols: number, rows: number) => {
    return terminalManager.resize(id, cols, rows)
  })

  ipcMain.handle('terminal:destroy', async (_event, id: string) => {
    return terminalManager.destroy(id)
  })

  // ── Process Tracker ──
  ipcMain.handle('processes:list', async () => {
    return processTracker.list()
  })

  ipcMain.handle('processes:stop', async (_event, pid: number) => {
    return processTracker.stop(pid)
  })

  // ── Settings ──
  ipcMain.handle('settings:get', async (_event, key: string) => {
    return settings.get(key)
  })

  ipcMain.handle('settings:set', async (_event, key: string, value: unknown) => {
    return settings.set(key, value)
  })

  ipcMain.handle('settings:getAll', async () => {
    return settings.getAll()
  })

  // ── Projects ──
  ipcMain.handle('projects:getRecent', async () => {
    return settings.getRecentProjects()
  })

  ipcMain.handle('projects:addRecent', async (_event, dirPath: string) => {
    return settings.addRecentProject(dirPath)
  })

  ipcMain.handle('projects:removeRecent', async (_event, dirPath: string) => {
    return settings.removeRecentProject(dirPath)
  })

  ipcMain.handle('projects:getSettings', async (_event, dirPath: string) => {
    return settings.getProjectSettings(dirPath)
  })

  ipcMain.handle('projects:setSettings', async (_event, dirPath: string, partial: Record<string, unknown>) => {
    return settings.setProjectSettings(dirPath, partial)
  })

  // ── Storage ──
  ipcMain.handle('storage:getStats', async () => {
    return database.getStorageStats()
  })

  ipcMain.handle('storage:clearConversations', async () => {
    database.clearConversations()
  })

  ipcMain.handle('storage:clearAllData', async () => {
    database.clearAllData()
  })

  // ── MCP ──
  ipcMain.handle('mcp:writeConfig', async (_event, projectPath: string, servers) => {
    return writeMcpConfig(projectPath, servers, settings)
  })

  // ── Files ──
  ipcMain.handle('files:revertEdit', async (_event, filePath: string, oldString: string, newString: string) => {
    const fs = await import('fs/promises')
    const content = await fs.readFile(filePath, 'utf-8')
    if (!content.includes(newString)) {
      return { success: false, error: 'Content no longer matches — file may have changed' }
    }
    await fs.writeFile(filePath, content.replace(newString, oldString), 'utf-8')
    return { success: true }
  })

  // ── Dialogs ──
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openExternal', async (_event, url: string) => {
    const { shell } = await import('electron')
    await shell.openExternal(url)
  })

  // ── Jira & Stories (only if PM package is available) ──
  if (hasPm) {
    // ── Jira OAuth (project-scoped) ──
    ipcMain.handle('jira:setActiveProject', async (_event, projectPath: string) => {
      jiraOAuth.setActiveProject(projectPath)
    })

    ipcMain.handle('jira:authorize', async (_event, projectPath: string) => {
      jiraOAuth.setActiveProject(projectPath)
      return jiraOAuth.authorize()
    })

    ipcMain.handle('jira:disconnect', async (_event, projectPath: string) => {
      jiraOAuth.setActiveProject(projectPath)
      jiraOAuth.disconnect()
    })

    ipcMain.handle('jira:getTokens', async (_event, projectPath: string) => {
      jiraOAuth.setActiveProject(projectPath)
      return jiraOAuth.getValidTokens()
    })

    // ── Jira API ──
    ipcMain.handle('jira:getProjects', async () => {
      return jiraClient.getProjects()
    })

    ipcMain.handle('jira:getBoards', async (_event, projectKey: string) => {
      return jiraClient.getBoards(projectKey)
    })

    ipcMain.handle('jira:getBoardIssues', async (_event, boardId: number) => {
      return jiraClient.getBoardIssues(boardId)
    })

    ipcMain.handle('jira:getSprints', async (_event, boardId: number) => {
      return jiraClient.getSprints(boardId)
    })

    ipcMain.handle('jira:getSprintIssues', async (_event, sprintId: number) => {
      return jiraClient.getSprintIssues(sprintId)
    })

    ipcMain.handle('jira:getIssues', async (_event, jql: string) => {
      return jiraClient.getIssues(jql)
    })

    ipcMain.handle('jira:createEpic', async (_event, projectKey: string, summary: string, description: string) => {
      return jiraClient.createEpic(projectKey, summary, description)
    })

    ipcMain.handle('jira:createSubTask', async (_event, parentKey: string, summary: string, description: string) => {
      return jiraClient.createSubTask(parentKey, summary, description)
    })

    ipcMain.handle('jira:transitionIssue', async (_event, issueKey: string, transitionId: string) => {
      return jiraClient.transitionIssue(issueKey, transitionId)
    })

    ipcMain.handle('jira:getTransitions', async (_event, issueKey: string) => {
      return jiraClient.getTransitions(issueKey)
    })

    ipcMain.handle('jira:getUsers', async (_event, projectKey: string) => {
      return jiraClient.getUsers(projectKey)
    })

    ipcMain.handle('jira:getIssue', async (_event, issueKey: string) => {
      return jiraClient.getIssue(issueKey)
    })

    ipcMain.handle('jira:saveBoardConfig', async (_event, projectPath: string, config: { projectKey: string; boardId: number; boardName: string }) => {
      const allConfigs = settings.get('jiraBoardConfigs') as Record<string, unknown> || {}
      allConfigs[projectPath] = config
      settings.set('jiraBoardConfigs', allConfigs)
    })

    ipcMain.handle('jira:getBoardConfig', async (_event, projectPath: string) => {
      const allConfigs = settings.get('jiraBoardConfigs') as Record<string, unknown> || {}
      return allConfigs[projectPath] || null
    })

    // ── Stories ──
    ipcMain.handle('stories:list', async (_event, projectPath: string) => {
      const rows = database.listStories(projectPath)
      return rows.map(mapStoryRow)
    })

    ipcMain.handle('stories:get', async (_event, id: string) => {
      const row = database.getStory(id)
      return row ? mapStoryRow(row) : null
    })

    ipcMain.handle('stories:create', async (_event, story: Record<string, unknown>) => {
      const row = database.createStory({
        project_path: story.projectPath,
        title: story.title,
        description: story.description,
        status: story.status,
        priority: story.priority,
        story_points: story.storyPoints,
        jira_epic_key: story.jiraEpicKey,
        jira_epic_id: story.jiraEpicId,
        jira_project_key: story.jiraProjectKey,
        jira_sync_status: story.jiraSyncStatus,
        coverage_data: story.coverageData ? JSON.stringify(story.coverageData) : null,
      })
      return mapStoryRow(row)
    })

    ipcMain.handle('stories:update', async (_event, id: string, updates: Record<string, unknown>) => {
      const dbUpdates: Record<string, unknown> = {}
      if ('title' in updates) dbUpdates.title = updates.title
      if ('description' in updates) dbUpdates.description = updates.description
      if ('status' in updates) dbUpdates.status = updates.status
      if ('priority' in updates) dbUpdates.priority = updates.priority
      if ('storyPoints' in updates) dbUpdates.story_points = updates.storyPoints
      if ('jiraEpicKey' in updates) dbUpdates.jira_epic_key = updates.jiraEpicKey
      if ('jiraEpicId' in updates) dbUpdates.jira_epic_id = updates.jiraEpicId
      if ('jiraProjectKey' in updates) dbUpdates.jira_project_key = updates.jiraProjectKey
      if ('jiraSyncStatus' in updates) dbUpdates.jira_sync_status = updates.jiraSyncStatus
      if ('jiraLastSynced' in updates) dbUpdates.jira_last_synced = updates.jiraLastSynced
      if ('coverageData' in updates) dbUpdates.coverage_data = updates.coverageData ? JSON.stringify(updates.coverageData) : null
      const row = database.updateStory(id, dbUpdates)
      return mapStoryRow(row)
    })

    ipcMain.handle('stories:delete', async (_event, id: string) => {
      database.deleteStory(id)
    })

    ipcMain.handle('stories:getCriteria', async (_event, storyId: string) => {
      const rows = database.getStoryCriteria(storyId)
      return rows.map(mapCriterionRow)
    })

    ipcMain.handle('stories:addCriterion', async (_event, storyId: string, description: string) => {
      const row = database.addStoryCriterion(storyId, description)
      return mapCriterionRow(row)
    })

    ipcMain.handle('stories:updateCriterion', async (_event, id: string, updates: Record<string, unknown>) => {
      const dbUpdates: Record<string, unknown> = {}
      if ('description' in updates) dbUpdates.description = updates.description
      if ('orderIndex' in updates) dbUpdates.order_index = updates.orderIndex
      if ('isCovered' in updates) dbUpdates.is_covered = updates.isCovered ? 1 : 0
      if ('coveredFiles' in updates) dbUpdates.covered_files = updates.coveredFiles ? JSON.stringify(updates.coveredFiles) : null
      if ('coveredExplanation' in updates) dbUpdates.covered_explanation = updates.coveredExplanation
      if ('jiraTaskKey' in updates) dbUpdates.jira_task_key = updates.jiraTaskKey
      if ('jiraTaskId' in updates) dbUpdates.jira_task_id = updates.jiraTaskId
      const row = database.updateStoryCriterion(id, dbUpdates)
      return mapCriterionRow(row)
    })

    ipcMain.handle('stories:deleteCriterion', async (_event, id: string) => {
      database.deleteStoryCriterion(id)
    })

    ipcMain.handle('stories:reorderCriteria', async (_event, storyId: string, criterionIds: string[]) => {
      database.reorderStoryCriteria(storyId, criterionIds)
    })

    ipcMain.handle('stories:pushToJira', async (_event, storyId: string, projectKey: string) => {
      const storyRow = database.getStory(storyId)
      if (!storyRow) throw new Error('Story not found')
      const story = mapStoryRow(storyRow)

      // Create epic in Jira
      const epic = await jiraClient.createEpic(projectKey, story.title, story.description)

      // Create sub-tasks for each criterion
      const criteria = database.getStoryCriteria(storyId)
      for (const row of criteria) {
        const criterion = mapCriterionRow(row)
        const subTask = await jiraClient.createSubTask(epic.key, criterion.description, '')
        database.updateStoryCriterion(criterion.id, {
          jira_task_key: subTask.key,
          jira_task_id: subTask.id,
        })
      }

      // Update story with Jira info
      database.updateStory(storyId, {
        jira_epic_key: epic.key,
        jira_epic_id: epic.id,
        jira_project_key: projectKey,
        jira_sync_status: 'synced',
        jira_last_synced: new Date().toISOString(),
      })
    })

    ipcMain.handle('stories:syncFromJira', async (_event, storyId: string) => {
      const storyRow = database.getStory(storyId)
      if (!storyRow || !storyRow.jira_epic_key) throw new Error('Story not synced to Jira')

      // Get all sub-tasks
      const criteria = database.getStoryCriteria(storyId)
      for (const row of criteria) {
        if (row.jira_task_key) {
          const issue = await jiraClient.getIssue(row.jira_task_key as string)
          // Map Jira status to covered status
          const isDone = issue.status.categoryKey === 'done'
          database.updateStoryCriterion(row.id as string, { is_covered: isDone ? 1 : 0 })
        }
      }

      database.updateStory(storyId, {
        jira_sync_status: 'synced',
        jira_last_synced: new Date().toISOString(),
      })
    })

    ipcMain.handle('stories:analyzeCoverage', async (_event, storyId: string) => {
      // Coverage analysis will be handled by the renderer via a Claude session
      // This handler just updates the coverage data after analysis
      mainWindow.webContents.send('stories:coverageStarted', { storyId })
    })
  }
}

// ── Row Mappers ──

function mapStoryRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    projectPath: row.project_path as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as string,
    priority: row.priority as string,
    storyPoints: row.story_points as number | undefined,
    jiraEpicKey: row.jira_epic_key as string | undefined,
    jiraEpicId: row.jira_epic_id as string | undefined,
    jiraProjectKey: row.jira_project_key as string | undefined,
    jiraSyncStatus: (row.jira_sync_status as string) || 'local',
    jiraLastSynced: row.jira_last_synced as string | undefined,
    coverageData: row.coverage_data ? JSON.parse(row.coverage_data as string) : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapCriterionRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    storyId: row.story_id as string,
    description: row.description as string,
    orderIndex: row.order_index as number,
    isCovered: Boolean(row.is_covered),
    coveredFiles: row.covered_files ? JSON.parse(row.covered_files as string) : undefined,
    coveredExplanation: row.covered_explanation as string | undefined,
    jiraTaskKey: row.jira_task_key as string | undefined,
    jiraTaskId: row.jira_task_id as string | undefined,
    createdAt: row.created_at as string,
  }
}
