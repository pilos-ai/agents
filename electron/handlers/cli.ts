import { ipcMain } from 'electron'
import os from 'os'
import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'
import type { CliChecker } from '../services/cli-checker'

export function registerCliHandlers(cliChecker: CliChecker) {
  ipcMain.handle('cli:check', () => cliChecker.check())
  ipcMain.handle('cli:install', () => cliChecker.install())
  ipcMain.handle('cli:checkAuth', () => cliChecker.checkAuth())
  ipcMain.handle('cli:login', () => cliChecker.login())

  ipcMain.handle('cli:getUsageStats', async () => {
    const statsPath = path.join(os.homedir(), '.claude', 'stats-cache.json')
    try {
      const raw = await fs.readFile(statsPath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('cli:getClaudeUsage', async () => {
    const cachePath = path.join(os.homedir(), '.claude', 'usage-cache.json')

    const readCache = async () => {
      try {
        const raw = await fs.readFile(cachePath, 'utf-8')
        return JSON.parse(raw)
      } catch {
        return null
      }
    }

    try {
      const username = os.userInfo().username
      let credJson: string
      try {
        credJson = execSync(
          `security find-generic-password -a "${username}" -w -s "Claude Code-credentials"`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim()
      } catch {
        return readCache()
      }

      const creds = JSON.parse(credJson)
      const accessToken = creds?.claudeAiOauth?.accessToken
      if (!accessToken) return readCache()

      const resp = await fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'User-Agent': 'claude-code/2.0.15',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!resp.ok) return readCache()

      const data = await resp.json()
      await fs.writeFile(cachePath, JSON.stringify(data), 'utf-8').catch(() => {})
      return data
    } catch {
      return readCache()
    }
  })
}
