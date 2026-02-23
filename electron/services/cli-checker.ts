import { execFile, spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'

export interface CliCheckResult {
  available: boolean
  version?: string
  error?: string
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?(?:\x07|\x1b\\)/g, '')
}

function getExpandedEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE || ''
    const localAppData = process.env.LOCALAPPDATA || ''
    env.Path = [
      `${home}\\.local\\bin`,
      `${localAppData}\\Programs\\claude-code`,
      env.Path || env.PATH || '',
    ].join(';')
  } else {
    const home = process.env.HOME || ''
    env.PATH = `/usr/local/bin:/opt/homebrew/bin:${home}/.local/bin:${env.PATH || ''}`
  }
  return env
}

export class CliChecker {
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  async check(): Promise<CliCheckResult> {
    const env = getExpandedEnv()

    try {
      const output = await this.execWithTimeout('claude', ['--version'], env)
      return { available: true, version: output.trim() }
    } catch (err) {
      return { available: false, error: String(err) }
    }
  }

  async checkAuth(): Promise<{ authenticated: boolean; accountName?: string }> {
    const env = getExpandedEnv()
    try {
      const output = await this.execWithTimeout('claude', ['auth', 'status'], env)
      // If the command succeeds and doesn't indicate "not logged in", we're authenticated
      const text = output.toLowerCase()
      if (text.includes('not logged in') || text.includes('no active account') || text.includes('unauthenticated')) {
        return { authenticated: false }
      }
      // Try to extract account name from output
      const nameMatch = output.match(/(?:logged in as|account[:\s]+)(.+)/i)
      return { authenticated: true, accountName: nameMatch?.[1]?.trim() }
    } catch {
      // Command failed — likely not authenticated or auth command not supported
      return { authenticated: false }
    }
  }

  async login(): Promise<boolean> {
    const env = getExpandedEnv()

    return new Promise((resolve) => {
      const proc = spawn('claude', ['login'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      proc.stdout?.on('data', (chunk: Buffer) => {
        this.send('cli:loginOutput', chunk.toString())
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        this.send('cli:loginOutput', chunk.toString())
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
        const psPath = `${process.env.SYSTEMROOT || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
        proc = spawn(psPath, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
          'irm https://claude.ai/install.ps1 | iex'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
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

  private send(channel: string, data: unknown): void {
    if (this.mainWindow?.isDestroyed()) return
    this.mainWindow.webContents.send(channel, data)
  }
}
