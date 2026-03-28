import { ipcMain, shell, Menu, clipboard, BrowserWindow } from 'electron'

type SpellParams = { misspelledWord: string; suggestions: string[] } | null

export function registerShellHandlers(getSpellParams?: () => SpellParams) {
  ipcMain.handle('shell:openPath', (_event, p: string) => shell.openPath(p))

  ipcMain.handle('shell:showContextMenu', (event, text: string, isEditable?: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const spell = getSpellParams?.()
    const items: Electron.MenuItemConstructorOptions[] = []

    if (spell?.suggestions.length) {
      for (const s of spell.suggestions) {
        items.push({
          label: s,
          click: () => win?.webContents.replaceMisspelling(s),
        })
      }
      items.push({ type: 'separator' })
      items.push({
        label: 'Add to Dictionary',
        click: () => win?.webContents.session.addWordToSpellCheckerDictionary(spell.misspelledWord),
      })
      items.push({ type: 'separator' })
    }

    if (text) {
      items.push({
        label: 'Copy',
        accelerator: 'CmdOrCtrl+C',
        click: () => clipboard.writeText(text),
      })
    }
    if (isEditable) {
      if (text) items.push({ type: 'separator' })
      items.push({ role: 'paste' })
    }
    items.push({ role: 'selectAll' })
    Menu.buildFromTemplate(items).popup({ window: win ?? undefined })
  })
}
