import { BrowserWindow } from 'electron'
import { ClaudeProcess } from './core/claude-process'
import { TerminalManager } from './core/terminal-manager'
import { ProcessTracker } from './core/process-tracker'
import { Database } from './core/database'
import { SettingsStore } from './services/settings-store'
import { CliChecker } from './services/cli-checker'
import { DependencyChecker } from './services/dependency-checker'
import type { MetricsCollector } from './services/metrics-collector'

import { registerCliHandlers } from './handlers/cli'
import { registerDepsHandlers } from './handlers/deps'
import { registerClaudeHandlers } from './handlers/claude'
import { registerConversationHandlers } from './handlers/conversations'
import { registerProjectHandlers } from './handlers/projects'
import { registerTerminalHandlers } from './handlers/terminal'
import { registerProcessHandlers } from './handlers/processes'
import { registerSettingsHandlers } from './handlers/settings'
import { registerStorageHandlers } from './handlers/storage'
import { registerMcpHandlers } from './handlers/mcp'
import { registerFileHandlers } from './handlers/files'
import { registerDialogHandlers } from './handlers/dialog'
import { registerShellHandlers } from './handlers/shell'
import { registerJiraHandlers } from './handlers/jira'
import { registerStoriesHandlers } from './handlers/stories'
import { registerRepetitionHandlers } from './handlers/repetition'
import { registerPluginHandlers } from './handlers/plugins'
import type { JiraOAuthLike } from './types/pm'

type SpellParams = { misspelledWord: string; suggestions: string[] } | null

export async function registerIpcHandlers(
  mainWindow: BrowserWindow,
  settingsStore: SettingsStore,
  db?: Database,
  metrics?: MetricsCollector,
  getSpellParams?: () => SpellParams
): Promise<{ claudeProcess: ClaudeProcess; database: Database }> {
  const database = db || new Database()
  const claudeProcess = new ClaudeProcess(mainWindow, settingsStore)
  const terminalManager = new TerminalManager(mainWindow)
  const processTracker = new ProcessTracker(mainWindow)
  const cliChecker = new CliChecker(mainWindow)
  const dependencyChecker = new DependencyChecker(mainWindow, settingsStore)

  registerCliHandlers(cliChecker)
  registerDepsHandlers(mainWindow, dependencyChecker, settingsStore)
  registerClaudeHandlers(claudeProcess, database, metrics || null)
  registerConversationHandlers(database)
  registerProjectHandlers(settingsStore)
  registerTerminalHandlers(terminalManager)
  registerProcessHandlers(processTracker)
  registerSettingsHandlers(settingsStore)
  registerStorageHandlers(database)
  registerRepetitionHandlers(database)
  registerPluginHandlers(settingsStore)
  registerFileHandlers()
  registerDialogHandlers(mainWindow)
  registerShellHandlers(getSpellParams)

  // jiraOAuth is also used by the MCP handler to refresh tokens before writing config
  let jiraOAuth: JiraOAuthLike | null = null
  registerMcpHandlers(settingsStore, () => jiraOAuth)

  // Dynamically load PM/Jira services if available
  try {
    const pm = await import('@pilos/agents-pm/electron')
    const rawJiraOAuth = new pm.JiraOAuth(settingsStore)
    if (typeof rawJiraOAuth !== 'object' || rawJiraOAuth === null || typeof rawJiraOAuth.getValidTokens !== 'function') {
      throw new Error('JiraOAuth instance does not implement expected JiraOAuthLike interface')
    }
    jiraOAuth = rawJiraOAuth as unknown as JiraOAuthLike
    const jiraClient = new pm.JiraClient(rawJiraOAuth)
    registerJiraHandlers(jiraOAuth, jiraClient as unknown as import('./types/pm').JiraClientLike, settingsStore)
    registerStoriesHandlers(database, jiraClient as unknown as import('./types/pm').JiraClientLike, mainWindow)
  } catch {
    // PM package not available — Jira/Stories handlers won't be registered
  }

  return { claudeProcess, database }
}
