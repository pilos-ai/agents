import { execFile } from 'child_process'
import { BrowserWindow, shell, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { SettingsStore } from './settings-store'
import { getExpandedEnv, findClaudeBinary } from './cli-checker'

export type DependencyName = 'git' | 'node' | 'claude'
export type DependencyItemStatus = 'checking' | 'found' | 'not_found' | 'error'

export interface DependencyInfo {
  name: DependencyName
  status: DependencyItemStatus
  version?: string
  path?: string
  error?: string
}

export interface DependencyCheckResult {
  git: DependencyInfo
  node: DependencyInfo
  claude: DependencyInfo
  allFound: boolean
}

export interface DependencyInstallInfo {
  url: string
  command?: string
  instructions: string
}

export class DependencyChecker {
  private mainWindow: BrowserWindow
  private settings: SettingsStore
  private resolvedPaths: Map<DependencyName, string> = new Map()

  constructor(mainWindow: BrowserWindow, settings: SettingsStore) {
    this.mainWindow = mainWindow
    this.settings = settings
    this.loadCachedPaths()
  }

  async checkAll(): Promise<DependencyCheckResult> {
    const [git, node, claude] = await Promise.all([
      this.checkGit(),
      this.checkNode(),
      this.checkClaude(),
    ])
    return {
      git,
      node,
      claude,
      allFound: git.status === 'found' && node.status === 'found' && claude.status === 'found',
    }
  }

  async checkGit(): Promise<DependencyInfo> {
    const customPath = this.getCustomPath('git')
    if (customPath) {
      try {
        const version = await this.execWithTimeout(customPath, ['--version'])
        this.resolvedPaths.set('git', customPath)
        return { name: 'git', status: 'found', version: version.trim(), path: customPath }
      } catch { /* custom path invalid, fall through */ }
    }

    const binary = this.findGitBinary()
    try {
      const version = await this.execWithTimeout(binary, ['--version'])
      this.resolvedPaths.set('git', binary)
      this.cachePath('git', binary)
      return { name: 'git', status: 'found', version: version.trim(), path: binary }
    } catch {
      return { name: 'git', status: 'not_found' }
    }
  }

  async checkNode(): Promise<DependencyInfo> {
    const customPath = this.getCustomPath('node')
    if (customPath) {
      try {
        const version = await this.execWithTimeout(customPath, ['--version'])
        this.resolvedPaths.set('node', customPath)
        return { name: 'node', status: 'found', version: version.trim(), path: customPath }
      } catch { /* custom path invalid, fall through */ }
    }

    const binary = this.findNodeBinary()
    try {
      const version = await this.execWithTimeout(binary, ['--version'])
      this.resolvedPaths.set('node', binary)
      this.cachePath('node', binary)
      return { name: 'node', status: 'found', version: version.trim(), path: binary }
    } catch {
      return { name: 'node', status: 'not_found' }
    }
  }

  async checkClaude(): Promise<DependencyInfo> {
    const env = getExpandedEnv(this.getExtraBinDirs())
    const binary = findClaudeBinary()

    // Try PATH first
    try {
      const version = await this.execWithTimeout('claude', ['--version'], env)
      this.resolvedPaths.set('claude', 'claude')
      return { name: 'claude', status: 'found', version: version.trim(), path: 'claude' }
    } catch { /* not on PATH */ }

    // Try known locations
    if (binary !== 'claude') {
      try {
        const version = await this.execWithTimeout(binary, ['--version'], env)
        this.resolvedPaths.set('claude', binary)
        this.cachePath('claude', binary)
        return { name: 'claude', status: 'found', version: version.trim(), path: binary }
      } catch { /* not found */ }
    }

    // Check custom path
    const customPath = this.getCustomPath('claude')
    if (customPath) {
      try {
        const version = await this.execWithTimeout(customPath, ['--version'], env)
        this.resolvedPaths.set('claude', customPath)
        return { name: 'claude', status: 'found', version: version.trim(), path: customPath }
      } catch { /* custom path invalid */ }
    }

    return { name: 'claude', status: 'not_found' }
  }

  async setCustomPath(tool: DependencyName, binaryPath: string): Promise<DependencyInfo> {
    try {
      const version = await this.execWithTimeout(binaryPath, ['--version'])
      this.resolvedPaths.set(tool, binaryPath)
      this.cachePath(tool, binaryPath)
      return { name: tool, status: 'found', version: version.trim(), path: binaryPath }
    } catch (err) {
      return { name: tool, status: 'error', error: `Invalid binary: ${String(err)}` }
    }
  }

  async browseForBinary(tool: DependencyName): Promise<DependencyInfo | null> {
    const filters = process.platform === 'win32'
      ? [{ name: 'Executables', extensions: ['exe', 'cmd', 'bat'] }, { name: 'All Files', extensions: ['*'] }]
      : []
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: `Locate ${tool} binary`,
      properties: ['openFile'],
      filters,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return this.setCustomPath(tool, result.filePaths[0])
  }

  getInstallInfo(tool: DependencyName): DependencyInstallInfo {
    const platform = process.platform
    switch (tool) {
      case 'git':
        if (platform === 'win32') {
          return {
            url: 'https://git-scm.com/download/win',
            instructions: 'Download and run the Git for Windows installer. Portable Git is also supported.',
          }
        } else if (platform === 'darwin') {
          return {
            url: 'https://git-scm.com/download/mac',
            command: 'xcode-select --install',
            instructions: 'Install Xcode Command Line Tools, or use Homebrew: brew install git',
          }
        }
        return {
          url: 'https://git-scm.com/download/linux',
          command: 'sudo apt install git',
          instructions: 'Install via your package manager.',
        }

      case 'node':
        if (platform === 'win32') {
          return {
            url: 'https://nodejs.org/',
            instructions: 'Download the LTS installer from nodejs.org. Make sure "Add to PATH" is checked.',
          }
        } else if (platform === 'darwin') {
          return {
            url: 'https://nodejs.org/',
            command: 'brew install node',
            instructions: 'Install via Homebrew or download from nodejs.org.',
          }
        }
        return {
          url: 'https://nodejs.org/',
          command: 'sudo apt install nodejs npm',
          instructions: 'Install via your package manager or use nvm.',
        }

      case 'claude':
        if (platform === 'win32') {
          return {
            url: 'https://claude.ai/download',
            command: 'npm install -g @anthropic-ai/claude-code',
            instructions: 'Install via npm (requires Node.js) or use the PowerShell installer.',
          }
        }
        return {
          url: 'https://claude.ai/download',
          command: 'npm install -g @anthropic-ai/claude-code',
          instructions: 'Install via npm or use the shell installer.',
        }
    }
  }

  openInstallPage(tool: DependencyName): void {
    const info = this.getInstallInfo(tool)
    shell.openExternal(info.url).catch(() => {})
  }

  /** Get extra bin directories from resolved dependency paths (for PATH expansion) */
  getExtraBinDirs(): string[] {
    const dirs: string[] = []
    for (const [, binPath] of this.resolvedPaths) {
      if (binPath && !['git', 'node', 'claude'].includes(binPath)) {
        const dir = path.dirname(binPath)
        if (!dirs.includes(dir)) dirs.push(dir)
      }
    }
    return dirs
  }

  // ── Private: Binary Discovery ──

  private findGitBinary(): string {
    const candidates: string[] = []
    const home = os.homedir()

    if (process.platform === 'win32') {
      const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
      const localAppData = process.env.LOCALAPPDATA || ''
      const userProfile = process.env.USERPROFILE || home

      candidates.push(
        path.join(programFiles, 'Git', 'cmd', 'git.exe'),
        path.join(programFilesX86, 'Git', 'cmd', 'git.exe'),
        path.join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe'),
        path.join(userProfile, 'scoop', 'shims', 'git.exe'),
        'C:\\ProgramData\\chocolatey\\bin\\git.exe',
        // PortableGit common locations
        path.join(localAppData, 'PortableGit', 'cmd', 'git.exe'),
        path.join(programFiles, 'PortableGit', 'cmd', 'git.exe'),
        path.join(userProfile, 'PortableGit', 'cmd', 'git.exe'),
      )
    } else if (process.platform === 'darwin') {
      candidates.push(
        '/opt/homebrew/bin/git',
        '/usr/local/bin/git',
        '/usr/bin/git',
      )
    } else {
      candidates.push(
        '/usr/bin/git',
        '/usr/local/bin/git',
        '/snap/bin/git',
      )
    }

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p
      } catch { /* ignore */ }
    }

    return 'git'
  }

  private findNodeBinary(): string {
    const candidates: string[] = []
    const home = os.homedir()

    if (process.platform === 'win32') {
      const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
      const localAppData = process.env.LOCALAPPDATA || ''
      const appData = process.env.APPDATA || ''
      const userProfile = process.env.USERPROFILE || home

      candidates.push(
        path.join(programFiles, 'nodejs', 'node.exe'),
        path.join(programFilesX86, 'nodejs', 'node.exe'),
        path.join(localAppData, 'Programs', 'nodejs', 'node.exe'),
        path.join(userProfile, 'scoop', 'shims', 'node.exe'),
        'C:\\ProgramData\\chocolatey\\bin\\node.exe',
      )

      // nvm-windows
      candidates.push(...this.scanVersionedDir(path.join(appData, 'nvm'), 'node.exe'))
      candidates.push(...this.scanVersionedDir(path.join(userProfile, '.nvm'), 'node.exe'))

      // fnm
      candidates.push(...this.scanVersionedDir(path.join(localAppData, 'fnm_multishells'), 'node.exe'))
    } else if (process.platform === 'darwin') {
      candidates.push(
        '/opt/homebrew/bin/node',
        '/usr/local/bin/node',
      )
      // nvm
      candidates.push(...this.scanVersionedDir(path.join(home, '.nvm', 'versions', 'node'), 'bin/node'))
      // fnm
      candidates.push(...this.scanVersionedDir(path.join(home, '.local', 'share', 'fnm', 'node-versions'), 'installation/bin/node'))
    } else {
      candidates.push(
        '/usr/bin/node',
        '/usr/local/bin/node',
        '/snap/bin/node',
      )
      // nvm
      candidates.push(...this.scanVersionedDir(path.join(home, '.nvm', 'versions', 'node'), 'bin/node'))
      // fnm
      candidates.push(...this.scanVersionedDir(path.join(home, '.local', 'share', 'fnm', 'node-versions'), 'installation/bin/node'))
    }

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p
      } catch { /* ignore */ }
    }

    return 'node'
  }

  /** Scan a directory of version subdirectories (e.g. ~/.nvm/versions/node/) for a binary */
  private scanVersionedDir(baseDir: string, binarySubpath: string): string[] {
    try {
      if (!fs.existsSync(baseDir)) return []
      const entries = fs.readdirSync(baseDir)
      return entries
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map(entry => path.join(baseDir, entry, binarySubpath))
    } catch {
      return []
    }
  }

  // ── Private: Settings Cache ──

  private loadCachedPaths(): void {
    const cached = this.settings.get('dependencyPaths') as Record<string, string> | null
    if (cached) {
      for (const [tool, p] of Object.entries(cached)) {
        this.resolvedPaths.set(tool as DependencyName, p)
      }
    }
  }

  private cachePath(tool: DependencyName, binaryPath: string): void {
    const cached = (this.settings.get('dependencyPaths') as Record<string, string>) || {}
    cached[tool] = binaryPath
    this.settings.set('dependencyPaths', cached)
  }

  private getCustomPath(tool: DependencyName): string | null {
    const cached = (this.settings.get('dependencyPaths') as Record<string, string>) || {}
    return cached[tool] || null
  }

  // ── Private: Exec ──

  private execWithTimeout(cmd: string, args: string[], env?: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, { env: env || process.env as Record<string, string>, timeout: 10000 }, (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      })
    })
  }
}
