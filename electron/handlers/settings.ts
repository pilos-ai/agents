import { ipcMain } from 'electron'
import type { SettingsStore } from '../services/settings-store'

export function registerSettingsHandlers(settings: SettingsStore) {
  ipcMain.handle('settings:get', (_event, key: string) => settings.get(key))

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) =>
    settings.set(key, value)
  )

  ipcMain.handle('settings:getAll', () => settings.getAll())
}
