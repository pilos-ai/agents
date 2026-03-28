import { ipcMain } from 'electron'
import type { Database } from '../core/database'

export function registerStorageHandlers(database: Database) {
  ipcMain.handle('storage:getStats', () => database.getStorageStats())

  ipcMain.handle('storage:clearConversations', () => {
    database.clearConversations()
  })

  ipcMain.handle('storage:clearAllData', () => {
    database.clearAllData()
  })
}
