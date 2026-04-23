import { execFile } from 'child_process'
import { findClaudeBinary, getExpandedEnv } from './cli-checker'

export interface InstallResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
}

export interface ListedPlugin {
  name: string
  marketplace?: string
  scope?: string
  enabled?: boolean
}

/**
 * Runs `claude plugin install <name>@<marketplace> --scope project` in the
 * given project directory.
 */
export async function installPlugin(
  projectPath: string,
  pluginName: string,
  marketplace: string,
): Promise<InstallResult> {
  return runPluginCmd(projectPath, [
    'plugin',
    'install',
    `${pluginName}@${marketplace}`,
    '--scope',
    'project',
  ])
}

export async function uninstallPlugin(
  projectPath: string,
  pluginName: string,
): Promise<InstallResult> {
  return runPluginCmd(projectPath, ['plugin', 'uninstall', pluginName, '--scope', 'project'])
}

/**
 * Returns plugins currently installed for the project. Tries JSON flag first,
 * falls back to a loose plain-text parse if the CLI version doesn't support it.
 */
export async function listInstalledPlugins(projectPath: string): Promise<ListedPlugin[]> {
  const jsonResult = await runPluginCmd(projectPath, ['plugin', 'list', '--json'])
  if (jsonResult.ok) {
    try {
      const parsed = JSON.parse(jsonResult.stdout)
      if (Array.isArray(parsed)) return parsed as ListedPlugin[]
      if (parsed && Array.isArray(parsed.plugins)) return parsed.plugins as ListedPlugin[]
    } catch {
      /* fall through to plain text */
    }
  }

  const plainResult = await runPluginCmd(projectPath, ['plugin', 'list'])
  if (!plainResult.ok) return []

  return plainResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('No '))
    .map((line) => {
      const [nameWithMarket] = line.split(/\s+/)
      const [name, marketplace] = nameWithMarket.split('@')
      return { name: name || line, marketplace }
    })
}

function runPluginCmd(cwd: string, args: string[]): Promise<InstallResult> {
  const env = getExpandedEnv()
  const bin = findClaudeBinary()
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { cwd, env, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            error: error.message,
          })
          return
        }
        resolve({ ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') })
      },
    )
  })
}
