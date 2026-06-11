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

// Second launch (Windows/Linux URL routing, or user re-clicking the dock/icon
// when the prior instance is hidden/zombied). Always make a window visible —
// if the existing one is gone (closed-to-tray crash, destroyed) we recreate.
// Without this, a stale prior instance silently swallows the launch and the
// user sees the new icon "do nothing" / "crash on open".
app.on('second-instance', (_event, argv) => {
  const url = findProtocolUrlInArgv(argv)
  if (url) handleDeepLink(url)
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  } else {
    createWindow()
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
    mainWindow.webContents.once('did-finish-load', () => {
      // JSON.stringify gives safe JS-string escaping for any error text,
      // avoiding the entity-escaping pitfall with JS string literal context.
      // Use innerText (not innerHTML) so error text is never parsed as HTML,
      // preventing injection via crafted filesystem paths.
      const safeErr = JSON.stringify(String(err))
      // The `\\n` (escaped here so the backtick interpolates the two-char
      // sequence `\n` into the JS source) becomes a proper newline escape
      // inside the single-quoted string literal at execute time.
      mainWindow!.webContents.executeJavaScript(
        `(function(){var d=document.createElement('div');d.style.cssText='color:#f87171;padding:2rem;font-family:monospace;white-space:pre-wrap';d.innerText='Failed to open database: '+${safeErr}+'.\\nCheck that the app data directory is writable.';document.body.replaceChildren(d)})()`
      )
    })
    app.quit()
    return
  }
  setupMenu(mainWindow, settings)

  metricsCollector = new MetricsCollector(database, settings)
  metricsCollector.init()

  // Build slow indexes after the window is ready so the main thread isn't
  // blocked during startup on large existing databases.
  mainWindow.webContents.once('did-finish-load', () => {
    database.buildIndexesDeferred()
  })

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
        {
          label: 'Paste',
          click: () => {
            if (!mainWindow) return
            const image = clipboard.readImage()
            if (!image.isEmpty()) {
              mainWindow.webContents.paste()
            } else {
              mainWindow.webContents.send('paste:text', clipboard.readText())
            }
          },
        },
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
  ipcMain.removeHandler('update:install')
  ipcMain.handle('update:install', () => {
    isQuitting = true
    installUpdate()
  })

  // Window controls (used by the in-app titlebar traffic lights / chrome).
  // Native traffic lights still work on macOS via the OS — these are additive.
  // removeHandler guards prevent "second handler" errors when createWindow()
  // is called again via the macOS `activate` event.
  ipcMain.removeHandler('window:minimize')
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.removeHandler('window:maximize')
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.removeHandler('window:close')
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.removeHandler('window:isMaximized')
  ipcMain.handle('window:isMaximized', () => !!mainWindow?.isMaximized())

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
