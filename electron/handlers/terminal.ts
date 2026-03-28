import { ipcMain } from 'electron'
import type { TerminalManager } from '../core/terminal-manager'

export function registerTerminalHandlers(terminalManager: TerminalManager) {
  ipcMain.handle('terminal:create', (_event, id: string, options) =>
    terminalManager.create(id, options)
  )

  ipcMain.handle('terminal:write', (_event, id: string, data: string) =>
    terminalManager.write(id, data)
  )

  ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) =>
    terminalManager.resize(id, cols, rows)
  )

  ipcMain.handle('terminal:destroy', (_event, id: string) =>
    terminalManager.destroy(id)
  )
}
