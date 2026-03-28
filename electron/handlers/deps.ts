import { ipcMain, BrowserWindow } from 'electron'
import { installNode, installGit, installClaude } from '../services/dependency-installer'
import type { DependencyChecker, DependencyName } from '../services/dependency-checker'
import type { SettingsStore } from '../services/settings-store'

export function registerDepsHandlers(
  mainWindow: BrowserWindow,
  dependencyChecker: DependencyChecker,
  settings: SettingsStore
) {
  ipcMain.handle('deps:checkAll', () => dependencyChecker.checkAll())

  ipcMain.handle('deps:getInstallInfo', (_event, tool: string) =>
    dependencyChecker.getInstallInfo(tool as DependencyName)
  )

  ipcMain.handle('deps:openInstallPage', (_event, tool: string) => {
    dependencyChecker.openInstallPage(tool as DependencyName)
  })

  ipcMain.handle('deps:setCustomPath', (_event, tool: string, binaryPath: string) =>
    dependencyChecker.setCustomPath(tool as DependencyName, binaryPath)
  )

  ipcMain.handle('deps:browseForBinary', (_event, tool: string) =>
    dependencyChecker.browseForBinary(tool as DependencyName)
  )

  ipcMain.handle('deps:autoInstall', async (_event, tool: string) => {
    try {
      switch (tool) {
        case 'node':
          return { success: true, path: await installNode(mainWindow, settings) }
        case 'git':
          return { success: true, path: await installGit(mainWindow, settings) }
        case 'claude':
          return { success: true, path: await installClaude(mainWindow, settings) }
        default:
          return { success: false, error: `Unknown tool: ${tool}` }
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
