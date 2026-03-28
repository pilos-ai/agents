import { ipcMain } from 'electron'
import type { ProcessTracker } from '../core/process-tracker'

export function registerProcessHandlers(processTracker: ProcessTracker) {
  ipcMain.handle('processes:list', () => processTracker.list())

  ipcMain.handle('processes:stop', (_event, pid: number) =>
    processTracker.stop(pid)
  )
}
