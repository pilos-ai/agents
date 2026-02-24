import { app, BrowserWindow, ipcMain, Menu } from 'electron'
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

  // Native context menu with spell check, Look Up, Share, etc.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = []

    // Spell check suggestions
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menuItems.push({
          label: suggestion,
          click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
        })
      }
      if (menuItems.length > 0) menuItems.push({ type: 'separator' })
      menuItems.push({
        label: 'Add to Dictionary',
        click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      })
      menuItems.push({ type: 'separator' })
    }

    // Look Up (macOS)
    if (process.platform === 'darwin' && params.selectionText) {
      menuItems.push({
        label: `Look Up "${params.selectionText.slice(0, 20)}${params.selectionText.length > 20 ? '...' : ''}"`,
        click: () => mainWindow?.webContents.showDefinitionForSelection(),
      })
      menuItems.push({ type: 'separator' })
    }

    // Standard edit actions
    if (params.isEditable) {
      menuItems.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      )
    } else if (params.selectionText) {
      menuItems.push({ role: 'copy' })
    }

    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup()
    }
  })

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
