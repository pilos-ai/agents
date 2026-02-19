import { BrowserWindow } from 'electron'
import { exec } from 'child_process'

export interface TrackedProcess {
  pid: number
  command: string
  startedAt: number
  status: 'running' | 'stopped' | 'exited'
  exitCode?: number
}

export class ProcessTracker {
  private processes = new Map<number, TrackedProcess>()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.startPolling()
  }

  track(pid: number, command: string): void {
    const proc: TrackedProcess = {
      pid,
      command,
      startedAt: Date.now(),
      status: 'running',
    }
    this.processes.set(pid, proc)
    this.emitUpdate()
  }

  list(): TrackedProcess[] {
    return Array.from(this.processes.values())
  }

  stop(pid: number): void {
    const proc = this.processes.get(pid)
    if (!proc || proc.status !== 'running') return

    try {
      process.kill(pid, 'SIGTERM')
      proc.status = 'stopped'
      this.emitUpdate()
    } catch {
      // Process already gone
      proc.status = 'exited'
      this.emitUpdate()
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      for (const [pid, proc] of this.processes) {
        if (proc.status !== 'running') continue

        try {
          // Check if process still alive (signal 0 = no signal, just check)
          process.kill(pid, 0)
        } catch {
          proc.status = 'exited'
          this.emitUpdate()
        }
      }
      // Clean up old exited processes (keep for 5 min)
      const cutoff = Date.now() - 5 * 60 * 1000
      for (const [pid, proc] of this.processes) {
        if (proc.status !== 'running' && proc.startedAt < cutoff) {
          this.processes.delete(pid)
        }
      }
    }, 3000)
  }

  private emitUpdate(): void {
    if (this.mainWindow?.isDestroyed()) return
    this.mainWindow.webContents.send('processes:update', this.list())
  }

  destroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval)
  }
}
