import path from 'path'
import { createRequire } from 'module'
import { app } from 'electron'

const require = createRequire(import.meta.url)

interface BetterSqlite3Database {
  pragma(pragma: string): void
  prepare(sql: string): {
    run(...params: unknown[]): { lastInsertRowid: number }
    get(...params: unknown[]): Record<string, unknown> | undefined
    all(...params: unknown[]): Record<string, unknown>[]
  }
  exec(sql: string): void
  close(): void
}

export interface Conversation {
  id: string
  title: string
  model: string
  working_directory: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: number
  conversation_id: string
  role: string
  type: string
  content: string
  tool_name?: string
  tool_input?: string
  tool_result?: string
  created_at: string
}

export class Database {
  private db: BetterSqlite3Database | null = null

  constructor() {
    try {
      this.init()
    } catch (err) {
      console.error('Database init failed:', err)
    }
  }

  private init(): void {
    const BetterSqlite3 = require('better-sqlite3')
    const dbPath = path.join(app.getPath('userData'), 'claude-code.db')
    console.log('Opening database at:', dbPath)
    this.db = new BetterSqlite3(dbPath)
    this.db!.pragma('journal_mode = WAL')
    this.db!.pragma('foreign_keys = ON')
    this.createTables()
  }

  private createTables(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New Chat',
        model TEXT NOT NULL DEFAULT 'sonnet',
        working_directory TEXT NOT NULL DEFAULT '',
        project_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL DEFAULT '',
        tool_name TEXT,
        tool_input TEXT,
        tool_result TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(conversation_id, created_at);
    `)

    // Migration: add project_path column if missing (existing DBs)
    this.migrate()
  }

  private migrate(): void {
    const columns = this.db!.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>
    const hasProjectPath = columns.some((c) => c.name === 'project_path')
    if (!hasProjectPath) {
      this.db!.exec("ALTER TABLE conversations ADD COLUMN project_path TEXT NOT NULL DEFAULT ''")
    }
    this.db!.exec("CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_path, updated_at DESC)")
  }

  listConversations(projectPath?: string): Conversation[] {
    if (projectPath !== undefined) {
      return this.db!.prepare(
        'SELECT * FROM conversations WHERE project_path = ? ORDER BY updated_at DESC'
      ).all(projectPath) as unknown as Conversation[]
    }
    return this.db!.prepare(
      'SELECT * FROM conversations ORDER BY updated_at DESC'
    ).all() as unknown as Conversation[]
  }

  getConversation(id: string): Conversation | undefined {
    return this.db!.prepare(
      'SELECT * FROM conversations WHERE id = ?'
    ).get(id) as unknown as Conversation | undefined
  }

  createConversation(title: string, projectPath = '', id?: string): Conversation {
    const convId = id || crypto.randomUUID()
    this.db!.prepare(
      'INSERT INTO conversations (id, title, project_path) VALUES (?, ?, ?)'
    ).run(convId, title, projectPath)
    return this.getConversation(convId)!
  }

  updateConversationTitle(id: string, title: string): void {
    this.db!.prepare(
      "UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(title, id)
  }

  deleteConversation(id: string): void {
    this.db!.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  getMessages(conversationId: string): Message[] {
    return this.db!.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(conversationId) as unknown as Message[]
  }

  saveMessage(conversationId: string, message: Partial<Message>): Message {
    const result = this.db!.prepare(`
      INSERT INTO messages (conversation_id, role, type, content, tool_name, tool_input, tool_result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversationId,
      message.role || 'assistant',
      message.type || 'text',
      message.content || '',
      message.tool_name || null,
      message.tool_input || null,
      message.tool_result || null
    )

    // Touch conversation updated_at
    this.db!.prepare(
      "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
    ).run(conversationId)

    return this.db!.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid) as unknown as Message
  }

  close(): void {
    this.db?.close()
  }
}
