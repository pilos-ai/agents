import { BrowserWindow } from 'electron'
import type { SettingsStore } from './settings-store'
import type { TrayManager } from './tray-manager'

interface ScheduledTask {
  id: string
  title: string
  schedule: {
    interval: string
    enabled: boolean
    nextRunAt: string | null
    lastRunAt: string | null
  }
}

export class TaskScheduler {
  private win: BrowserWindow
  private settings: SettingsStore
  private tray: TrayManager
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private runningTaskIds = new Set<string>()
  private pendingTriggers = new Map<string, number>() // taskId → timestamp when triggered

  private static POLL_INTERVAL = 30_000 // 30 seconds

  constructor(win: BrowserWindow, settings: SettingsStore, tray: TrayManager) {
    this.win = win
    this.settings = settings
    this.tray = tray
  }

  start(): void {
    console.log('[TaskScheduler] Starting polling (30s interval)')
    this.pollTimer = setInterval(() => this.tick(), TaskScheduler.POLL_INTERVAL)
    // First tick after 10s — let renderer initialize
    setTimeout(() => this.tick(), 10_000)
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    console.log('[TaskScheduler] Stopped')
  }

  private static PENDING_TIMEOUT = 120_000 // 2 minutes — clear stale pending triggers

  private tick(): void {
    // Skip if all schedules are paused
    if (this.settings.get('schedulerPausedAll')) return

    const tasks = (this.settings.get('v2_tasks') as ScheduledTask[] | null) || []
    const now = Date.now()
    let scheduledCount = 0

    // Clear stale pending triggers (renderer never acknowledged)
    for (const [taskId, triggeredAt] of this.pendingTriggers) {
      if (now - triggeredAt > TaskScheduler.PENDING_TIMEOUT) {
        console.log(`[TaskScheduler] Clearing stale pending trigger for ${taskId} (no ack in ${Math.round((now - triggeredAt) / 1000)}s)`)
        this.pendingTriggers.delete(taskId)
      }
    }

    for (const task of tasks) {
      if (!task.schedule?.enabled || task.schedule.interval === 'manual') continue
      scheduledCount++

      if (!task.schedule.nextRunAt) continue
      const nextRun = new Date(task.schedule.nextRunAt).getTime()
      if (isNaN(nextRun)) continue

      if (nextRun <= now) {
        // Don't double-trigger
        if (this.runningTaskIds.has(task.id)) continue
        if (this.pendingTriggers.has(task.id)) continue

        console.log(`[TaskScheduler] Triggering task "${task.title}" (${task.id}) — was due ${Math.round((now - nextRun) / 1000)}s ago`)
        this.pendingTriggers.set(task.id, now)
        this.send('scheduler:trigger-task', { taskId: task.id, trigger: 'scheduled' })
      }
    }

    this.tray.updateStatus({ scheduledCount })
  }

  onTaskStarted(taskId: string, taskTitle: string): void {
    console.log(`[TaskScheduler] Task started: "${taskTitle}" (${taskId})`)
    this.pendingTriggers.delete(taskId)
    this.runningTaskIds.add(taskId)
    this.updateTrayRunning()
  }

  onTaskCompleted(taskId: string, result: { status: string; summary: string; taskTitle: string }): void {
    console.log(`[TaskScheduler] Task completed: "${result.taskTitle}" (${taskId}) — ${result.status}`)
    this.pendingTriggers.delete(taskId)
    this.runningTaskIds.delete(taskId)
    this.updateTrayRunning()

    // Show notification
    const isSuccess = result.status !== 'failed'
    this.tray.showNotification(
      isSuccess ? `Task Completed: ${result.taskTitle}` : `Task Failed: ${result.taskTitle}`,
      result.summary || 'No summary available',
      () => {
        this.tray.showWindow()
        this.send('scheduler:navigate-to-task', taskId)
      },
    )
  }

  private updateTrayRunning(): void {
    const tasks = (this.settings.get('v2_tasks') as ScheduledTask[] | null) || []
    const names = [...this.runningTaskIds].map((id) => {
      return tasks.find((t) => t.id === id)?.title || id
    })
    this.tray.updateStatus({
      runningCount: this.runningTaskIds.size,
      taskNames: names,
    })
  }

  private send(channel: string, ...args: unknown[]): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(channel, ...args)
    }
  }
}
