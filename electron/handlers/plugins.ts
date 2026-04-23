import { ipcMain } from 'electron'
import { detectPlugins } from '../services/plugin-detector'
import {
  installPlugin,
  uninstallPlugin,
  listInstalledPlugins,
} from '../services/plugin-manager'
import type { SettingsStore } from '../services/settings-store'

export function registerPluginHandlers(settings: SettingsStore) {
  ipcMain.handle('plugins:detect', (_event, projectPath: string) => detectPlugins(projectPath))

  ipcMain.handle('plugins:listInstalled', (_event, projectPath: string) =>
    listInstalledPlugins(projectPath),
  )

  ipcMain.handle(
    'plugins:install',
    async (_event, projectPath: string, pluginName: string, marketplace: string) => {
      const result = await installPlugin(projectPath, pluginName, marketplace)
      if (result.ok) {
        const current = settings.getProjectSettings(projectPath)
        const existing = Array.isArray(current.pluginsInstalled) ? current.pluginsInstalled : []
        if (!existing.includes(pluginName)) {
          settings.setProjectSettings(projectPath, {
            pluginsInstalled: [...existing, pluginName],
          })
        }
      }
      return result
    },
  )

  ipcMain.handle(
    'plugins:uninstall',
    async (_event, projectPath: string, pluginName: string) => {
      const result = await uninstallPlugin(projectPath, pluginName)
      if (result.ok) {
        const current = settings.getProjectSettings(projectPath)
        const existing = Array.isArray(current.pluginsInstalled) ? current.pluginsInstalled : []
        settings.setProjectSettings(projectPath, {
          pluginsInstalled: existing.filter((n: string) => n !== pluginName),
        })
      }
      return result
    },
  )
}
