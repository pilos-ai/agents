import pkg from 'electron-updater'
import { BrowserWindow } from 'electron'

const { autoUpdater } = pkg

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Don't check for updates in dev mode
  if (process.env.VITE_DEV_SERVER_URL) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    send(mainWindow, 'update:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    send(mainWindow, 'update:status', {
      status: 'available',
      version: info.version,
    })
  })

  autoUpdater.on('update-not-available', () => {
    send(mainWindow, 'update:status', { status: 'up-to-date' })
  })

  autoUpdater.on('download-progress', (progress) => {
    send(mainWindow, 'update:status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send(mainWindow, 'update:status', {
      status: 'ready',
      version: info.version,
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message)
    send(mainWindow, 'update:status', {
      status: 'error',
      error: err.message,
    })
  })

  // Check for updates after a short delay to not block startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.error('[AutoUpdater] Check failed:', err.message)
    })
  }, 5000)
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err: Error) => {
    console.error('[AutoUpdater] Manual check failed:', err.message)
  })
}

function send(win: BrowserWindow, channel: string, data: unknown): void {
  if (win?.isDestroyed()) return
  win.webContents.send(channel, data)
}
