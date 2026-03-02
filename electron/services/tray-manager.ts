import { Tray, Menu, nativeImage, app, BrowserWindow, Notification } from 'electron'
import path from 'path'
import type { SettingsStore } from './settings-store'

export interface TrayTaskStatus {
  runningCount: number
  taskNames: string[]
  scheduledCount: number
  pausedAll: boolean
}

export class TrayManager {
  private tray: Tray | null = null
  private win: BrowserWindow
  private settings: SettingsStore
  private status: TrayTaskStatus = {
    runningCount: 0,
    taskNames: [],
    scheduledCount: 0,
    pausedAll: false,
  }

  constructor(win: BrowserWindow, settings: SettingsStore) {
    this.win = win
    this.settings = settings
    this.status.pausedAll = !!this.settings.get('schedulerPausedAll')
  }

  init(): void {
    // Create a 22x22 template icon — diamond shape matching the app icon
    // Template images auto-adapt to macOS light/dark menu bar
    const icon = this.createTrayIcon()
    this.tray = new Tray(icon)
    this.tray.setToolTip('Pilos Agents')
    this.rebuildMenu()

    // Click on tray shows the window (macOS convention)
    this.tray.on('double-click', () => this.showWindow())
  }

  private createTrayIcon(): Electron.NativeImage {
    // Use the app icon resized to 16x16 for the menu bar
    // Try packaged path first, then dev path
    const appPath = app.getAppPath()
    const iconPaths = [
      path.join(process.resourcesPath || appPath, 'icon.png'),
      path.join(appPath, 'resources', 'icon.png'),
      path.join(appPath, '..', 'resources', 'icon.png'),
    ]

    // macOS uses 16x16 (retina handled automatically), Windows/Linux use 32x32
    const iconSize = process.platform === 'darwin' ? 16 : 32

    for (const iconPath of iconPaths) {
      try {
        const img = nativeImage.createFromPath(iconPath)
        if (!img.isEmpty()) {
          const resized = img.resize({ width: iconSize, height: iconSize })
          // setTemplateImage makes macOS auto-adapt for light/dark menu bar (no-op on other platforms)
          if (process.platform === 'darwin') resized.setTemplateImage(true)
          return resized
        }
      } catch {
        // Try next path
      }
    }

    // Fallback: 16x16 black diamond PNG as base64
    const fallbackPng = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQklEQVR4nGNgoDH4D8UUaSbLEHTNJBmCSzNRhuBSTJQh2BRhY2M1BJ9mogyh2ACKvUCVQMSlmKppgSRAkWZ0Q2gHAM9NY53+2zQ8AAAAAElFTkSuQmCC'
    const img = nativeImage.createFromDataURL(`data:image/png;base64,${fallbackPng}`)
    if (process.platform !== 'darwin' ) {
      return img.resize({ width: 32, height: 32 })
    }
    img.setTemplateImage(true)
    return img
  }

  private rebuildMenu(): void {
    if (!this.tray) return

    const menuItems: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Show Pilos Agents',
        click: () => this.showWindow(),
      },
      { type: 'separator' },
    ]

    // Running tasks indicator
    if (this.status.runningCount > 0) {
      menuItems.push({
        label: `Running: ${this.status.taskNames.join(', ')}`,
        enabled: false,
      })
    } else {
      menuItems.push({
        label: 'No tasks running',
        enabled: false,
      })
    }

    menuItems.push({
      label: `${this.status.scheduledCount} scheduled task${this.status.scheduledCount !== 1 ? 's' : ''}`,
      enabled: false,
    })

    menuItems.push({ type: 'separator' })

    menuItems.push({
      label: this.status.pausedAll ? 'Resume All Schedules' : 'Pause All Schedules',
      click: () => {
        this.status.pausedAll = !this.status.pausedAll
        this.settings.set('schedulerPausedAll', this.status.pausedAll)
        this.send('scheduler:pause-all-changed', this.status.pausedAll)
        this.rebuildMenu()
      },
    })

    menuItems.push({ type: 'separator' })

    menuItems.push({
      label: 'Quit',
      click: () => app.quit(),
    })

    this.tray.setContextMenu(Menu.buildFromTemplate(menuItems))
  }

  showWindow(): void {
    if (this.win.isDestroyed()) return
    this.win.show()
    this.win.focus()
  }

  updateStatus(status: Partial<TrayTaskStatus>): void {
    Object.assign(this.status, status)
    this.rebuildMenu()

    const tooltip = this.status.runningCount > 0
      ? `Pilos Agents — ${this.status.runningCount} task${this.status.runningCount !== 1 ? 's' : ''} running`
      : `Pilos Agents — ${this.status.scheduledCount} scheduled`
    this.tray?.setToolTip(tooltip)
  }

  showNotification(title: string, body: string, onClick?: () => void): void {
    if (!Notification.isSupported()) return
    if (this.settings.get('notificationsEnabled') === false) return

    const notification = new Notification({ title, body })
    if (onClick) {
      notification.on('click', onClick)
    }
    notification.show()
  }

  private send(channel: string, ...args: unknown[]): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(channel, ...args)
    }
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
