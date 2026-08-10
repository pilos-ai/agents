import { ipcMain } from 'electron'
import crypto from 'crypto'
import type { MetricsCollector } from '../services/metrics-collector'
import type { SettingsStore } from '../services/settings-store'
import type { RelayClient } from '../services/relay-client'

export function registerMetricsHandlers(
  settings: SettingsStore,
  getMetricsCollector: () => MetricsCollector | null,
  getRelayClient: () => RelayClient | null
) {
  ipcMain.handle('metrics:setLicenseKey', (_event, key: string) => {
    getMetricsCollector()?.setLicenseKey(key)
    const relay = getRelayClient()
    const pilosAuth = settings.get('pilos_auth') as { features?: string[] } | null
    const hasDevices = pilosAuth?.features?.includes('devices') ?? false
    if (key && hasDevices && relay && !relay.isConnected()) {
      relay.connect()
    }
  })

  // An account session started (sign-in) or ended (sign-out). With Pilos free,
  // an account — not a licence key — is what device pairing binds to, so this is
  // what brings the relay up without waiting for an app restart.
  ipcMain.handle('metrics:setAccount', (_event, email: string | null) => {
    const relay = getRelayClient()
    if (!relay) return
    if (!email) {
      relay.disconnect()
      return
    }
    const pilosAuth = settings.get('pilos_auth') as { features?: string[] } | null
    const hasDevices = pilosAuth?.features?.includes('devices') ?? false
    if (hasDevices && !relay.isConnected()) relay.connect()
  })

  ipcMain.handle('metrics:getMachineId', () => {
    let id = settings.get('machineId') as string | null
    if (!id) {
      id = crypto.randomUUID()
      settings.set('machineId', id)
    }
    return id
  })
}
