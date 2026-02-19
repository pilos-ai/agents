// ── Project Types ──

export interface Project {
  path: string       // unique key, absolute dir path
  name: string       // basename
  lastOpened: string  // ISO date
}

export interface ProjectSettings {
  model: string          // default 'sonnet'
  permissionMode: string // default 'bypass'
}

// ── Claude CLI Event Types ──

export interface ClaudeEvent {
  sessionId: string
  type: string
  [key: string]: unknown
}

export interface ClaudeAssistantMessage {
  type: 'assistant'
  message: {
    role: 'assistant'
    content: ContentBlock[]
    model?: string
    stop_reason?: string
  }
  session_id?: string
}

export interface ClaudeContentBlockDelta {
  type: 'content_block_delta'
  index: number
  delta: {
    type: string
    text?: string
    partial_json?: string
    thinking?: string
  }
}

export interface ClaudeContentBlockStart {
  type: 'content_block_start'
  index: number
  content_block: ContentBlock
}

export interface ClaudeResult {
  type: 'result'
  result: {
    role: 'assistant'
    content: ContentBlock[]
    model?: string
    stop_reason?: string
  }
  session_id?: string
  is_error?: boolean
  duration_ms?: number
  cost_usd?: number
  total_cost_usd?: number
}

// ── Content Blocks ──

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | Array<{ type: string; text?: string }>
  is_error?: boolean
}

export interface ThinkingBlock {
  type: 'thinking'
  thinking: string
}

// ── Image Attachment ──

export interface ImageAttachment {
  data: string        // base64 encoded
  mediaType: string   // image/png, image/jpeg, image/gif, image/webp
  name?: string       // filename
}

// ── App State Types ──

export interface ConversationMessage {
  id?: number
  role: 'user' | 'assistant'
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking'
  content: string
  images?: ImageAttachment[]
  contentBlocks?: ContentBlock[]
  toolName?: string
  toolInput?: string
  toolResult?: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  model: string
  working_directory: string
  project_path: string
  created_at: string
  updated_at: string
}

export interface TrackedProcess {
  pid: number
  command: string
  startedAt: number
  status: 'running' | 'stopped' | 'exited'
  exitCode?: number
}

// ── CLI Check Types ──

export interface CliCheckResult {
  available: boolean
  version?: string
  npmAvailable: boolean
  error?: string
}

export interface CliInstallOutput {
  stream: 'stdout' | 'stderr'
  data: string
}

// ── API Types (exposed via preload) ──

export interface ElectronAPI {
  cli: {
    check: () => Promise<CliCheckResult>
    install: () => Promise<boolean>
    onInstallOutput: (callback: (data: CliInstallOutput) => void) => () => void
  }
  claude: {
    startSession: (sessionId: string, options: Record<string, unknown>) => Promise<void>
    sendMessage: (sessionId: string, message: string, images?: ImageAttachment[]) => Promise<void>
    respondPermission: (sessionId: string, allowed: boolean, always?: boolean) => Promise<void>
    abort: (sessionId: string) => Promise<void>
    onEvent: (callback: (data: ClaudeEvent) => void) => () => void
  }
  conversations: {
    list: (projectPath?: string) => Promise<Conversation[]>
    get: (id: string) => Promise<Conversation | null>
    create: (title: string, projectPath?: string) => Promise<Conversation>
    updateTitle: (id: string, title: string) => Promise<void>
    delete: (id: string) => Promise<void>
    getMessages: (conversationId: string) => Promise<ConversationMessage[]>
    saveMessage: (conversationId: string, message: Partial<ConversationMessage>) => Promise<ConversationMessage>
  }
  projects: {
    getRecent: () => Promise<Project[]>
    addRecent: (dirPath: string) => Promise<void>
    removeRecent: (dirPath: string) => Promise<void>
    getSettings: (dirPath: string) => Promise<ProjectSettings>
    setSettings: (dirPath: string, settings: Partial<ProjectSettings>) => Promise<void>
  }
  terminal: {
    create: (id: string, options?: Record<string, unknown>) => Promise<void>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    destroy: (id: string) => Promise<void>
    onData: (callback: (id: string, data: string) => void) => () => void
    onExit: (callback: (id: string, code: number) => void) => () => void
  }
  processes: {
    list: () => Promise<TrackedProcess[]>
    stop: (pid: number) => Promise<void>
    onUpdate: (callback: (data: TrackedProcess[]) => void) => () => void
  }
  settings: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    getAll: () => Promise<Record<string, unknown>>
  }
  dialog: {
    openDirectory: () => Promise<string | null>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
