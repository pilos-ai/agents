import { execFile, spawn } from 'child_process'
import { BrowserWindow } from 'electron'

export interface CliCheckResult {
  available: boolean
  version?: string
  npmAvailable: boolean
  error?: string
}

function getExpandedEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  const home = process.env.HOME || ''
  env.PATH = `/usr/local/bin:/opt/homebrew/bin:${home}/.local/bin:${env.PATH || ''}`
  return env
}

export class CliChecker {
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  async check(): Promise<CliCheckResult> {
    const env = getExpandedEnv()

    const [claude, npm] = await Promise.allSettled([
      this.execWithTimeout('claude', ['--version'], env),
      this.execWithTimeout('npm', ['--version'], env),
    ])

    const available = claude.status === 'fulfilled'
    const version = available ? claude.value.trim() : undefined
    const npmAvailable = npm.status === 'fulfilled'
    const error = !available && claude.status === 'rejected'
      ? String(claude.reason)
      : undefined

    return { available, version, npmAvailable, error }
  }

  async install(): Promise<boolean> {
    const env = getExpandedEnv()

    return new Promise((resolve) => {
      const proc = spawn('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      proc.stdout?.on('data', (chunk: Buffer) => {
        this.send('cli:installOutput', { stream: 'stdout', data: chunk.toString() })
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        this.send('cli:installOutput', { stream: 'stderr', data: chunk.toString() })
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
