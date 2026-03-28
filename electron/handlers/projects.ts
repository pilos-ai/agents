import { ipcMain } from 'electron'
import type { SettingsStore } from '../services/settings-store'

export function registerProjectHandlers(settings: SettingsStore) {
  ipcMain.handle('projects:getRecent', () => settings.getRecentProjects())

  ipcMain.handle('projects:addRecent', (_event, dirPath: string) =>
    settings.addRecentProject(dirPath)
  )

  ipcMain.handle('projects:removeRecent', (_event, dirPath: string) =>
    settings.removeRecentProject(dirPath)
  )

  ipcMain.handle('projects:getSettings', (_event, dirPath: string) =>
    settings.getProjectSettings(dirPath)
  )

  ipcMain.handle('projects:setSettings', (_event, dirPath: string, partial: Record<string, unknown>) =>
    settings.setProjectSettings(dirPath, partial)
  )
}
