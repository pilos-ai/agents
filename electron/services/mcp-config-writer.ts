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

/**
 * Writes an MCP config JSON file for a project and returns its absolute path.
 * Only includes enabled servers. Output format matches Claude CLI expectations.
 * When Jira is connected (tokens exist in settings), auto-injects the Jira MCP server.
 */
export function writeMcpConfig(projectPath: string, servers: McpServerEntry[], settings?: SettingsStore): string {
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
  if (settings) {
    const tokenKey = projectPath ? `jiraTokens:${projectPath}` : 'jiraTokens'
    const jiraTokens = settings.get(tokenKey) as { accessToken: string; cloudId: string } | null
    if (jiraTokens) {
      // Write tokens to temp file for the MCP server to read
      const tokenFilePath = path.join(configDir, `jira-tokens-${encoded}.json`)
      fs.writeFileSync(tokenFilePath, JSON.stringify({
        accessToken: jiraTokens.accessToken,
        cloudId: jiraTokens.cloudId,
      }))

      // Resolve jira-mcp-server.js path (in dist-electron next to main.js)
      // In dev: dist-electron/jira-mcp-server.js
      // In prod: resources/dist-electron/jira-mcp-server.js
      let mcpServerScript: string
      if (app.isPackaged) {
        mcpServerScript = path.join(process.resourcesPath, 'dist-electron', 'jira-mcp-server.js')
      } else {
        mcpServerScript = path.join(app.getAppPath(), 'dist-electron', 'jira-mcp-server.js')
      }

      mcpServers['jira'] = {
        type: 'stdio',
        command: 'node',
        args: [mcpServerScript, tokenFilePath],
      }
      console.log(`[McpConfigWriter] Injected Jira MCP server (tokens from ${tokenFilePath})`)
    }
  }

  const config = { mcpServers }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  console.log(`[McpConfigWriter] Wrote config with ${Object.keys(mcpServers).length} servers to ${configPath}`)

  return configPath
}
