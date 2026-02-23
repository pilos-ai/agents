import crypto from 'crypto'
import { app } from 'electron'
import { Database } from '../core/database'
import { SettingsStore } from './settings-store'

const FLUSH_INTERVAL = 5 * 60_000       // 5 minutes
const SYNC_INTERVAL = 24 * 60 * 60_000  // 24 hours
const LICENSE_SERVER = process.env.PILOS_LICENSE_SERVER || 'https://license.pilosagents.com'

export class MetricsCollector {
  private database: Database
  private settings: SettingsStore
  private licenseKey: string | null = null
  private machineId: string

  // In-memory counters for current day
  private appLaunches = 0
  private sessionsStarted = 0
  private messagesSent = 0
  private lastFlushAt = Date.now()

  private flushTimer: ReturnType<typeof setInterval> | null = null
  private syncTimer: ReturnType<typeof setInterval> | null = null

  constructor(database: Database, settings: SettingsStore) {
    this.database = database
    this.settings = settings
    this.machineId = this.getOrCreateMachineId()
  }

  private getOrCreateMachineId(): string {
    let id = this.settings.get('machineId') as string | null
    if (!id) {
      id = crypto.randomUUID()
      this.settings.set('machineId', id)
    }
    return id
  }

  init(): void {
    this.appLaunches = 1
    this.lastFlushAt = Date.now()

    // Load license key from settings
    this.licenseKey = (this.settings.get('licenseKey') as string) || null

    // Flush every 5 minutes
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL)

    // Sync every 24 hours
    this.syncTimer = setInterval(() => this.sync(), SYNC_INTERVAL)

    // Initial sync attempt (send any unsent data from previous sessions)
    setTimeout(() => this.sync(), 30_000)
  }

  setLicenseKey(key: string | null): void {
    this.licenseKey = key
  }

  trackSessionStarted(): void {
    this.sessionsStarted++
  }

  trackMessageSent(): void {
    this.messagesSent++
  }

  flush(): void {
    try {
      const now = Date.now()
      const usageMinutes = Math.round((now - this.lastFlushAt) / 60_000)
      this.lastFlushAt = now

      // Snapshot project config
      const allSettings = this.settings.getAll()
      const projects = (allSettings.projects || {}) as Record<string, { agents?: unknown[]; mcpServers?: unknown[] }>
      let totalAgents = 0
      let totalMcpServers = 0
      for (const proj of Object.values(projects)) {
        totalAgents += (proj.agents?.length || 0)
        totalMcpServers += (proj.mcpServers?.length || 0)
      }

      const browserMcpEnabled = Boolean(allSettings.browserMcpEnabled)
      const computerUseEnabled = Boolean(allSettings.computerUseEnabled)

      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

      this.database.upsertDailyMetrics({
        date: today,
        appLaunches: this.appLaunches,
        usageMinutes,
        sessionsStarted: this.sessionsStarted,
        messagesSent: this.messagesSent,
        agentsConfigured: totalAgents,
        mcpServersConfigured: totalMcpServers,
        browserMcpEnabled,
        computerUseEnabled,
        appVersion: app.getVersion(),
        osPlatform: process.platform,
        electronVersion: process.versions.electron,
      })

      // Reset in-memory deltas (they've been persisted)
      this.appLaunches = 0
      this.sessionsStarted = 0
      this.messagesSent = 0
    } catch (err) {
      console.error('[MetricsCollector] flush error:', err)
    }
  }

  async sync(): Promise<void> {
    if (!this.licenseKey) return

    try {
      const rows = this.database.getUnsentMetrics()
      if (rows.length === 0) return

      const metrics = rows.map((r) => ({
        date: r.date as string,
        appLaunches: r.app_launches as number,
        usageMinutes: r.usage_minutes as number,
        sessionsStarted: r.sessions_started as number,
        messagesSent: r.messages_sent as number,
        agentsConfigured: r.agents_configured as number,
        mcpServersConfigured: r.mcp_servers_configured as number,
        browserMcpEnabled: Boolean(r.browser_mcp_enabled),
        computerUseEnabled: Boolean(r.computer_use_enabled),
        appVersion: r.app_version as string,
        osPlatform: r.os_platform as string,
        electronVersion: r.electron_version as string,
      }))

      const res = await fetch(`${LICENSE_SERVER}/v1/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: this.licenseKey, machineId: this.machineId, metrics }),
      })

      if (res.ok) {
        const ids = rows.map((r) => r.id as number)
        this.database.markMetricsSent(ids)
        console.log(`[MetricsCollector] synced ${ids.length} metric rows`)
      }
    } catch {
      // Silently skip — retry next cycle
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer)
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.flush()
    await this.sync()
  }
}
