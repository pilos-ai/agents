import { ipcMain, dialog, BrowserWindow } from 'electron'
import { ClaudeProcess } from './core/claude-process'
import { TerminalManager } from './core/terminal-manager'
import { ProcessTracker } from './core/process-tracker'
import { Database } from './core/database'
import { SettingsStore } from './services/settings-store'
import { CliChecker } from './services/cli-checker'
import { writeMcpConfig } from './services/mcp-config-writer'

let claudeProcess: ClaudeProcess
let terminalManager: TerminalManager
let processTracker: ProcessTracker
let database: Database
let settings: SettingsStore
let cliChecker: CliChecker

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  settings = new SettingsStore()
  database = new Database()
  claudeProcess = new ClaudeProcess(mainWindow, settings)
  terminalManager = new TerminalManager(mainWindow)
  processTracker = new ProcessTracker(mainWindow)
  cliChecker = new CliChecker(mainWindow)

  // ── CLI Checker ──
  ipcMain.handle('cli:check', async () => {
    return cliChecker.check()
  })

  ipcMain.handle('cli:install', async () => {
    return cliChecker.install()
  })

  // ── Claude CLI ──
  ipcMain.handle('claude:startSession', async (_event, sessionId: string, options) => {
    return claudeProcess.startSession(sessionId, options)
  })

  ipcMain.handle('claude:sendMessage', async (_event, sessionId: string, message: string, images?: Array<{ data: string; mediaType: string }>) => {
    return claudeProcess.sendMessage(sessionId, message, images)
  })

  ipcMain.handle('claude:respondPermission', async (_event, sessionId: string, allowed: boolean, always?: boolean) => {
    return claudeProcess.respondPermission(sessionId, allowed, always || false)
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
    })
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

  // ── MCP ──
  ipcMain.handle('mcp:writeConfig', async (_event, projectPath: string, servers) => {
    return writeMcpConfig(projectPath, servers)
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
}
