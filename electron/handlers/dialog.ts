import { ipcMain, dialog, shell, BrowserWindow } from 'electron'

export function registerDialogHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openPath', async (_event, options?: { directory?: boolean }) => {
    const properties: ('openFile' | 'openDirectory')[] = options?.directory
      ? ['openDirectory']
      : ['openFile', 'openDirectory']
    const result = await dialog.showOpenDialog(mainWindow, { properties })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:openExternal', (_event, url: string) =>
    shell.openExternal(url)
  )

  ipcMain.handle('dialog:saveFile', async (_event, options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: options?.defaultPath,
      filters: options?.filters || [{ name: 'Pilos Task', extensions: ['pilos'] }],
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('dialog:openFile', async (_event, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options?.filters || [{ name: 'Pilos Task', extensions: ['pilos'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
