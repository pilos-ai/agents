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
  agent_name?: string | null
  agent_emoji?: string | null
  agent_color?: string | null
  content_blocks?: string | null  // JSON-encoded ContentBlock[]
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

      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        priority TEXT NOT NULL DEFAULT 'medium',
        story_points INTEGER,
        jira_epic_key TEXT,
        jira_epic_id TEXT,
        jira_project_key TEXT,
        jira_sync_status TEXT DEFAULT 'local',
        jira_last_synced TEXT,
        coverage_data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_stories_project ON stories(project_path, updated_at DESC);

      CREATE TABLE IF NOT EXISTS story_criteria (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        description TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        is_covered INTEGER NOT NULL DEFAULT 0,
        covered_files TEXT,
        covered_explanation TEXT,
        jira_task_key TEXT,
        jira_task_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_story_criteria_story ON story_criteria(story_id, order_index);

      CREATE TABLE IF NOT EXISTS metrics_buffer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        app_launches INTEGER DEFAULT 0,
        usage_minutes INTEGER DEFAULT 0,
        sessions_started INTEGER DEFAULT 0,
        messages_sent INTEGER DEFAULT 0,
        agents_configured INTEGER DEFAULT 0,
        mcp_servers_configured INTEGER DEFAULT 0,
        browser_mcp_enabled INTEGER DEFAULT 0,
        computer_use_enabled INTEGER DEFAULT 0,
        app_version TEXT NOT NULL,
        os_platform TEXT NOT NULL,
        electron_version TEXT NOT NULL,
        sent INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
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

    // Migration: add cli_session_id to conversations
    if (!columns.some((c) => c.name === 'cli_session_id')) {
      this.db!.exec("ALTER TABLE conversations ADD COLUMN cli_session_id TEXT")
    }

    // Migration: add agent and content_blocks columns to messages
    const msgColumns = this.db!.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>
    const msgColNames = new Set(msgColumns.map((c) => c.name))
    if (!msgColNames.has('agent_name')) {
      this.db!.exec("ALTER TABLE messages ADD COLUMN agent_name TEXT")
    }
    if (!msgColNames.has('agent_emoji')) {
      this.db!.exec("ALTER TABLE messages ADD COLUMN agent_emoji TEXT")
    }
    if (!msgColNames.has('agent_color')) {
      this.db!.exec("ALTER TABLE messages ADD COLUMN agent_color TEXT")
    }
    if (!msgColNames.has('content_blocks')) {
      this.db!.exec("ALTER TABLE messages ADD COLUMN content_blocks TEXT")
    }
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

  updateConversationCliSessionId(id: string, cliSessionId: string): void {
    this.db!.prepare(
      'UPDATE conversations SET cli_session_id = ? WHERE id = ?'
    ).run(cliSessionId, id)
  }

  getConversationCliSessionId(id: string): string | null {
    const row = this.db!.prepare(
      'SELECT cli_session_id FROM conversations WHERE id = ?'
    ).get(id) as { cli_session_id: string | null } | undefined
    return row?.cli_session_id || null
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
      INSERT INTO messages (conversation_id, role, type, content, tool_name, tool_input, tool_result, agent_name, agent_emoji, agent_color, content_blocks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversationId,
      message.role || 'assistant',
      message.type || 'text',
      message.content || '',
      message.tool_name || null,
      message.tool_input || null,
      message.tool_result || null,
      message.agent_name || null,
      message.agent_emoji || null,
      message.agent_color || null,
      message.content_blocks || null
    )

    // Touch conversation updated_at
    this.db!.prepare(
      "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
    ).run(conversationId)

    return this.db!.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid) as unknown as Message
  }

  // ── Stories ──

  listStories(projectPath: string): Record<string, unknown>[] {
    return this.db!.prepare(
      'SELECT * FROM stories WHERE project_path = ? ORDER BY updated_at DESC'
    ).all(projectPath)
  }

  getStory(id: string): Record<string, unknown> | undefined {
    return this.db!.prepare('SELECT * FROM stories WHERE id = ?').get(id)
  }

  createStory(story: Record<string, unknown>): Record<string, unknown> {
    const id = (story.id as string) || crypto.randomUUID()
    this.db!.prepare(`
      INSERT INTO stories (id, project_path, title, description, status, priority, story_points, jira_epic_key, jira_epic_id, jira_project_key, jira_sync_status, coverage_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      story.project_path || '',
      story.title || 'Untitled Story',
      story.description || '',
      story.status || 'draft',
      story.priority || 'medium',
      story.story_points ?? null,
      story.jira_epic_key ?? null,
      story.jira_epic_id ?? null,
      story.jira_project_key ?? null,
      story.jira_sync_status || 'local',
      story.coverage_data ?? null,
    )
    return this.getStory(id)!
  }

  updateStory(id: string, updates: Record<string, unknown>): Record<string, unknown> {
    const fields: string[] = []
    const values: unknown[] = []
    const allowed = ['title', 'description', 'status', 'priority', 'story_points', 'jira_epic_key', 'jira_epic_id', 'jira_project_key', 'jira_sync_status', 'jira_last_synced', 'coverage_data']
    for (const key of allowed) {
      if (key in updates) {
        fields.push(`${key} = ?`)
        values.push(updates[key])
      }
    }
    if (fields.length === 0) return this.getStory(id)!
    fields.push("updated_at = datetime('now')")
    values.push(id)
    this.db!.prepare(`UPDATE stories SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.getStory(id)!
  }

  deleteStory(id: string): void {
    this.db!.prepare('DELETE FROM stories WHERE id = ?').run(id)
  }

  // ── Story Criteria ──

  getStoryCriteria(storyId: string): Record<string, unknown>[] {
    return this.db!.prepare(
      'SELECT * FROM story_criteria WHERE story_id = ? ORDER BY order_index ASC'
    ).all(storyId)
  }

  addStoryCriterion(storyId: string, description: string): Record<string, unknown> {
    const id = crypto.randomUUID()
    const maxOrder = this.db!.prepare(
      'SELECT MAX(order_index) as max_idx FROM story_criteria WHERE story_id = ?'
    ).get(storyId) as { max_idx: number | null } | undefined
    const orderIndex = (maxOrder?.max_idx ?? -1) + 1

    this.db!.prepare(`
      INSERT INTO story_criteria (id, story_id, description, order_index)
      VALUES (?, ?, ?, ?)
    `).run(id, storyId, description, orderIndex)

    return this.db!.prepare('SELECT * FROM story_criteria WHERE id = ?').get(id)!
  }

  updateStoryCriterion(id: string, updates: Record<string, unknown>): Record<string, unknown> {
    const fields: string[] = []
    const values: unknown[] = []
    const allowed = ['description', 'order_index', 'is_covered', 'covered_files', 'covered_explanation', 'jira_task_key', 'jira_task_id']
    for (const key of allowed) {
      if (key in updates) {
        fields.push(`${key} = ?`)
        values.push(updates[key])
      }
    }
    if (fields.length === 0) return this.db!.prepare('SELECT * FROM story_criteria WHERE id = ?').get(id)!
    values.push(id)
    this.db!.prepare(`UPDATE story_criteria SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.db!.prepare('SELECT * FROM story_criteria WHERE id = ?').get(id)!
  }

  deleteStoryCriterion(id: string): void {
    this.db!.prepare('DELETE FROM story_criteria WHERE id = ?').run(id)
  }

  reorderStoryCriteria(storyId: string, criterionIds: string[]): void {
    const stmt = this.db!.prepare('UPDATE story_criteria SET order_index = ? WHERE id = ? AND story_id = ?')
    for (let i = 0; i < criterionIds.length; i++) {
      stmt.run(i, criterionIds[i], storyId)
    }
  }

  // ── Metrics ──

  upsertDailyMetrics(metrics: {
    date: string
    appLaunches: number
    usageMinutes: number
    sessionsStarted: number
    messagesSent: number
    agentsConfigured: number
    mcpServersConfigured: number
    browserMcpEnabled: boolean
    computerUseEnabled: boolean
    appVersion: string
    osPlatform: string
    electronVersion: string
  }): void {
    this.db!.prepare(`
      INSERT INTO metrics_buffer (date, app_launches, usage_minutes, sessions_started, messages_sent, agents_configured, mcp_servers_configured, browser_mcp_enabled, computer_use_enabled, app_version, os_platform, electron_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        app_launches = app_launches + excluded.app_launches,
        usage_minutes = usage_minutes + excluded.usage_minutes,
        sessions_started = sessions_started + excluded.sessions_started,
        messages_sent = messages_sent + excluded.messages_sent,
        agents_configured = excluded.agents_configured,
        mcp_servers_configured = excluded.mcp_servers_configured,
        browser_mcp_enabled = excluded.browser_mcp_enabled,
        computer_use_enabled = excluded.computer_use_enabled,
        app_version = excluded.app_version,
        os_platform = excluded.os_platform,
        electron_version = excluded.electron_version,
        updated_at = datetime('now')
    `).run(
      metrics.date,
      metrics.appLaunches,
      metrics.usageMinutes,
      metrics.sessionsStarted,
      metrics.messagesSent,
      metrics.agentsConfigured,
      metrics.mcpServersConfigured,
      metrics.browserMcpEnabled ? 1 : 0,
      metrics.computerUseEnabled ? 1 : 0,
      metrics.appVersion,
      metrics.osPlatform,
      metrics.electronVersion
    )
  }

  getUnsentMetrics(): Record<string, unknown>[] {
    return this.db!.prepare('SELECT * FROM metrics_buffer WHERE sent = 0 ORDER BY date ASC').all()
  }

  markMetricsSent(ids: number[]): void {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    this.db!.prepare(`UPDATE metrics_buffer SET sent = 1, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(...ids)
  }

  // ── Storage Management ──

  getStorageStats(): { conversations: number; messages: number; stories: number; metrics: number; dbSizeBytes: number } {
    const conversations = (this.db!.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }).count
    const messages = (this.db!.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count

    let stories = 0
    try {
      stories = (this.db!.prepare('SELECT COUNT(*) as count FROM stories').get() as { count: number }).count
    } catch { /* table may not exist */ }

    let metrics = 0
    try {
      metrics = (this.db!.prepare('SELECT COUNT(*) as count FROM metrics_buffer').get() as { count: number }).count
    } catch { /* table may not exist */ }

    const pageCountRow = this.db!.prepare('PRAGMA page_count').get() as { page_count: number } | undefined
    const pageSizeRow = this.db!.prepare('PRAGMA page_size').get() as { page_size: number } | undefined
    const dbSizeBytes = (pageCountRow?.page_count || 0) * (pageSizeRow?.page_size || 0)

    return { conversations, messages, stories, metrics, dbSizeBytes }
  }

  clearConversations(): void {
    this.db!.exec('DELETE FROM messages')
    this.db!.exec('DELETE FROM conversations')
    this.db!.exec('VACUUM')
  }

  clearAllData(): void {
    this.db!.exec('DELETE FROM messages')
    this.db!.exec('DELETE FROM conversations')
    try { this.db!.exec('DELETE FROM story_criteria') } catch { /* may not exist */ }
    try { this.db!.exec('DELETE FROM stories') } catch { /* may not exist */ }
    try { this.db!.exec('DELETE FROM metrics_buffer') } catch { /* may not exist */ }
    this.db!.exec('VACUUM')
  }

  close(): void {
    this.db?.close()
  }
}
