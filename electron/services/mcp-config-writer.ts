import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { SettingsStore } from './settings-store'

interface McpServerEntry {
  id: string
  name: string
  enabled: boolean
  config: {
    type: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
  }
}

export interface McpConfigResult {
  configPath: string
  warnings: string[]
}

/**
 * Writes an MCP config JSON file for a project and returns its absolute path.
 * Only includes enabled servers. Output format matches Claude CLI expectations.
 * When Jira is connected (tokens exist in settings), auto-injects the Jira MCP server.
 */
export function writeMcpConfig(projectPath: string, servers: McpServerEntry[], settings?: SettingsStore): McpConfigResult {
  const configDir = path.join(app.getPath('userData'), 'mcp-configs')
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  // Use base64url-safe encoding of projectPath as filename
  const encoded = Buffer.from(projectPath).toString('base64url')
  const configPath = path.join(configDir, `${encoded}.json`)

  // Build Claude CLI mcpServers config: { "server-id": { type, command, args, env } }
  const mcpServers: Record<string, Record<string, unknown>> = {}

  for (const server of servers) {
    if (!server.enabled) continue

    const cfg = server.config
    if (cfg.type === 'stdio') {
      const entry: Record<string, unknown> = {
        type: 'stdio',
        command: cfg.command,
        args: cfg.args || [],
      }
      if (cfg.env && Object.keys(cfg.env).length > 0) {
        entry.env = cfg.env
      }
      mcpServers[server.id] = entry
    } else if (cfg.type === 'http' || cfg.type === 'sse') {
      const entry: Record<string, unknown> = {
        type: cfg.type,
        url: cfg.url,
      }
      if (cfg.headers && Object.keys(cfg.headers).length > 0) {
        entry.headers = cfg.headers
      }
      mcpServers[server.id] = entry
    }
  }

  // Auto-inject Jira MCP server when connected (project-scoped tokens)
  const warnings: string[] = []
  if (settings) {
    const tokenKey = projectPath ? `jiraTokens:${projectPath}` : 'jiraTokens'
    // Log all jira token keys in settings for debugging
    const allKeys = Object.keys(settings.getAll()).filter(k => k.startsWith('jiraTokens'))
    console.log(`[McpConfigWriter] All Jira token keys in settings: [${allKeys.join(', ')}]`)
    console.log(`[McpConfigWriter] Looking up Jira tokens with key: "${tokenKey}"`)
    const jiraTokens = settings.get(tokenKey) as { accessToken: string; cloudId: string } | null
    console.log(`[McpConfigWriter] Jira tokens found: ${jiraTokens ? 'yes' : 'no'}`)
    if (jiraTokens) {
      // Write tokens to temp file for the MCP server to read
      const tokenFilePath = path.join(configDir, `jira-tokens-${encoded}.json`)
      fs.writeFileSync(tokenFilePath, JSON.stringify({
        accessToken: jiraTokens.accessToken,
        cloudId: jiraTokens.cloudId,
      }))

      // Resolve jira-mcp-server.js path
      // In dev: {appPath}/dist-electron/jira-mcp-server.js
      // In prod: {resources}/app.asar.unpacked/dist-electron/jira-mcp-server.js
      //   (script is in asarUnpack so it's on the real filesystem, not inside app.asar)
      let mcpServerScript: string
      if (app.isPackaged) {
        mcpServerScript = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-electron', 'jira-mcp-server.js')
      } else {
        mcpServerScript = path.join(app.getAppPath(), 'dist-electron', 'jira-mcp-server.js')
      }

      const nodeCommand = app.isPackaged ? process.execPath : 'node'
      const nodeEnv: Record<string, string> = app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}

      const scriptExists = fs.existsSync(mcpServerScript)
      console.log(`[McpConfigWriter] Jira MCP server script: ${mcpServerScript} (exists: ${scriptExists})`)

      mcpServers['jira'] = {
        type: 'stdio',
        command: nodeCommand,
        args: [mcpServerScript, tokenFilePath],
        ...(Object.keys(nodeEnv).length > 0 ? { env: nodeEnv } : {}),
      }
      console.log(`[McpConfigWriter] Injected Jira MCP server (tokens from ${tokenFilePath})`)
    } else {
      // No tokens for this project — check if Jira is connected on another project
      const allSettings = settings.getAll()
      const otherJiraKey = Object.keys(allSettings).find(
        (key) => key.startsWith('jiraTokens:') && key !== tokenKey && allSettings[key] != null
      )
      if (otherJiraKey) {
        const otherPath = otherJiraKey.replace('jiraTokens:', '')
        warnings.push(
          `Jira is connected on another project (${path.basename(otherPath)}) but not on this one. ` +
          `Open the PM sidebar and connect Jira for this project to use Jira tools.`
        )
        console.log(`[McpConfigWriter] Warning: Jira tokens found for ${otherPath} but not for ${projectPath}`)
      }
    }
  }

  // Auto-inject Computer Use MCP server when enabled
  if (settings) {
    const computerUseEnabled = settings.get('computerUseEnabled')
    if (computerUseEnabled) {
      let mcpServerScript: string
      if (app.isPackaged) {
        mcpServerScript = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-electron', 'computer-use-mcp-server.js')
      } else {
        mcpServerScript = path.join(app.getAppPath(), 'dist-electron', 'computer-use-mcp-server.js')
      }
      const cuNodeCommand = app.isPackaged ? process.execPath : 'node'
      const cuNodeEnv: Record<string, string> = app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}

      mcpServers['computer-use'] = {
        type: 'stdio',
        command: cuNodeCommand,
        args: [mcpServerScript],
        ...(Object.keys(cuNodeEnv).length > 0 ? { env: cuNodeEnv } : {}),
      }
      console.log('[McpConfigWriter] Injected Computer Use MCP server')
    }
  }

  const config = { mcpServers }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  console.log(`[McpConfigWriter] Wrote config with servers: [${Object.keys(mcpServers).join(', ')}] to ${configPath}`)

  return { configPath, warnings }
}
