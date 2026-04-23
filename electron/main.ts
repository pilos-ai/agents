import { app, BrowserWindow, Menu, ipcMain, clipboard } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerIpcHandlers } from './ipc-handlers'
import { registerMobileHandlers } from './handlers/mobile'
import { registerMetricsHandlers } from './handlers/metrics'
import { registerSchedulerHandlers } from './handlers/scheduler'
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

const PROTOCOL = 'pilos'

// Single-instance lock — required so pilos:// links on Windows/Linux route to
// the running app instead of spawning a second process.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// Register as default handler for pilos:// URLs. In dev, Electron needs the
// executable path + a script arg so the OS can re-launch us with the URL.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

let mainWindow: BrowserWindow | null = null
let metricsCollector: MetricsCollector | null = null
let trayManager: TrayManager | null = null
let taskScheduler: TaskScheduler | null = null
let relayClient: RelayClient | null = null
let isQuitting = false

// Deep link handling. URL may arrive before mainWindow / renderer is ready —
// queue it and flush once the window reports it has loaded.
let pendingDeepLink: string | null = null
let rendererReady = false

function parseDeepLink(url: string): { action: string; params: Record<string, string> } | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${PROTOCOL}:`) return null
    // pilos://activate?key=...&email=... — URL parses host as 'activate'
    const action = parsed.hostname || parsed.pathname.replace(/^\/+/, '')
    const params: Record<string, string> = {}
    parsed.searchParams.forEach((v, k) => { params[k] = v })
    return { action, params }
  } catch {
    return null
  }
}

function sendDeepLinkToRenderer(url: string) {
  const parsed = parseDeepLink(url)
  if (!parsed) return
  mainWindow?.webContents.send('deeplink:received', parsed)
}

function handleDeepLink(url: string) {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
  if (rendererReady && mainWindow) {
    sendDeepLinkToRenderer(url)
  } else {
    pendingDeepLink = url
  }
}

// Find a pilos:// URL in the argv array (Windows/Linux pass it on launch or second-instance).
function findProtocolUrlInArgv(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) || null
}

// macOS: URL is delivered via the open-url event (app already running or cold start).
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// Windows/Linux: second launch with the URL in argv — focus the running window and route the URL.
app.on('second-instance', (_event, argv) => {
  const url = findProtocolUrlInArgv(argv)
  if (url) handleDeepLink(url)
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

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
      backgroundThrottling: false,
    },
    show: false,
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true
    if (pendingDeepLink) {
      sendDeepLinkToRenderer(pendingDeepLink)
      pendingDeepLink = null
    }
  })

  const settings = new SettingsStore()
  let database: Database
  try {
    database = new Database()
  } catch (err) {
    console.error('Failed to open database:', err)
    // Show error in renderer and quit — the app cannot function without a database
    const safeErr = String(err).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow!.webContents.executeJavaScript(
        `document.body.innerHTML = '<div style="color:#f87171;padding:2rem;font-family:monospace">Failed to open database: ${safeErr}.<br>Check that the app data directory is writable.</div>'`
      )
    })
    app.quit()
    return
  }
  setupMenu(mainWindow, settings)

  metricsCollector = new MetricsCollector(database, settings)
  metricsCollector.init()

  // Store last right-click spell params so IPC shell:showContextMenu can include suggestions
  let lastSpellParams: { misspelledWord: string; suggestions: string[] } | null = null
  mainWindow.webContents.on('context-menu', (_event, params) => {
    lastSpellParams = params.misspelledWord
      ? { misspelledWord: params.misspelledWord, suggestions: params.dictionarySuggestions.slice(0, 5) }
      : null

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
      items.push(
        { role: 'cut' },
        { role: 'copy' },
        { type: 'separator' },
        { label: 'Paste', click: () => mainWindow?.webContents.send('paste:text', clipboard.readText()) },
        { role: 'selectAll' },
      )
      Menu.buildFromTemplate(items).popup({ window: mainWindow ?? undefined })
    }
  })

  let claudeProcess, db
  try {
    const refs = await registerIpcHandlers(mainWindow, settings, database, metricsCollector, () => lastSpellParams)
    claudeProcess = refs.claudeProcess
    db = refs.database
  } catch (err) {
    console.error('Failed to register IPC handlers:', err)
  }

  if (claudeProcess && db) {
    relayClient = new RelayClient(mainWindow, settings, claudeProcess, db)
    const pilosAuth = settings.get('pilos_auth') as { licenseKey?: string; features?: string[] } | null
    if (pilosAuth?.features?.includes('devices')) relayClient.connect()
  }

  registerMobileHandlers(() => relayClient)
  registerMetricsHandlers(settings, () => metricsCollector, () => relayClient)

  setupAutoUpdater(mainWindow)
  ipcMain.handle('update:install', () => {
    isQuitting = true
    installUpdate()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.get('backgroundMode') !== false) {
      event.preventDefault()
      mainWindow!.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  trayManager = new TrayManager(mainWindow, settings)
  trayManager.init()

  taskScheduler = new TaskScheduler(mainWindow, settings, trayManager)
  taskScheduler.start()

  registerSchedulerHandlers(() => taskScheduler)
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
  // Windows/Linux cold start with pilos:// URL — capture before window exists.
  const coldStartUrl = findProtocolUrlInArgv(process.argv)
  if (coldStartUrl) pendingDeepLink = coldStartUrl
  createWindow()
})

app.on('window-all-closed', () => {
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
