import { app, BrowserWindow } from 'electron'
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'
import { createWriteStream, createReadStream } from 'fs'
import { createGunzip } from 'zlib'
import { SettingsStore } from './settings-store'

export type DependencyName = 'git' | 'node' | 'claude'

/** Managed binary directory: ~/.pilos/bin/ */
function getManagedDir(): string {
  return path.join(os.homedir(), '.pilos')
}

function getBinDir(): string {
  return path.join(getManagedDir(), 'bin')
}

/** Send progress updates to the renderer */
function emitProgress(win: BrowserWindow, tool: DependencyName, message: string): void {
  if (!win.isDestroyed()) {
    win.webContents.send('deps:install-progress', { tool, message })
  }
}

// ── Node.js ──

/** Get Node.js download URL for the current platform */
function getNodeDownloadUrl(version: string): { url: string; filename: string; extractDir: string } {
  const platform = process.platform
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'

  if (platform === 'win32') {
    const filename = `node-${version}-win-${arch}.zip`
    return {
      url: `https://nodejs.org/dist/${version}/${filename}`,
      filename,
      extractDir: `node-${version}-win-${arch}`,
    }
  }

  const os = platform === 'darwin' ? 'darwin' : 'linux'
  const filename = `node-${version}-${os}-${arch}.tar.gz`
  return {
    url: `https://nodejs.org/dist/${version}/${filename}`,
    filename,
    extractDir: `node-${version}-${os}-${arch}`,
  }
}

/** Download a file with progress reporting */
async function downloadFile(url: string, destPath: string, win: BrowserWindow, tool: DependencyName): Promise<void> {
  emitProgress(win, tool, `Downloading ${path.basename(destPath)}...`)

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  if (!response.body) throw new Error('No response body')

  const totalBytes = Number(response.headers.get('content-length') || 0)
  let downloadedBytes = 0

  const fileStream = createWriteStream(destPath)
  const reader = response.body.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fileStream.write(Buffer.from(value))
    downloadedBytes += value.length
    if (totalBytes > 0) {
      const pct = Math.round((downloadedBytes / totalBytes) * 100)
      emitProgress(win, tool, `Downloading... ${pct}% (${Math.round(downloadedBytes / 1024 / 1024)}MB)`)
    }
  }

  fileStream.end()
  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve)
    fileStream.on('error', reject)
  })
}

/** Extract .tar.gz archive (macOS/Linux) */
async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  await fsp.mkdir(destDir, { recursive: true })
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['xzf', archivePath, '-C', destDir, '--strip-components=1'], {
      stdio: 'pipe',
    })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

/** Extract .zip archive (Windows) */
async function extractZip(archivePath: string, destDir: string): Promise<void> {
  await fsp.mkdir(destDir, { recursive: true })
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force`,
    ], { stdio: 'pipe' })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Expand-Archive exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

export async function installNode(win: BrowserWindow, settings: SettingsStore): Promise<string> {
  const version = 'v22.12.0' // LTS
  const { url, filename } = getNodeDownloadUrl(version)
  const managedDir = getManagedDir()
  const nodeDir = path.join(managedDir, 'node')
  const tmpDir = path.join(managedDir, 'tmp')

  await fsp.mkdir(tmpDir, { recursive: true })
  await fsp.mkdir(nodeDir, { recursive: true })

  const archivePath = path.join(tmpDir, filename)

  // Download
  await downloadFile(url, archivePath, win, 'node')

  // Extract
  emitProgress(win, 'node', 'Extracting Node.js...')
  if (process.platform === 'win32') {
    await extractZip(archivePath, nodeDir)
    // Zip extracts with a subdirectory, move contents up
    const extractedDir = (await fsp.readdir(nodeDir)).find(d => d.startsWith('node-'))
    if (extractedDir) {
      const subDir = path.join(nodeDir, extractedDir)
      const contents = await fsp.readdir(subDir)
      for (const item of contents) {
        await fsp.rename(path.join(subDir, item), path.join(nodeDir, item))
      }
      await fsp.rmdir(subDir)
    }
  } else {
    await extractTarGz(archivePath, nodeDir)
  }

  // Clean up archive
  await fsp.unlink(archivePath).catch(() => {})
  await fsp.rmdir(tmpDir).catch(() => {})

  // Determine binary path
  const nodeBin = process.platform === 'win32'
    ? path.join(nodeDir, 'node.exe')
    : path.join(nodeDir, 'bin', 'node')

  if (!fs.existsSync(nodeBin)) {
    throw new Error(`Node.js binary not found at ${nodeBin} after extraction`)
  }

  // Cache the path
  const cached = (settings.get('dependencyPaths') as Record<string, string>) || {}
  cached.node = nodeBin
  settings.set('dependencyPaths', cached)

  emitProgress(win, 'node', 'Node.js installed successfully!')
  return nodeBin
}

// ── Git ──

function getGitDownloadInfo(): { url: string; filename: string } | null {
  if (process.platform === 'win32') {
    const arch = process.arch === 'arm64' ? 'arm64' : '64'
    // MinGit is a lightweight portable Git for Windows (~50MB vs ~300MB)
    return {
      url: `https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/MinGit-2.47.1-${arch}-bit.zip`,
      filename: `MinGit-2.47.1-${arch}-bit.zip`,
    }
  }
  // macOS and Linux: can't easily bundle Git, use system install
  return null
}

export async function installGit(win: BrowserWindow, settings: SettingsStore): Promise<string> {
  if (process.platform === 'darwin') {
    // macOS: trigger Xcode Command Line Tools install
    emitProgress(win, 'git', 'Installing Xcode Command Line Tools (this may take a few minutes)...')
    return new Promise((resolve, reject) => {
      const proc = spawn('xcode-select', ['--install'], { stdio: 'pipe' })
      proc.on('close', () => {
        // xcode-select opens a dialog, check if git is now available
        setTimeout(async () => {
          try {
            const version = await new Promise<string>((res, rej) => {
              execFile('/usr/bin/git', ['--version'], { timeout: 10000 }, (err, stdout) => {
                if (err) rej(err)
                else res(stdout.trim())
              })
            })
            const cached = (settings.get('dependencyPaths') as Record<string, string>) || {}
            cached.git = '/usr/bin/git'
            settings.set('dependencyPaths', cached)
            emitProgress(win, 'git', 'Git installed via Xcode Command Line Tools!')
            resolve('/usr/bin/git')
          } catch {
            emitProgress(win, 'git', 'Xcode Command Line Tools installer opened. Please complete the installation and click "Re-check".')
            reject(new Error('Please complete Xcode Command Line Tools installation and re-check.'))
          }
        }, 2000)
      })
      proc.on('error', reject)
    })
  }

  if (process.platform === 'win32') {
    const info = getGitDownloadInfo()
    if (!info) throw new Error('Git auto-install not supported on this platform')

    const managedDir = getManagedDir()
    const gitDir = path.join(managedDir, 'git')
    const tmpDir = path.join(managedDir, 'tmp')

    await fsp.mkdir(tmpDir, { recursive: true })
    await fsp.mkdir(gitDir, { recursive: true })

    const archivePath = path.join(tmpDir, info.filename)

    // Download MinGit
    await downloadFile(info.url, archivePath, win, 'git')

    // Extract
    emitProgress(win, 'git', 'Extracting Git...')
    await extractZip(archivePath, gitDir)

    // Clean up
    await fsp.unlink(archivePath).catch(() => {})
    await fsp.rmdir(tmpDir).catch(() => {})

    const gitBin = path.join(gitDir, 'cmd', 'git.exe')
    if (!fs.existsSync(gitBin)) {
      throw new Error(`Git binary not found at ${gitBin} after extraction`)
    }

    const cached = (settings.get('dependencyPaths') as Record<string, string>) || {}
    cached.git = gitBin
    settings.set('dependencyPaths', cached)

    emitProgress(win, 'git', 'Git installed successfully!')
    return gitBin
  }

  // Linux: use package manager
  emitProgress(win, 'git', 'Installing Git via package manager...')
  return new Promise((resolve, reject) => {
    // Try apt first, fall back to dnf
    const proc = spawn('sh', ['-c', 'command -v apt-get && sudo apt-get install -y git || sudo dnf install -y git'], {
      stdio: 'pipe',
    })
    let output = ''
    proc.stdout?.on('data', (d) => {
      output += d.toString()
      emitProgress(win, 'git', d.toString().trim())
    })
    proc.stderr?.on('data', (d) => {
      output += d.toString()
    })
    proc.on('close', (code) => {
      if (code === 0) {
        const cached = (settings.get('dependencyPaths') as Record<string, string>) || {}
        cached.git = '/usr/bin/git'
        settings.set('dependencyPaths', cached)
        emitProgress(win, 'git', 'Git installed successfully!')
        resolve('/usr/bin/git')
      } else {
        reject(new Error(`Git installation failed (exit ${code}): ${output}`))
      }
    })
    proc.on('error', reject)
  })
}

// ── Claude CLI ──

export async function installClaude(win: BrowserWindow, settings: SettingsStore): Promise<string> {
  emitProgress(win, 'claude', 'Installing Claude CLI via native installer...')

  const env = { ...process.env } as Record<string, string>

  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>

    if (process.platform === 'win32') {
      const psPath = path.join(
        process.env.SYSTEMROOT || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
      )
      emitProgress(win, 'claude', 'Running: irm https://claude.ai/install.ps1 | iex')
      proc = spawn(psPath, [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        'irm https://claude.ai/install.ps1 | iex'
      ], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    } else {
      emitProgress(win, 'claude', 'Running: curl -fsSL https://claude.ai/install.sh | bash')
      proc = spawn('bash', ['-c',
        'curl -fsSL https://claude.ai/install.sh | bash'
      ], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    }

    let output = ''
    proc.stdout?.on('data', (d: Buffer) => {
      output += d.toString()
      const line = d.toString().trim()
      if (line) emitProgress(win, 'claude', line)
    })
    proc.stderr?.on('data', (d: Buffer) => {
      output += d.toString()
      const line = d.toString().trim()
      if (line) emitProgress(win, 'claude', line)
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI installation failed (exit ${code}): ${output}`))
        return
      }

      // Find the installed claude binary in known locations
      const home = os.homedir()
      const candidates: string[] = process.platform === 'win32'
        ? [
            path.join(home, '.local', 'bin', 'claude.exe'),
            path.join(home, '.claude', 'bin', 'claude.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude-code', 'claude.exe'),
          ]
        : [
            path.join(home, '.local', 'bin', 'claude'),
            path.join(home, '.claude', 'bin', 'claude'),
            '/usr/local/bin/claude',
            '/opt/homebrew/bin/claude',
          ]

      const claudeBin = candidates.find(p => {
        try { return fs.existsSync(p) } catch { return false }
      })

      if (!claudeBin) {
        reject(new Error('Claude CLI binary not found after installation. Please check the install output above.'))
        return
      }

      const cached = (settings.get('dependencyPaths') as Record<string, string>) || {}
      cached.claude = claudeBin
      settings.set('dependencyPaths', cached)

      emitProgress(win, 'claude', 'Claude CLI installed successfully!')
      resolve(claudeBin)
    })

    proc.on('error', reject)
  })
}
