import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerIpcHandlers } from './ipc-handlers'
import { SettingsStore } from './services/settings-store'
import { MetricsCollector } from './services/metrics-collector'
import { Database } from './core/database'
import { setupMenu } from './menu'
import { ensureGlobalClaudeConfig } from './services/claude-config'
import { setupAutoUpdater, installUpdate } from './services/auto-updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Set app name (shown in macOS menu bar during dev)
app.setName('Pilos Agents')

// Disable hardware acceleration to prevent GPU process crashes on macOS
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null
let metricsCollector: MetricsCollector | null = null

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

  // Register IPC after loadURL so a failure doesn't block the window
  try {
    await registerIpcHandlers(mainWindow, settings, database, metricsCollector)
  } catch (err) {
    console.error('Failed to register IPC handlers:', err)
  }

  // IPC: forward license key to metrics collector
  ipcMain.handle('metrics:setLicenseKey', (_event, key: string) => {
    metricsCollector?.setLicenseKey(key)
  })

  // Set up auto-updater
  setupAutoUpdater(mainWindow)
  ipcMain.handle('update:install', () => installUpdate())

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('before-quit', async () => {
  if (metricsCollector) {
    await metricsCollector.shutdown()
  }
})

app.whenReady().then(() => {
  ensureGlobalClaudeConfig()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
