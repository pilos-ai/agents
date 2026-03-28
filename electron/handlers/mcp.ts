import { ipcMain } from 'electron'
import { writeMcpConfig } from '../services/mcp-config-writer'
import type { SettingsStore } from '../services/settings-store'

export function registerMcpHandlers(settings: SettingsStore, getJiraOAuth: () => { setActiveProject(p: string): void; getValidTokens(): Promise<void> } | null) {
  ipcMain.handle('mcp:writeConfig', async (_event, projectPath: string, servers) => {
    const jiraOAuth = getJiraOAuth()
    if (jiraOAuth && projectPath) {
      try {
        jiraOAuth.setActiveProject(projectPath)
        await jiraOAuth.getValidTokens()
      } catch {
        // Token refresh failed — writeMcpConfig will handle missing/stale tokens
      }
    }
    return writeMcpConfig(projectPath, servers, settings)
  })
}
