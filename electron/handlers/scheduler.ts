import { ipcMain } from 'electron'
import type { TaskScheduler } from '../services/task-scheduler'

export function registerSchedulerHandlers(getTaskScheduler: () => TaskScheduler | null) {
  ipcMain.on('scheduler:task-started', (_event, data: { taskId: string; taskTitle: string }) => {
    getTaskScheduler()?.onTaskStarted(data.taskId, data.taskTitle)
  })

  ipcMain.on('scheduler:task-completed', (_event, data: { taskId: string; status: string; summary: string; taskTitle: string }) => {
    getTaskScheduler()?.onTaskCompleted(data.taskId, data)
  })
}
