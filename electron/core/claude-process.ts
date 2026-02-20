import { spawn, ChildProcess, exec } from 'child_process'
import { randomUUID } from 'crypto'
import { writeFile, readFile } from 'fs/promises'
import { BrowserWindow } from 'electron'
import { SettingsStore } from '../services/settings-store'

export interface ClaudeSessionOptions {
  prompt?: string
  model?: string
  workingDirectory?: string
  permissionMode?: string
  resume?: boolean
  images?: Array<{ data: string; mediaType: string }>
  appendSystemPrompt?: string
  mcpConfigPath?: string
}

interface ToolUse {
  id: string
  name: string
  input: Record<string, unknown>
}

interface ClaudeSession {
  process: ChildProcess
  buffer: string
  cwd: string
  env: Record<string, string>
  // Track tool_use blocks so we can match them to denied tool_results
  pendingToolUses: Map<string, ToolUse>
  // Currently denied tool waiting for user approval
  deniedTool: ToolUse | null
  // Tools the user has chosen to "always allow" for this session
  alwaysAllowed: Set<string>
}

export class ClaudeProcess {
  private sessions = new Map<string, ClaudeSession>()
  private mainWindow: BrowserWindow
  private settings: SettingsStore

  constructor(mainWindow: BrowserWindow, settings: SettingsStore) {
    this.mainWindow = mainWindow
    this.settings = settings
  }

  async startSession(sessionId: string, options: ClaudeSessionOptions = {}): Promise<void> {
    // Kill existing session if any
    this.abort(sessionId)

    const model = String(options.model || 'sonnet')
    const cwd = String(options.workingDirectory || process.cwd())
    const permissionMode = String(options.permissionMode || 'bypass')

    // Generate a unique session ID per spawn to avoid "session already in use"
    const cliSessionId = randomUUID()

    const args: string[] = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--session-id', cliSessionId,
    ]

    // Permission modes:
    // - bypass: --dangerously-skip-permissions (everything auto-approved)
    // - supervised: no bypass flag (CLI denies dangerous ops, app handles approval)
    // - plan: read-only
    if (permissionMode === 'bypass') {
      args.push('--dangerously-skip-permissions')
    } else if (permissionMode === 'plan') {
      args.push('--permission-mode', 'plan')
    }
    // 'supervised' mode: no special flags — CLI uses default permissions
    // which auto-approves reads but denies writes/bash. We intercept denials.

    if (options.appendSystemPrompt) {
      args.push('--append-system-prompt', options.appendSystemPrompt)
    }

    if (options.mcpConfigPath) {
      args.push('--mcp-config', options.mcpConfigPath)
    }

    // Strip all Claude Code env vars to allow nested sessions,
    // and ensure PATH includes common CLI install locations
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (!k.startsWith('CLAUDE') && v !== undefined) {
        env[k] = v
      }
    }
    const home = process.env.HOME || ''
    env.PATH = `/usr/local/bin:/opt/homebrew/bin:${home}/.local/bin:${env.PATH || ''}`

    console.log(`[ClaudeProcess] Starting session ${sessionId} (permissionMode=${permissionMode})`)
    console.log(`[ClaudeProcess] Args: claude ${args.join(' ')}`)
    console.log(`[ClaudeProcess] CWD: ${cwd}`)

    const proc = spawn('claude', args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const session: ClaudeSession = {
      process: proc,
      buffer: '',
      cwd,
      env,
      pendingToolUses: new Map(),
      deniedTool: null,
      alwaysAllowed: new Set(),
    }

    this.sessions.set(sessionId, session)

    this.emit(sessionId, { type: 'session:started', sessionId })

    // Send initial prompt if provided
    if (options.prompt) {
      this.sendMessage(sessionId, options.prompt, options.images)
    }

    proc.stdout!.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      console.log(`[ClaudeProcess] stdout: ${text.slice(0, 200)}`)
      session.buffer += text
      const lines = session.buffer.split('\n')
      // Keep the last incomplete line in buffer
      session.buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed)
          this.handleClaudeEvent(sessionId, parsed)
        } catch {
          // Non-JSON output, emit as raw
          this.emit(sessionId, { type: 'raw', data: trimmed })
        }
      }
    })

    proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      console.log(`[ClaudeProcess] stderr: ${text.slice(0, 500)}`)
      this.emit(sessionId, { type: 'stderr', data: text })
    })

    proc.on('close', (code: number | null) => {
      console.log(`[ClaudeProcess] Session ${sessionId} closed with code ${code}`)
      this.sessions.delete(sessionId)
      this.emit(sessionId, { type: 'session:ended', sessionId, exitCode: code })
    })

    proc.on('error', (err: Error) => {
      console.log(`[ClaudeProcess] Session ${sessionId} error: ${err.message}`)
      this.sessions.delete(sessionId)
      this.emit(sessionId, { type: 'session:error', sessionId, error: err.message })
    })
  }

  sendMessage(sessionId: string, message: string, images?: Array<{ data: string; mediaType: string }>): void {
    const session = this.sessions.get(sessionId)
    if (!session?.process.stdin?.writable) {
      console.log(`[ClaudeProcess] Cannot send message - stdin not writable for ${sessionId}`)
      return
    }

    // Build content: if images present, use content array format
    let content: string | Array<Record<string, unknown>> = message
    if (images && images.length > 0) {
      content = [
        ...images.map((img) => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType,
            data: img.data,
          },
        })),
        { type: 'text', text: message },
      ]
    }

    const payload = JSON.stringify({
      type: 'user',
      message: { role: 'user', content },
    })
    console.log(`[ClaudeProcess] Sending: ${payload.slice(0, 200)}...`)
    session.process.stdin.write(payload + '\n')
  }

  /** User approved or denied a tool that was blocked by the CLI.
   *  mode: 'once' = approve this time, 'always' = approve this tool for the session, 'deny' = deny */
  async respondPermission(sessionId: string, allowed: boolean, always = false): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session?.deniedTool) return

    const tool = session.deniedTool
    session.deniedTool = null

    if (allowed) {
      if (always) {
        session.alwaysAllowed.add(tool.name)
        console.log(`[ClaudeProcess] Always allow: ${tool.name}`)
      }
      await this.executeAndReport(sessionId, session, tool)
    } else {
      this.sendMessage(sessionId,
        `[Tool denied by user] The user chose not to allow ${tool.name}. Please continue without it.`
      )
    }
  }

  /** Execute a denied tool and send the result back to Claude */
  private async executeAndReport(sessionId: string, session: ClaudeSession, tool: ToolUse): Promise<void> {
    try {
      const result = await this.executeTool(session, tool)
      this.sendMessage(sessionId,
        `[Tool approved and executed] ${tool.name} completed successfully.\nOutput:\n${result}`
      )
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      this.sendMessage(sessionId,
        `[Tool approved but failed] ${tool.name} error: ${errMsg}`
      )
    }
  }

  abort(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      session.process.kill('SIGTERM')
    } catch {
      // Process already dead
    }
    this.sessions.delete(sessionId)
  }

  private handleClaudeEvent(sessionId: string, event: Record<string, unknown>): void {
    console.log(`[ClaudeProcess] Event: ${event.type}`, JSON.stringify(event).slice(0, 500))

    const session = this.sessions.get(sessionId)

    // Track tool_use blocks from assistant messages
    if (event.type === 'assistant' && session) {
      const msg = event.message as { content?: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }> }
      if (msg?.content) {
        for (const block of msg.content) {
          if (block.type === 'tool_use' && block.id && block.name) {
            session.pendingToolUses.set(block.id, {
              id: block.id,
              name: block.name,
              input: block.input || {},
            })
          }
        }
      }
    }

    // Detect denied tool_results (CLI auto-denied a tool)
    if (event.type === 'user' && session) {
      const msg = event.message as { content?: Array<{ type: string; tool_use_id?: string; content?: string; is_error?: boolean }> }
      if (msg?.content) {
        for (const block of msg.content) {
          const isPermissionDenial =
            block.type === 'tool_result' &&
            block.is_error &&
            typeof block.content === 'string' &&
            block.tool_use_id &&
            (block.content.includes('requires approval') ||
             block.content.includes('requested permissions') ||
             block.content.includes('haven\'t granted'))
          if (isPermissionDenial && block.tool_use_id) {
            const toolUseId = block.tool_use_id as string
            const tool = session.pendingToolUses.get(toolUseId)
            if (tool) {
              console.log(`[ClaudeProcess] Tool denied by CLI: ${tool.name}`, JSON.stringify(tool.input).slice(0, 200))
              session.pendingToolUses.delete(toolUseId)

              // If "always allowed", auto-execute without asking
              if (session.alwaysAllowed.has(tool.name)) {
                console.log(`[ClaudeProcess] Auto-executing (always allowed): ${tool.name}`)
                this.executeAndReport(sessionId, session, tool)
              } else {
                session.deniedTool = tool
                // Emit permission_request to renderer
                this.emit(sessionId, {
                  type: 'permission_request',
                  sessionId,
                  tool: { name: tool.name, input: tool.input },
                })
              }
            }
          }
        }
      }
    }

    this.emit(sessionId, { ...event, sessionId })
  }

  /** Execute a tool that was denied by the CLI but approved by the user */
  private async executeTool(session: ClaudeSession, tool: ToolUse): Promise<string> {
    const { name, input } = tool

    switch (name) {
      case 'Bash': {
        const command = String(input.command || '')
        if (!command) throw new Error('No command provided')
        console.log(`[ClaudeProcess] Executing approved Bash: ${command.slice(0, 200)}`)

        return new Promise((resolve, reject) => {
          exec(command, {
            cwd: session.cwd,
            env: session.env,
            timeout: 60000,
            maxBuffer: 1024 * 1024,
          }, (error, stdout, stderr) => {
            if (error && !stdout && !stderr) {
              reject(error)
            } else {
              let result = ''
              if (stdout) result += stdout
              if (stderr) result += (result ? '\n' : '') + `stderr: ${stderr}`
              if (error) result += (result ? '\n' : '') + `Exit code: ${error.code}`
              resolve(result || '(no output)')
            }
          })
        })
      }

      case 'Write': {
        const filePath = String(input.file_path || '')
        const content = String(input.content || '')
        if (!filePath) throw new Error('No file path provided')
        console.log(`[ClaudeProcess] Executing approved Write: ${filePath}`)
        await writeFile(filePath, content, 'utf8')
        return `File written: ${filePath}`
      }

      case 'Edit': {
        const filePath = String(input.file_path || '')
        const oldStr = String(input.old_string || '')
        const newStr = String(input.new_string || '')
        if (!filePath) throw new Error('No file path provided')
        console.log(`[ClaudeProcess] Executing approved Edit: ${filePath}`)
        const existing = await readFile(filePath, 'utf8')
        if (!existing.includes(oldStr)) {
          throw new Error(`old_string not found in ${filePath}`)
        }
        const updated = existing.replace(oldStr, newStr)
        await writeFile(filePath, updated, 'utf8')
        return `File edited: ${filePath}`
      }

      default:
        throw new Error(`Tool ${name} not supported for manual execution`)
    }
  }

  private emit(sessionId: string, data: Record<string, unknown>): void {
    if (this.mainWindow?.isDestroyed()) return
    this.mainWindow.webContents.send('claude:event', { ...data, sessionId })
  }
}
