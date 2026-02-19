import { BrowserWindow } from 'electron'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// node-pty types
interface IPty {
  onData: (callback: (data: string) => void) => void
  onExit: (callback: (e: { exitCode: number }) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

interface PtyOptions {
  cols?: number
  rows?: number
  cwd?: string
  shell?: string
}

export class TerminalManager {
  private terminals = new Map<string, IPty>()
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  async create(id: string, options: PtyOptions = {}): Promise<void> {
    // Dynamic import for native module
    const pty = require('node-pty')

    const shell = options.shell || (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh')
    const cols = options.cols || 80
    const rows = options.rows || 24
    const cwd = options.cwd || process.env.HOME || '/'

    const terminal: IPty = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    })

    this.terminals.set(id, terminal)

    terminal.onData((data: string) => {
      if (this.mainWindow?.isDestroyed()) return
      this.mainWindow.webContents.send('terminal:data', id, data)
    })

    terminal.onExit(({ exitCode }: { exitCode: number }) => {
      this.terminals.delete(id)
      if (this.mainWindow?.isDestroyed()) return
      this.mainWindow.webContents.send('terminal:exit', id, exitCode)
    })
  }

  write(id: string, data: string): void {
    this.terminals.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.terminals.get(id)?.resize(cols, rows)
  }

  destroy(id: string): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return
    try {
      terminal.kill()
    } catch {
      // Already dead
    }
    this.terminals.delete(id)
  }

  destroyAll(): void {
    for (const [id] of this.terminals) {
      this.destroy(id)
    }
  }
}
