import { ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export function revertFileEdit(filePath: string, oldString: string, newString: string): Promise<{ success: boolean; error?: string }>
export async function revertFileEdit(filePath: string, oldString: string, newString: string) {
  const content = await fs.readFile(filePath, 'utf-8')
  if (!content.includes(newString)) {
    return { success: false, error: 'Content no longer matches — file may have changed' }
  }
  await fs.writeFile(filePath, content.replace(newString, oldString), 'utf-8')
  return { success: true }
}

export async function readDir(
  dirPath: string,
  recursive?: boolean
): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
  const entries: { name: string; path: string; isDirectory: boolean }[] = []
  const items = await fs.readdir(dirPath, { withFileTypes: true })
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name)
    entries.push({ name: item.name, path: fullPath, isDirectory: item.isDirectory() })
    if (recursive && item.isDirectory()) {
      try {
        const subItems = await fs.readdir(fullPath, { withFileTypes: true })
        for (const sub of subItems) {
          entries.push({
            name: `${item.name}/${sub.name}`,
            path: path.join(fullPath, sub.name),
            isDirectory: sub.isDirectory(),
          })
        }
      } catch { /* skip unreadable dirs */ }
    }
  }
  return entries
}

export function registerFileHandlers() {
  ipcMain.handle('files:revertEdit', (_event, filePath: string, oldString: string, newString: string) =>
    revertFileEdit(filePath, oldString, newString)
  )

  ipcMain.handle('files:readFile', (_event, filePath: string) =>
    fs.readFile(filePath, 'utf-8')
  )

  ipcMain.handle('files:writeFile', (_event, filePath: string, content: string) =>
    fs.writeFile(filePath, content, 'utf-8')
  )

  ipcMain.handle('files:readDir', (_event, dirPath: string, recursive?: boolean) =>
    readDir(dirPath, recursive)
  )
}
