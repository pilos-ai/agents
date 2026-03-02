// ── Project Types ──

export interface Project {
  path: string       // unique key, absolute dir path
  name: string       // basename
  lastOpened: string  // ISO date
}

export interface ProjectSettings {
  model: string          // default 'sonnet'
  permissionMode: string // default 'bypass'
  mode: ProjectMode      // default 'solo'
  agents: AgentDefinition[] // default []
  mcpServers: McpServer[]   // default []
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
  agentId?: string
  agentName?: string
  agentIcon?: string
  agentColor?: string
  replyToId?: number
  timestamp: number
}

export interface MessageSearchResult {
  id: number
  conversationId: string
  conversationTitle: string
  role: string
  type: string
  content: string
  snippet: string
  timestamp: number
}

export interface SearchResults {
  total: number
  messages: MessageSearchResult[]
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

// ── Multi-Agent Team Types ──

export type PermissionLevel = 'restricted' | 'standard' | 'elevated'
export type ResponseFormat = 'markdown' | 'plain' | 'structured'

export interface AgentCapabilities {
  tools: string[]                // enabled tool IDs: 'fs_access', 'git_ops', etc.
  allowedPaths: string[]         // file access restrictions, empty = unrestricted
  maxTokensPerRequest: number    // per-request token limit
  permissionLevel: PermissionLevel
  allowedMcpServers: string[]    // MCP server IDs this agent can access, empty = all
  contextWindowSize: number      // max context window in tokens (default 128000)
  conversationHistoryLimit: number // max messages to retain, 0 = unlimited (default 50)
  memoryEnabled: boolean         // persist knowledge across sessions
  memorySummarizationEnabled: boolean // auto-summarize long conversations
  customInstructions: string     // per-agent instructions (like CLAUDE.md)
  temperature: number            // creativity/randomness (0.0–1.0, default 0.7)
  responseFormat: ResponseFormat // output format preference
  maxRetries: number             // retry failed operations (0–5, default 2)
  timeoutSeconds: number         // per-request timeout (30–600, default 120)
  debugMode: boolean             // verbose logging for troubleshooting
  autoApproveReadOnly: boolean   // auto-approve read-only operations
}

export interface AgentDefinition {
  id: string
  name: string         // e.g. "Dev"
  icon: string         // lucide icon id, e.g. "lucide:code-2"
  color: string        // tailwind key: 'blue' | 'purple' | 'green' | 'pink' | 'orange' | 'cyan'
  role: string         // e.g. "Senior Developer"
  personality: string  // system prompt personality text
  expertise: string[]  // e.g. ['implementation', 'debugging']
  capabilities?: AgentCapabilities
}

export type ProjectMode = 'solo' | 'team'

// ── MCP Server Types ──

export type McpServerType = 'stdio' | 'http' | 'sse'

export interface McpServerStdio {
  type: 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface McpServerHttp {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

export interface McpServerSse {
  type: 'sse'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = McpServerStdio | McpServerHttp | McpServerSse

export interface McpServer {
  id: string
  name: string
  icon: string
  description: string
  enabled: boolean
  config: McpServerConfig
}

export interface McpServerTemplate {
  id: string
  name: string
  icon: string
  description: string
  category: string
  config: McpServerConfig
  requiredEnvVars: string[]
  setupSteps: string[]
  docsUrl?: string
}

// ── Jira Types ──

export interface JiraTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number  // epoch ms
  cloudId: string
  siteUrl: string
  siteName: string
}

export interface JiraProject {
  id: string
  key: string
  name: string
  avatarUrl?: string
}

export interface JiraBoard {
  id: number
  name: string
  type: string  // 'scrum' | 'kanban'
}

export interface JiraSprint {
  id: number
  name: string
  state: string  // 'active' | 'closed' | 'future'
  startDate?: string
  endDate?: string
  completeDate?: string
  goal?: string
}

export interface JiraUser {
  accountId: string
  displayName: string
  avatarUrl?: string
  emailAddress?: string
}

export interface JiraIssue {
  id: string
  key: string
  summary: string
  description?: string
  status: { name: string; categoryKey: string }
  priority?: { name: string; iconUrl?: string }
  assignee?: JiraUser
  issuetype: { name: string; subtask: boolean }
  storyPoints?: number
  created: string
  updated: string
  parentKey?: string
}

export interface JiraTransition {
  id: string
  name: string
  to: { name: string }
}

// ── Story Types ──

export type StoryStatus = 'draft' | 'ready' | 'in_progress' | 'in_review' | 'done'
export type StoryPriority = 'low' | 'medium' | 'high' | 'critical'
export type JiraSyncStatus = 'local' | 'synced' | 'out_of_sync' | 'error'

export interface Story {
  id: string
  projectPath: string
  title: string
  description: string
  status: StoryStatus
  priority: StoryPriority
  storyPoints?: number
  jiraEpicKey?: string
  jiraEpicId?: string
  jiraProjectKey?: string
  jiraSyncStatus: JiraSyncStatus
  jiraLastSynced?: string
  coverageData?: { totalCriteria: number; coveredCriteria: number; lastAnalyzed: string }
  createdAt: string
  updatedAt: string
}

export interface StoryCriterion {
  id: string
  storyId: string
  description: string
  orderIndex: number
  isCovered: boolean
  coveredFiles?: string[]
  coveredExplanation?: string
  jiraTaskKey?: string
  jiraTaskId?: string
  createdAt: string
}

export interface CoverageResult {
  criterionIndex: number
  isCovered: boolean
  files: string[]
  explanation: string
}

// ── License & Pro Types ──

export type LicenseTier = 'free' | 'pro' | 'teams'

export interface ProFeatureFlags {
  tier: LicenseTier
  maxAgents: number        // free=3, pro/teams=Infinity
  maxMcpServers: number    // free=3, pro/teams=Infinity
  maxProjects: number      // free=3, pro/teams=Infinity
  teamMode: boolean        // free=false
  teamSync: boolean        // teams only
  premiumAgents: boolean   // pro/teams
}

// ── AskUserQuestion Types ──

export interface AskUserQuestionOption {
  label: string
  description: string
  markdown?: string
}

export interface AskUserQuestionItem {
  question: string
  header: string
  options: AskUserQuestionOption[]
  multiSelect: boolean
}

export interface AskUserQuestionData {
  sessionId: string
  toolUseId: string
  questions: AskUserQuestionItem[]
}

export interface ExitPlanModeData {
  sessionId: string
  toolUseId: string
  input: Record<string, unknown>
}

// ── Dependency Checker Types ──

export type DependencyName = 'git' | 'node' | 'claude'
export type DependencyItemStatus = 'checking' | 'found' | 'not_found' | 'error'

export interface DependencyInfo {
  name: DependencyName
  status: DependencyItemStatus
  version?: string
  path?: string
  error?: string
}

export interface DependencyCheckResult {
  git: DependencyInfo
  node: DependencyInfo
  claude: DependencyInfo
  allFound: boolean
}

export interface DependencyInstallInfo {
  url: string
  command?: string
  instructions: string
}

// ── CLI Check Types ──

export interface CliCheckResult {
  available: boolean
  version?: string
  error?: string
}

export interface CliInstallOutput {
  stream: 'stdout' | 'stderr'
  data: string
}

// ── Update Types ──

export type UpdateStatus = 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error'

export interface UpdateStatusEvent {
  status: UpdateStatus
  version?: string
  percent?: number
  error?: string
}

// ── Storage Types ──

export interface StorageStats {
  conversations: number
  messages: number
  stories: number
  metrics: number
  dbSizeBytes: number
}

// ── API Types (exposed via preload) ──

export interface ElectronAPI {
  cli: {
    check: () => Promise<CliCheckResult>
    install: () => Promise<boolean>
    checkAuth: () => Promise<{ authenticated: boolean; accountName?: string; email?: string; plan?: string }>
    login: () => Promise<boolean>
    onInstallOutput: (callback: (data: CliInstallOutput) => void) => () => void
    onLoginOutput: (callback: (data: string) => void) => () => void
  }
  deps: {
    checkAll: () => Promise<DependencyCheckResult>
    getInstallInfo: (tool: DependencyName) => Promise<DependencyInstallInfo>
    openInstallPage: (tool: DependencyName) => Promise<void>
    setCustomPath: (tool: DependencyName, binaryPath: string) => Promise<DependencyInfo>
    browseForBinary: (tool: DependencyName) => Promise<DependencyInfo | null>
    autoInstall: (tool: DependencyName) => Promise<{ success: boolean; path?: string; error?: string }>
    onInstallProgress: (callback: (data: { tool: DependencyName; message: string }) => void) => () => void
  }
  claude: {
    startSession: (sessionId: string, options: Record<string, unknown>) => Promise<void>
    sendMessage: (sessionId: string, message: string, images?: ImageAttachment[]) => Promise<void>
    respondPermission: (sessionId: string, allowed: boolean, always?: boolean) => Promise<void>
    respondToQuestion: (sessionId: string, answers: Record<string, string>) => Promise<void>
    respondToPlanExit: (sessionId: string, approved: boolean) => Promise<void>
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
    getMessage: (messageId: number) => Promise<ConversationMessage | null>
    searchMessages: (query: string, options: { conversationId?: string; projectPath?: string; limit?: number; offset?: number }) => Promise<SearchResults>
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
  mcp: {
    writeConfig: (projectPath: string, servers: McpServer[]) => Promise<{ configPath: string; warnings: string[] }>
  }
  files: {
    revertEdit: (filePath: string, oldString: string, newString: string) =>
      Promise<{ success: boolean; error?: string }>
    readFile: (filePath: string) => Promise<string>
    readDir: (dirPath: string, recursive?: boolean) =>
      Promise<{ name: string; path: string; isDirectory: boolean }[]>
  }
  dialog: {
    openDirectory: () => Promise<string | null>
    openPath: (options?: { directory?: boolean }) => Promise<string | null>
    openExternal: (url: string) => Promise<void>
  }
  menu: {
    setActiveProject: (project: { path: string; name: string } | null) => void
    rebuildMenu: () => void
    onMenuAction: (callback: (action: string, ...args: unknown[]) => void) => () => void
  }
  storage: {
    getStats: () => Promise<StorageStats>
    clearConversations: () => Promise<void>
    clearAllData: () => Promise<void>
  }
  metrics: {
    setLicenseKey: (key: string) => Promise<void>
    getMachineId: () => Promise<string>
  }
  updater: {
    install: () => Promise<void>
    onStatus: (callback: (data: UpdateStatusEvent) => void) => () => void
  }
  shell: {
    openPath: (path: string) => Promise<string>
  }
  jira?: {
    setActiveProject: (projectPath: string) => Promise<void>
    authorize: (projectPath: string) => Promise<JiraTokens>
    disconnect: (projectPath: string) => Promise<void>
    getTokens: (projectPath: string) => Promise<JiraTokens | null>
    getProjects: () => Promise<JiraProject[]>
    getBoards: (projectKey: string) => Promise<JiraBoard[]>
    getBoardIssues: (boardId: number) => Promise<JiraIssue[]>
    getSprints: (boardId: number) => Promise<JiraSprint[]>
    getSprintIssues: (sprintId: number) => Promise<JiraIssue[]>
    getIssues: (jql: string) => Promise<JiraIssue[]>
    createIssue: (projectKey: string, summary: string, description: string, issueType: string) => Promise<JiraIssue>
    createEpic: (projectKey: string, summary: string, description: string) => Promise<JiraIssue>
    createSubTask: (parentKey: string, summary: string, description: string) => Promise<JiraIssue>
    transitionIssue: (issueKey: string, transitionId: string) => Promise<void>
    getTransitions: (issueKey: string) => Promise<JiraTransition[]>
    getUsers: (projectKey: string) => Promise<JiraUser[]>
    getIssue: (issueKey: string) => Promise<JiraIssue>
    saveBoardConfig: (projectPath: string, config: { projectKey: string; boardId: number; boardName: string }) => Promise<void>
    getBoardConfig: (projectPath: string) => Promise<{ projectKey: string; boardId: number; boardName: string } | null>
  }
  stories?: {
    list: (projectPath: string) => Promise<Story[]>
    get: (id: string) => Promise<Story | null>
    create: (story: Partial<Story>) => Promise<Story>
    update: (id: string, updates: Partial<Story>) => Promise<Story>
    delete: (id: string) => Promise<void>
    getCriteria: (storyId: string) => Promise<StoryCriterion[]>
    addCriterion: (storyId: string, description: string) => Promise<StoryCriterion>
    updateCriterion: (id: string, updates: Partial<StoryCriterion>) => Promise<StoryCriterion>
    deleteCriterion: (id: string) => Promise<void>
    reorderCriteria: (storyId: string, criterionIds: string[]) => Promise<void>
    pushToJira: (storyId: string, projectKey: string) => Promise<void>
    syncFromJira: (storyId: string) => Promise<void>
    analyzeCoverage: (storyId: string) => Promise<void>
    onCoverageProgress: (callback: (data: { storyId: string; progress: number; message: string }) => void) => () => void
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
