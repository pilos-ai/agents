import { ipcMain } from 'electron'
import type { RelayClient } from '../services/relay-client'

export function registerMobileHandlers(getRelayClient: () => RelayClient | null) {
  ipcMain.handle('mobile:connect', () => getRelayClient()?.connect())
  ipcMain.handle('mobile:disconnect', () => getRelayClient()?.disconnect())

  ipcMain.handle('mobile:getStatus', () => ({
    connected: getRelayClient()?.isConnected() ?? false,
    mobileCount: getRelayClient()?.getMobileCount() ?? 0,
  }))

  ipcMain.handle('mobile:requestPairingToken', () => getRelayClient()?.requestPairingToken())

  ipcMain.handle('mobile:approvePairing', (_event, requestId: string) =>
    getRelayClient()?.approvePairing(requestId)
  )

  ipcMain.handle('mobile:denyPairing', (_event, requestId: string) =>
    getRelayClient()?.denyPairing(requestId)
  )

  ipcMain.handle('mobile:listPairedDevices', () => getRelayClient()?.listPairedDevices())

  ipcMain.handle('mobile:revokeDevice', (_event, deviceId: string) =>
    getRelayClient()?.revokeDevice(deviceId)
  )

  ipcMain.handle('mobile:broadcastUserMessage', (_event, conversationId: string, message: string, images?: Array<{ data: string; mediaType: string }>) => {
    getRelayClient()?.broadcastUserMessage(conversationId, message, images)
  })
}
