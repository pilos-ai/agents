import WebSocket from 'ws'
import crypto from 'crypto'
import { app, BrowserWindow } from 'electron'
import { SettingsStore } from './settings-store'
import { ClaudeProcess } from '../core/claude-process'
import { Database, Message } from '../core/database'

// Gate noisy / content-bearing logs to development only; errors stay unconditional.
const devLog = (...args: unknown[]): void => {
  if (!app.isPackaged) console.log(...args)
}

const LICENSE_SERVER = process.env.PILOS_LICENSE_SERVER || 'https://license.pilos.net'

// Keys the mobile relay is allowed to read via settings:get / settings:getAll.
// Sensitive values (licenseKey, pilos_auth, machineId, privateKey, etc.) are
// intentionally excluded — they must never leave the desktop process.
const RELAY_SAFE_SETTINGS = new Set([
  'theme',
  'model',
  'backgroundMode',
  'notifications',
  'telemetry',
  // Security toggles surfaced in SettingsPage. Non-sensitive UI booleans —
  // they describe the desktop's confirmation policy, not credentials.
  'security_autoApproveReads',
  'security_requireConfirmDestructive',
  'security_sandboxMode',
  'security_sessionTimeout',
  'security_telemetry',
])

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown[]
}

export interface PairedDevice {
  device_id: string
  device_name: string
  created_at: string
  last_seen_at: string
}

export class RelayClient {
  private ws: WebSocket | null = null
  private mainWindow: BrowserWindow
  private settings: SettingsStore
  private claudeProcess: ClaudeProcess
  private database: Database
  private mobileCount = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private intentionalClose = false

  // Pairing callback maps
  private pairingTokenCallback: ((data: { token: string; expiresAt: number }) => void) | null = null
  private deviceListCallback: ((devices: PairedDevice[]) => void) | null = null

  constructor(
    mainWindow: BrowserWindow,
    settings: SettingsStore,
    claudeProcess: ClaudeProcess,
    database: Database,
  ) {
    this.mainWindow = mainWindow
    this.settings = settings
    this.claudeProcess = claudeProcess
    this.database = database

    // Listen to Claude events and broadcast to mobile
    this.claudeProcess.onEvent((event) => {
      this.broadcastEvent(event)
    })
  }

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    const licenseKey = this.settings.get('licenseKey') as string
    const machineId = this.getOrCreateMachineId()
    if (!licenseKey || !machineId) {
      devLog('[RelayClient] No license key or machineId — skipping connect')
      return
    }

    this.intentionalClose = false

    // Build relay URL — convert https to wss
    const relayUrl = LICENSE_SERVER.replace(/^http/, 'ws') + '/relay'
    devLog(`[RelayClient] Connecting to ${relayUrl}`)

    try {
      this.ws?.removeAllListeners()
      this.ws = new WebSocket(relayUrl)
    } catch (err) {
      console.error('[RelayClient] Failed to create WebSocket:', err)
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      devLog('[RelayClient] WebSocket open — sending auth')
      this.reconnectDelay = 1000 // Reset on successful open

      // Authenticate as desktop
      this.safeSend({
        type: 'auth',
        licenseKey,
        role: 'desktop',
        machineId,
      })

      // Start ping interval (unref so it doesn't block Node.js exit)
      this.pingTimer = setInterval(() => {
        this.safeSend({ type: 'ping' })
      }, 25000)
      this.pingTimer.unref()
    })

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        this.handleMessage(msg)
      } catch {
        console.error('[RelayClient] Invalid JSON received')
      }
    })

    this.ws.on('close', (code, reason) => {
      devLog(`[RelayClient] Disconnected: ${code} ${reason}`)
      this.cleanup()
      if (!this.intentionalClose) {
        this.scheduleReconnect()
      }
      this.notifyRenderer()
    })

    this.ws.on('error', (err) => {
      console.error('[RelayClient] WebSocket error:', err.message)
    })
  }

  disconnect(): void {
    this.intentionalClose = true
    this.cleanup()
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close(1000, 'User disconnect')
      this.ws = null
    }
    this.mobileCount = 0
    this.notifyRenderer()
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  getMobileCount(): number {
    return this.mobileCount
  }

  broadcastEvent(event: Record<string, unknown>): void {
    if (!this.isConnected()) return
    this.safeSend({
      jsonrpc: '2.0',
      method: 'event',
      params: { type: 'claude:event', data: event },
    })
  }

  /** Broadcast a user message sent from desktop to mobile clients */
  broadcastUserMessage(conversationId: string, message: string, images?: Array<{ data: string; mediaType: string }>): void {
    if (!this.isConnected()) return
    this.safeSend({
      jsonrpc: '2.0',
      method: 'event',
      params: { type: 'user:message', data: { conversationId, message, images } },
    })
  }

  // ── Pairing API ──

  requestPairingToken(): Promise<{ token: string; expiresAt: number }> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('Not connected to relay'))
        return
      }

      const timeout = setTimeout(() => {
        this.pairingTokenCallback = null
        reject(new Error('Pairing token request timeout'))
      }, 10000)

      this.pairingTokenCallback = (data) => {
        clearTimeout(timeout)
        this.pairingTokenCallback = null
        resolve(data)
      }

      this.safeSend({ type: 'pairing:createToken' })
    })
  }

  approvePairing(requestId: string): void {
    this.safeSend({ type: 'pairing:approve', requestId })
  }

  denyPairing(requestId: string): void {
    this.safeSend({ type: 'pairing:deny', requestId })
  }

  listPairedDevices(): Promise<PairedDevice[]> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('Not connected to relay'))
        return
      }

      const timeout = setTimeout(() => {
        this.deviceListCallback = null
        reject(new Error('Device list request timeout'))
      }, 10000)

      this.deviceListCallback = (devices) => {
        clearTimeout(timeout)
        this.deviceListCallback = null
        resolve(devices)
      }

      this.safeSend({ type: 'pairing:listDevices' })
    })
  }

  revokeDevice(deviceId: string): void {
    this.safeSend({ type: 'pairing:revokeDevice', deviceId })
  }

  // ── Private ──

  private handleMessage(msg: Record<string, unknown>): void {
    // Auth success
    if (msg.type === 'auth_success') {
      devLog(`[RelayClient] Authenticated — mobileCount: ${msg.mobileCount}`)
      this.mobileCount = (msg.mobileCount as number) || 0
      this.notifyRenderer()
      return
    }

    // Pong (ignore)
    if (msg.type === 'pong') return

    // Status events from relay server
    if (msg.type === 'status') {
      if (msg.event === 'mobile_connected') {
        this.mobileCount = (msg.mobileCount as number) || 0
        devLog(`[RelayClient] Mobile connected — count: ${this.mobileCount}`)
      } else if (msg.event === 'mobile_disconnected') {
        this.mobileCount = (msg.mobileCount as number) || 0
        devLog(`[RelayClient] Mobile disconnected — count: ${this.mobileCount}`)
      }
      this.notifyRenderer()
      return
    }

    // ── Pairing responses ──
    if (msg.type === 'pairing:token') {
      if (this.pairingTokenCallback) {
        this.pairingTokenCallback({ token: msg.token as string, expiresAt: msg.expiresAt as number })
      }
      return
    }

    if (msg.type === 'pairing:request') {
      // Forward pairing request to renderer for approval UI
      devLog(`[RelayClient] Pairing request from "${msg.deviceName}" (${msg.deviceId})`)
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('mobile:pairingRequest', {
          requestId: msg.requestId,
          deviceName: msg.deviceName,
          deviceId: msg.deviceId,
        })
      }
      return
    }

    if (msg.type === 'pairing:deviceList') {
      if (this.deviceListCallback) {
        this.deviceListCallback(msg.devices as PairedDevice[])
      }
      return
    }

    if (msg.type === 'pairing:deviceApproved') {
      devLog(`[RelayClient] Device approved: ${msg.deviceName}`)
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('mobile:deviceApproved', {
          deviceId: msg.deviceId,
          deviceName: msg.deviceName,
        })
      }
      return
    }

    if (msg.type === 'pairing:deviceRevoked') {
      devLog(`[RelayClient] Device revoked: ${msg.deviceId}`)
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('mobile:deviceRevoked', {
          deviceId: msg.deviceId,
        })
      }
      return
    }

    // JSON-RPC request from mobile
    if (msg.jsonrpc === '2.0' && msg.method && msg.id !== undefined) {
      this.handleJsonRpc(msg as unknown as JsonRpcRequest)
      return
    }
  }

  private async handleJsonRpc(request: JsonRpcRequest): Promise<void> {
    const { id, method, params = [] } = request
    devLog(`[RelayClient] RPC: ${method} (id=${id})`)

    try {
      const result = await this.dispatch(method, params)
      this.safeSend({ jsonrpc: '2.0', id, result })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[RelayClient] RPC error (${method}):`, message)
      this.safeSend({ jsonrpc: '2.0', id, error: { code: -32000, message } })
    }
  }

  private async dispatch(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      // ── Conversations ──
      case 'conversations:list':
        return this.database.listConversations(params[0] as string | undefined)

      case 'conversations:getMessages': {
        const rows = this.database.getMessages(params[0] as string)
        return rows.map((r: Message) => ({
          id: r.id,
          role: r.role,
          type: r.type,
          content: r.content,
          toolName: r.tool_name,
          toolInput: r.tool_input,
          toolResult: r.tool_result,
          agentName: r.agent_name,
          agentEmoji: r.agent_emoji,
          agentColor: r.agent_color,
          contentBlocks: r.content_blocks ? JSON.parse(r.content_blocks) : undefined,
          replyToId: r.reply_to_id ?? undefined,
          timestamp: new Date(r.created_at).getTime(),
        }))
      }

      case 'conversations:create':
        return this.database.createConversation(params[0] as string, (params[1] as string) || '')

      case 'conversations:get':
        return this.database.getConversation(params[0] as string)

      case 'conversations:searchMessages': {
        const query = params[0] as string
        const options = (params[1] as Record<string, unknown>) || {}
        const result = this.database.searchMessages(query, options as any)
        return {
          total: result.total,
          messages: result.messages.map((r: Record<string, unknown>) => ({
            id: r.id,
            conversationId: r.conversation_id,
            conversationTitle: r.conversation_title,
            role: r.role,
            type: r.type,
            content: r.content,
            snippet: r.snippet,
            timestamp: new Date(r.created_at as string).getTime(),
          })),
        }
      }

      // ── Claude ──
      case 'claude:startSession': {
        const sessionId = params[0] as string
        const raw = (params[1] as Record<string, unknown>) || {}

        // Strip fields that must not be controlled by a remote mobile client.
        // permissionMode and appendSystemPrompt are desktop-only; mcpConfigPath
        // must not be overridden by an untrusted caller.
        const options: Record<string, unknown> = {
          prompt:      raw.prompt,
          images:      raw.images,
          projectPath: raw.projectPath,
          model:       raw.model,
          resume:      raw.resume,
        }

        // Look up stored CLI session ID for resume (mirrors ipc-handlers.ts logic)
        if (options.resume) {
          const stored = this.database.getConversationCliSessionId(sessionId)
          const requestedModel = (options.model as string) || 'sonnet'
          if (stored && (!stored.model || stored.model === requestedModel)) {
            options.cliSessionId = stored.cliSessionId
          }
        }

        const cliSessionId = await this.claudeProcess.startSession(sessionId, options as any)
        this.database.updateConversationCliSessionId(sessionId, cliSessionId, (options.model as string) || 'sonnet')
        return cliSessionId
      }

      case 'claude:sendMessage': {
        const sessionId = params[0] as string
        const message = params[1] as string
        const images = params[2] as Array<{ data: string; mediaType: string }> | undefined

        // Persist user message to database (desktop renderer doesn't do this for relay messages)
        this.database.saveMessage(sessionId, {
          role: 'user',
          type: 'text',
          content: message,
        })

        // Notify desktop renderer about the new user message
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('mobile:newMessage', { conversationId: sessionId, message, images })
        }

        // Auto-start a session if none is active (mobile doesn't call startSession separately)
        if (!this.claudeProcess.hasSession(sessionId)) {
          const conv = this.database.getConversation(sessionId) as Record<string, unknown> | undefined
          const options: Record<string, unknown> = {
            prompt: message,
            images,
            projectPath: (conv?.project_path as string) || '',
          }

          // Resume existing CLI session if available (only if model hasn't changed)
          const stored = this.database.getConversationCliSessionId(sessionId)
          const requestedModel = (options.model as string) || 'sonnet'
          if (stored && (!stored.model || stored.model === requestedModel)) {
            options.resume = true
            options.cliSessionId = stored.cliSessionId
          }

          const cliSessionId = await this.claudeProcess.startSession(sessionId, options as any)
          this.database.updateConversationCliSessionId(sessionId, cliSessionId, requestedModel)
          return cliSessionId
        }

        return this.claudeProcess.sendMessage(sessionId, message, images)
      }

      case 'claude:respondPermission':
        return this.claudeProcess.respondPermission(
          params[0] as string,
          params[1] as boolean,
          (params[2] as boolean) || false,
        )

      case 'claude:respondToQuestion':
        return this.claudeProcess.respondToQuestion(
          params[0] as string,
          params[1] as Record<string, string>,
        )

      case 'claude:respondToPlanExit':
        return this.claudeProcess.respondToPlanExit(
          params[0] as string,
          params[1] as boolean,
          params[2] as string | undefined,
        )

      case 'claude:abort':
        return this.claudeProcess.abort(params[0] as string)

      // ── Projects ──
      case 'projects:getRecent':
        return this.settings.getRecentProjects()

      case 'projects:getSettings':
        return this.settings.getProjectSettings(params[0] as string)

      // ── Settings ──
      // Only expose non-sensitive keys to remote mobile clients. Keys like
      // licenseKey, pilos_auth, and machineId must never leave the desktop.
      case 'settings:get': {
        const key = params[0] as string
        if (!RELAY_SAFE_SETTINGS.has(key)) {
          throw new Error('settings:get: key not accessible via relay')
        }
        return this.settings.get(key)
      }

      case 'settings:getAll': {
        const all = this.settings.getAll() as Record<string, unknown>
        // Allow RELAY_SAFE_SETTINGS keys plus v2_tasks:* — task data is not
        // sensitive and the mobile task store reads it via this call.
        return Object.fromEntries(
          Object.entries(all).filter(([k]) => RELAY_SAFE_SETTINGS.has(k) || k.startsWith('v2_tasks:'))
        )
      }

      // ── Tasks ──
      case 'tasks:list': {
        const projectPath = params[0] as string | undefined
        if (!projectPath) return []
        return this.settings.get(`v2_tasks:${projectPath}`) || []
      }

      case 'tasks:trigger':
      case 'task:trigger': {
        const taskId = params[0] as string
        // params[1] is trigger source ('mobile'), not projectPath
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('scheduler:trigger-task', {
            taskId,
            trigger: 'mobile',
          })
        }
        return { ok: true }
      }

      default:
        throw new Error(`Unknown method: ${method}`)
    }
  }

  private safeSend(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private cleanup(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return
    devLog(`[RelayClient] Reconnecting in ${this.reconnectDelay}ms`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
      this.connect()
    }, this.reconnectDelay)
  }

  private getOrCreateMachineId(): string {
    let id = this.settings.get('machineId') as string | null
    if (!id) {
      id = crypto.randomUUID()
      this.settings.set('machineId', id)
    }
    return id
  }

  private notifyRenderer(): void {
    if (this.mainWindow?.isDestroyed()) return
    this.mainWindow.webContents.send('mobile:status', {
      connected: this.isConnected(),
      mobileCount: this.mobileCount,
    })
  }
}
