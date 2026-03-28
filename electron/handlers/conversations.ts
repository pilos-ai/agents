import { ipcMain } from 'electron'
import { mapMessageRow } from '../utils/row-mappers'
import type { Database } from '../core/database'

export function registerConversationHandlers(database: Database) {
  ipcMain.handle('conversations:list', (_event, projectPath?: string) =>
    database.listConversations(projectPath)
  )

  ipcMain.handle('conversations:get', (_event, id: string) =>
    database.getConversation(id)
  )

  ipcMain.handle('conversations:create', (_event, title: string, projectPath?: string) =>
    database.createConversation(title, projectPath || '')
  )

  ipcMain.handle('conversations:updateTitle', (_event, id: string, title: string) =>
    database.updateConversationTitle(id, title)
  )

  ipcMain.handle('conversations:delete', (_event, id: string) =>
    database.deleteConversation(id)
  )

  ipcMain.handle('conversations:getMessages', (_event, conversationId: string) => {
    const rows = database.getMessages(conversationId)
    return rows.map((r) => mapMessageRow(r as unknown as Record<string, unknown>))
  })

  ipcMain.handle('conversations:saveMessage', (_event, conversationId: string, message) => {
    const saved = database.saveMessage(conversationId, {
      role: message.role,
      type: message.type,
      content: message.content,
      tool_name: message.toolName,
      tool_input: message.toolInput,
      tool_result: message.toolResult,
      agent_name: message.agentName,
      agent_emoji: message.agentEmoji,
      agent_color: message.agentColor,
      content_blocks: message.contentBlocks ? JSON.stringify(message.contentBlocks) : null,
      reply_to_id: message.replyToId ?? null,
    })
    return mapMessageRow(saved as unknown as Record<string, unknown>)
  })

  ipcMain.handle('conversations:getMessage', (_event, messageId: number) => {
    const r = database.getMessage(messageId)
    if (!r) return null
    return mapMessageRow(r as unknown as Record<string, unknown>)
  })

  ipcMain.handle('conversations:searchMessages', (_event, query: string, options: { conversationId?: string; projectPath?: string; limit?: number; offset?: number }) => {
    const result = database.searchMessages(query, options)
    return {
      total: result.total,
      messages: result.messages.map((r) => ({
        id: r.id as number,
        conversationId: r.conversation_id as string,
        conversationTitle: r.conversation_title as string,
        role: r.role as string,
        type: r.type as string,
        content: r.content as string,
        snippet: r.snippet as string,
        timestamp: new Date(r.created_at as string).getTime(),
      })),
    }
  })
}
