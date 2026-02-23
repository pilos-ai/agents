import { execFile, spawn, ChildProcess } from 'child_process'
import { BrowserWindow, shell } from 'electron'
import fs from 'fs'
import path from 'path'

export interface CliCheckResult {
  available: boolean
  version?: string
  error?: string
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?(?:\x07|\x1b\\)/g, '')
}

export function getExpandedEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE || ''
    const localAppData = process.env.LOCALAPPDATA || ''
    env.Path = [
      `${home}\\.local\\bin`,
      `${home}\\.claude\\bin`,
      `${localAppData}\\Programs\\claude-code`,
      `${process.env.APPDATA || ''}\\npm`,
      env.Path || env.PATH || '',
    ].join(';')
  } else {
    const home = process.env.HOME || ''
    env.PATH = `/usr/local/bin:/opt/homebrew/bin:${home}/.local/bin:${home}/.claude/bin:${env.PATH || ''}`
  }
  return env
}

/**
 * Find the claude binary by checking known install locations.
 * Returns the full path if found, otherwise just 'claude' to rely on PATH.
 */
export function findClaudeBinary(): string {
  const candidates: string[] = []

  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE || ''
    const localAppData = process.env.LOCALAPPDATA || ''
    const appData = process.env.APPDATA || ''
    candidates.push(
      path.join(home, '.local', 'bin', 'claude.exe'),
      path.join(home, '.claude', 'bin', 'claude.exe'),
      path.join(localAppData, 'Programs', 'claude-code', 'claude.exe'),
      path.join(appData, 'npm', 'claude.cmd'),
      path.join(appData, 'npm', 'claude'),
    )
  } else {
    const home = process.env.HOME || ''
    candidates.push(
      path.join(home, '.local', 'bin', 'claude'),
      path.join(home, '.claude', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    )
  }

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch { /* ignore */ }
  }

  return 'claude'
}

export class CliChecker {
  private mainWindow: BrowserWindow
  private claudePath: string = 'claude'
  private openedUrls = new Set<string>()

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  async check(): Promise<CliCheckResult> {
    const env = getExpandedEnv()

    // Try PATH first, then scan known locations
    try {
      const output = await this.execWithTimeout('claude', ['--version'], env)
      this.claudePath = 'claude'
      return { available: true, version: output.trim() }
    } catch {
      // Not on PATH — try known install locations
    }

    const resolved = findClaudeBinary()
    if (resolved !== 'claude') {
      try {
        const output = await this.execWithTimeout(resolved, ['--version'], env)
        this.claudePath = resolved
        return { available: true, version: output.trim() }
      } catch (err) {
        return { available: false, error: String(err) }
      }
    }

    return { available: false, error: 'Claude CLI not found' }
  }

  async checkAuth(): Promise<{ authenticated: boolean; accountName?: string }> {
    const env = getExpandedEnv()
    try {
      const output = await this.execWithTimeout(this.claudePath, ['auth', 'status'], env)
      const text = output.toLowerCase()
      if (text.includes('not logged in') || text.includes('no active account') || text.includes('unauthenticated')) {
        return { authenticated: false }
      }
      const nameMatch = output.match(/(?:logged in as|account[:\s]+)(.+)/i)
      return { authenticated: true, accountName: nameMatch?.[1]?.trim() }
    } catch {
      return { authenticated: false }
    }
  }

  async login(): Promise<boolean> {
    const env = getExpandedEnv()

    return new Promise((resolve) => {
      const proc = spawn(this.claudePath, ['auth', 'login'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = stripAnsi(chunk.toString())
        this.send('cli:loginOutput', text)
        this.tryOpenUrl(text)
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = stripAnsi(chunk.toString())
        this.send('cli:loginOutput', text)
        this.tryOpenUrl(text)
      })

      proc.on('close', (code) => {
        resolve(code === 0)
      })

      proc.on('error', (err) => {
        this.send('cli:loginOutput', `Error: ${err.message}\n`)
        resolve(false)
      })
    })
  }

  async install(): Promise<boolean> {
    const env = getExpandedEnv()

    return new Promise((resolve) => {
      let proc: ChildProcess

      if (process.platform === 'win32') {
        const psPath = path.join(
          process.env.SYSTEMROOT || 'C:\\Windows',
          'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
        )
        proc = spawn(psPath, [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
          'irm https://claude.ai/install.ps1 | iex'
        ], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      } else {
        proc = spawn('bash', ['-c',
          'curl -fsSL https://claude.ai/install.sh | bash'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      }

      proc.stdout?.on('data', (chunk: Buffer) => {
        this.send('cli:installOutput', { stream: 'stdout', data: stripAnsi(chunk.toString()) })
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        this.send('cli:installOutput', { stream: 'stderr', data: stripAnsi(chunk.toString()) })
      })

      proc.on('close', (code) => {
        resolve(code === 0)
      })

      proc.on('error', (err) => {
        this.send('cli:installOutput', { stream: 'stderr', data: `Error: ${err.message}\n` })
        resolve(false)
      })
    })
  }

  private execWithTimeout(cmd: string, args: string[], env: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, { env, timeout: 10000 }, (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      })
    })
  }

  private tryOpenUrl(text: string): void {
    const match = text.match(/https?:\/\/[^\s]+/)
    if (match && !this.openedUrls.has(match[0])) {
      this.openedUrls.add(match[0])
      shell.openExternal(match[0]).catch(() => {})
    }
  }

  private send(channel: string, data: unknown): void {
    if (this.mainWindow?.isDestroyed()) return
    this.mainWindow.webContents.send(channel, data)
  }
}
