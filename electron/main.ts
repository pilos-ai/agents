import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerIpcHandlers } from './ipc-handlers'
import { SettingsStore } from './services/settings-store'
import { MetricsCollector } from './services/metrics-collector'
import { TrayManager } from './services/tray-manager'
import { TaskScheduler } from './services/task-scheduler'
import { Database } from './core/database'
import { setupMenu } from './menu'
import { ensureGlobalClaudeConfig } from './services/claude-config'
import { setupAutoUpdater, installUpdate } from './services/auto-updater'
import { RelayClient } from './services/relay-client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Set app name (shown in macOS menu bar during dev)
app.setName('Pilos Agents')

// Disable hardware acceleration to prevent GPU process crashes on macOS
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null
let metricsCollector: MetricsCollector | null = null
let trayManager: TrayManager | null = null
let taskScheduler: TaskScheduler | null = null
let relayClient: RelayClient | null = null
let isQuitting = false

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
    show: false,
  })

  // Load the page first so ready-to-show fires even if IPC setup fails
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
  })

  // Create shared settings instance and set up application menu
  const settings = new SettingsStore()
  const database = new Database()
  setupMenu(mainWindow, settings)

  // Metrics collector
  metricsCollector = new MetricsCollector(database, settings)
  metricsCollector.init()

  // Store last right-click spell params so IPC menu can include suggestions
  let lastSpellParams: { misspelledWord: string; suggestions: string[] } | null = null
  mainWindow.webContents.on('context-menu', (_event, params) => {
    lastSpellParams = params.misspelledWord
      ? { misspelledWord: params.misspelledWord, suggestions: params.dictionarySuggestions.slice(0, 5) }
      : null

    // Show native menu for editable elements (textarea) — handles spell check + Writing Tools
    if (params.isEditable) {
      const items: Electron.MenuItemConstructorOptions[] = []
      if (params.misspelledWord) {
        for (const s of params.dictionarySuggestions.slice(0, 5)) {
          items.push({ label: s, click: () => mainWindow?.webContents.replaceMisspelling(s) })
        }
        items.push({ type: 'separator' })
        items.push({ label: 'Add to Dictionary', click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) })
        items.push({ type: 'separator' })
      }
      items.push({ role: 'cut' }, { role: 'copy' }, { type: 'separator' }, { role: 'paste' }, { role: 'selectAll' })
      Menu.buildFromTemplate(items).popup({ window: mainWindow ?? undefined })
    }
  })

  // Register IPC after loadURL so a failure doesn't block the window
  let claudeProcess, db
  try {
    const refs = await registerIpcHandlers(mainWindow, settings, database, metricsCollector, () => lastSpellParams)
    claudeProcess = refs.claudeProcess
    db = refs.database
  } catch (err) {
    console.error('Failed to register IPC handlers:', err)
  }

  // Initialize mobile relay client
  if (claudeProcess && db) {
    relayClient = new RelayClient(mainWindow, settings, claudeProcess, db)
    const licenseKey = settings.get('licenseKey') as string
    if (licenseKey) {
      relayClient.connect()
    }
  }

  // IPC: mobile relay control
  ipcMain.handle('mobile:connect', () => relayClient?.connect())
  ipcMain.handle('mobile:disconnect', () => relayClient?.disconnect())
  ipcMain.handle('mobile:getStatus', () => ({
    connected: relayClient?.isConnected() ?? false,
    mobileCount: relayClient?.getMobileCount() ?? 0,
  }))

  // IPC: mobile pairing
  ipcMain.handle('mobile:requestPairingToken', () => relayClient?.requestPairingToken())
  ipcMain.handle('mobile:approvePairing', (_event, requestId: string) => relayClient?.approvePairing(requestId))
  ipcMain.handle('mobile:denyPairing', (_event, requestId: string) => relayClient?.denyPairing(requestId))
  ipcMain.handle('mobile:listPairedDevices', () => relayClient?.listPairedDevices())
  ipcMain.handle('mobile:revokeDevice', (_event, deviceId: string) => relayClient?.revokeDevice(deviceId))
  ipcMain.handle('mobile:broadcastUserMessage', (_event, conversationId: string, message: string, images?: Array<{ data: string; mediaType: string }>) => {
    relayClient?.broadcastUserMessage(conversationId, message, images)
  })

  // IPC: forward license key to metrics collector (and reconnect relay)
  ipcMain.handle('metrics:setLicenseKey', (_event, key: string) => {
    metricsCollector?.setLicenseKey(key)
    // Auto-connect relay when license key is set
    if (key && relayClient && !relayClient.isConnected()) {
      relayClient.connect()
    }
  })

  // IPC: expose machineId to renderer for license enforcement
  ipcMain.handle('metrics:getMachineId', () => {
    let id = settings.get('machineId') as string | null
    if (!id) {
      id = crypto.randomUUID()
      settings.set('machineId', id)
    }
    return id
  })

  // Set up auto-updater
  setupAutoUpdater(mainWindow)
  ipcMain.handle('update:install', () => installUpdate())


  // Hide-to-tray on close — keeps scheduler running in background (all platforms)
  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.get('backgroundMode') !== false) {
      event.preventDefault()
      mainWindow!.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Initialize tray (menu bar icon)
  trayManager = new TrayManager(mainWindow, settings)
  trayManager.init()

  // Initialize task scheduler
  taskScheduler = new TaskScheduler(mainWindow, settings, trayManager)
  taskScheduler.start()

  // Scheduler IPC: renderer reports task lifecycle events
  ipcMain.on('scheduler:task-started', (_event, data: { taskId: string; taskTitle: string }) => {
    taskScheduler?.onTaskStarted(data.taskId, data.taskTitle)
  })
  ipcMain.on('scheduler:task-completed', (_event, data: { taskId: string; status: string; summary: string; taskTitle: string }) => {
    taskScheduler?.onTaskCompleted(data.taskId, data)
  })
}

app.on('before-quit', async () => {
  isQuitting = true
  relayClient?.disconnect()
  taskScheduler?.stop()
  trayManager?.destroy()
  if (metricsCollector) {
    await metricsCollector.shutdown()
  }
})

app.whenReady().then(() => {
  ensureGlobalClaudeConfig()
  createWindow()
})

app.on('window-all-closed', () => {
  // Don't quit when background mode is active (tray keeps the app alive)
  if (process.platform !== 'darwin' && !trayManager) app.quit()
})

app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
