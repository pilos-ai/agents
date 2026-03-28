import { ipcMain } from 'electron'
import type { ClaudeProcess } from '../core/claude-process'
import type { Database } from '../core/database'
import type { MetricsCollector } from '../services/metrics-collector'

export function registerClaudeHandlers(
  claudeProcess: ClaudeProcess,
  database: Database,
  metricsCollector: MetricsCollector | null
) {
  ipcMain.handle('claude:startSession', async (_event, sessionId: string, options) => {
    metricsCollector?.trackSessionStarted()

    if (options.resume) {
      const stored = database.getConversationCliSessionId(sessionId)
      const requestedModel = options.model || 'sonnet'
      if (stored && (!stored.model || stored.model === requestedModel)) {
        options.cliSessionId = stored.cliSessionId
        console.log(`[IPC] Resuming session ${sessionId} with CLI session ${stored.cliSessionId}`)
      } else if (stored) {
        console.log(`[IPC] Model changed (${stored.model} → ${requestedModel}), starting fresh session`)
      }
    }

    const cliSessionId = await claudeProcess.startSession(sessionId, options)
    database.updateConversationCliSessionId(sessionId, cliSessionId, options.model || 'sonnet')
    return cliSessionId
  })

  ipcMain.handle('claude:sendMessage', async (_event, sessionId: string, message: string, images?: Array<{ data: string; mediaType: string }>) => {
    metricsCollector?.trackMessageSent()
    return claudeProcess.sendMessage(sessionId, message, images)
  })

  ipcMain.handle('claude:respondPermission', (_event, sessionId: string, allowed: boolean, always?: boolean) =>
    claudeProcess.respondPermission(sessionId, allowed, always || false)
  )

  ipcMain.handle('claude:respondToQuestion', (_event, sessionId: string, answers: Record<string, string>) =>
    claudeProcess.respondToQuestion(sessionId, answers)
  )

  ipcMain.handle('claude:respondToPlanExit', (_event, sessionId: string, approved: boolean, feedback?: string) =>
    claudeProcess.respondToPlanExit(sessionId, approved, feedback)
  )

  ipcMain.handle('claude:abort', (_event, sessionId: string) =>
    claudeProcess.abort(sessionId)
  )
}
