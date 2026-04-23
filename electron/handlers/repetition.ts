import { ipcMain } from 'electron'
import {
  createSqliteStorage,
  registerRepetitionIpc,
} from '@pilos/repetition-detection'
import type { Database } from '../core/database'

/**
 * Thin wiring: build a SQLite-backed RepetitionStorage and register the
 * submodule's IPC handlers. All logic lives in the submodule.
 */
export function registerRepetitionHandlers(database: Database): void {
  const storage = createSqliteStorage(database.raw)
  registerRepetitionIpc(ipcMain, storage)
}
