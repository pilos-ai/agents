import { app, Menu, shell, BrowserWindow, ipcMain, MenuItemConstructorOptions } from 'electron'
import { SettingsStore } from './services/settings-store'
import { checkForUpdates } from './services/auto-updater'

let win: BrowserWindow
let settings: SettingsStore
let activeProject: { path: string; name: string } | null = null

function send(channel: string, ...args: unknown[]) {
  if (!win.isDestroyed()) win.webContents.send(channel, ...args)
}

function rebuildMenu() {
  const isMac = process.platform === 'darwin'
  const isDev = !app.isPackaged
  const recentProjects = settings.getRecentProjects()

  const template: MenuItemConstructorOptions[] = []

  // ── App Menu (macOS only) ──
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        {
          label: 'Check for Updates...',
          click: () => checkForUpdates(),
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => send('menu:openSettings'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  // ── File ──
  template.push({
    label: 'File',
    submenu: [
      {
        label: 'Open Project...',
        accelerator: 'CmdOrCtrl+O',
        click: () => send('menu:openProject'),
      },
      {
        label: 'New Conversation',
        accelerator: 'CmdOrCtrl+N',
        click: () => send('menu:newConversation'),
      },
      { type: 'separator' },
      ...(isMac
        ? [{ role: 'close' as const }]
        : [
            { type: 'separator' as const },
            {
              label: 'Settings...',
              accelerator: 'CmdOrCtrl+,',
              click: () => send('menu:openSettings'),
            },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ]),
    ],
  })

  // ── Edit ──
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  })

  // ── Project ──
  const projectSubmenu: MenuItemConstructorOptions[] = []

  if (activeProject) {
    projectSubmenu.push(
      { label: activeProject.name, enabled: false },
      { type: 'separator' },
      {
        label: 'Project Settings...',
        click: () => send('menu:openProjectSettings'),
      },
      {
        label: 'Close Project',
        click: () => send('menu:closeProject', activeProject!.path),
      },
    )
  } else {
    projectSubmenu.push({ label: 'No Open Project', enabled: false })
  }

  if (recentProjects.length > 0) {
    projectSubmenu.push(
      { type: 'separator' },
      {
        label: 'Open Recent',
        submenu: recentProjects.slice(0, 10).map((p) => ({
          label: p.name,
          click: () => send('menu:openRecentProject', p.path),
        })),
      },
    )
  }

  template.push({ label: 'Project', submenu: projectSubmenu })

  // ── View ──
  const viewSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Toggle Terminal',
      accelerator: 'CmdOrCtrl+`',
      click: () => send('menu:toggleRightPanel'),
    },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ]

  if (isDev) {
    viewSubmenu.push(
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
    )
  }

  template.push({ label: 'View', submenu: viewSubmenu })

  // ── Window ──
  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
    ],
  })

  // ── Help ──
  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'Documentation',
        click: () => shell.openExternal('https://pilos.net/docs'),
      },
      {
        label: 'Report Issue',
        click: () => shell.openExternal('https://github.com/pilos-ai/agents/issues'),
      },
    ],
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function setupMenu(mainWindow: BrowserWindow, settingsStore: SettingsStore) {
  win = mainWindow
  settings = settingsStore

  // Build initial menu
  rebuildMenu()

  // Listen for renderer updates
  ipcMain.on('menu:setActiveProject', (_event, project: { path: string; name: string } | null) => {
    activeProject = project
    rebuildMenu()
  })

  ipcMain.on('menu:rebuildMenu', () => {
    rebuildMenu()
  })
}
