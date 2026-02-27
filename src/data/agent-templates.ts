import type { AgentDefinition, AgentCapabilities } from '../types'

export interface AgentTemplateCategory {
  name: string
  templates: AgentDefinition[]
}

// ── Available Tools ──

export interface ToolDefinition {
  id: string
  name: string
  icon: string
  description: string
}

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  { id: 'fs_access',   name: 'FS_ACCESS',  icon: 'lucide:file-code',  description: 'Read, write, and search project files' },
  { id: 'git_ops',     name: 'GIT_OPS',    icon: 'lucide:git-branch', description: 'Git operations: commit, branch, diff, log' },
  { id: 'web_search',  name: 'SEARCH',     icon: 'lucide:globe',      description: 'Web search and URL fetching' },
  { id: 'code_exec',   name: 'CODE_EXEC',  icon: 'lucide:terminal',   description: 'Execute shell commands and scripts' },
  { id: 'mcp_servers', name: 'MCP',        icon: 'lucide:plug-zap',   description: 'Access connected MCP servers' },
  { id: 'browser',     name: 'BROWSER',    icon: 'lucide:chrome',     description: 'Browser automation and web interaction' },
]

export const DEFAULT_CAPABILITIES: AgentCapabilities = {
  tools: ['fs_access', 'git_ops', 'web_search', 'code_exec'],
  allowedPaths: [],
  maxTokensPerRequest: 4096,
  permissionLevel: 'standard',
  allowedMcpServers: [],
  contextWindowSize: 128000,
  conversationHistoryLimit: 50,
  memoryEnabled: true,
  memorySummarizationEnabled: true,
  customInstructions: '',
  temperature: 0.7,
  responseFormat: 'markdown',
  maxRetries: 2,
  timeoutSeconds: 120,
  debugMode: false,
  autoApproveReadOnly: true,
}

// ── All Templates ──

export const AGENT_TEMPLATES: AgentDefinition[] = [
  // Engineering
  {
    id: 'pm',
    name: 'PM',
    icon: 'lucide:clipboard-list',
    color: 'blue',
    role: 'Project Manager',
    personality: 'You are a pragmatic project manager who breaks down tasks into clear steps, tracks priorities, and keeps the team focused. You ask clarifying questions and define acceptance criteria.',
    expertise: ['task breakdown', 'priorities', 'requirements', 'coordination'],
    capabilities: { ...DEFAULT_CAPABILITIES, tools: ['fs_access', 'web_search'] },
  },
  {
    id: 'architect',
    name: 'Architect',
    icon: 'lucide:blocks',
    color: 'purple',
    role: 'Software Architect',
    personality: 'You are a thoughtful software architect who focuses on system design, scalability, and maintainable patterns. You consider trade-offs and propose clean abstractions.',
    expertise: ['system design', 'patterns', 'trade-offs', 'architecture'],
    capabilities: { ...DEFAULT_CAPABILITIES, tools: ['fs_access', 'git_ops', 'web_search'] },
  },
  {
    id: 'developer',
    name: 'Dev',
    icon: 'lucide:code-2',
    color: 'green',
    role: 'Senior Developer',
    personality: 'You are a skilled developer who writes clean, efficient code. You focus on implementation details, debugging, and practical solutions. You handle all tool use (file edits, bash commands).',
    expertise: ['implementation', 'debugging', 'code review', 'refactoring'],
    capabilities: { ...DEFAULT_CAPABILITIES, tools: ['fs_access', 'git_ops', 'web_search', 'code_exec', 'mcp_servers', 'browser'] },
  },
  {
    id: 'designer',
    name: 'Designer',
    icon: 'lucide:palette',
    color: 'pink',
    role: 'UI/UX Designer',
    personality: 'You are a detail-oriented designer who cares about user experience, accessibility, and visual consistency. You suggest layout improvements and design system patterns.',
    expertise: ['UI/UX', 'accessibility', 'visual design', 'user flows'],
    capabilities: { ...DEFAULT_CAPABILITIES, tools: ['fs_access', 'web_search', 'browser'] },
  },

  // Management
  {
    id: 'product',
    name: 'Product',
    icon: 'lucide:target',
    color: 'indigo',
    role: 'Product Manager',
    personality: 'You are a product-minded thinker who prioritizes features based on user value and business impact. You define roadmaps, write user stories, and balance competing stakeholder needs.',
    expertise: ['product strategy', 'user stories', 'prioritization', 'roadmapping'],
    capabilities: { ...DEFAULT_CAPABILITIES, tools: ['fs_access', 'web_search'] },
  },
]

// ── Categories for Template Picker ──

export const AGENT_TEMPLATE_CATEGORIES: AgentTemplateCategory[] = [
  {
    name: 'Engineering',
    templates: AGENT_TEMPLATES.filter((t) =>
      ['architect', 'developer', 'designer'].includes(t.id)
    ),
  },
  {
    name: 'Management',
    templates: AGENT_TEMPLATES.filter((t) =>
      ['pm', 'product'].includes(t.id)
    ),
  },
]

// ── Colors ──

export const AGENT_COLORS: Record<string, { text: string; bgLight: string; border: string }> = {
  blue:   { text: 'text-blue-400',   bgLight: 'bg-blue-600/15',   border: 'border-blue-500/30' },
  purple: { text: 'text-purple-400', bgLight: 'bg-purple-600/15', border: 'border-purple-500/30' },
  green:  { text: 'text-green-400',  bgLight: 'bg-green-600/15',  border: 'border-green-500/30' },
  pink:   { text: 'text-pink-400',   bgLight: 'bg-pink-600/15',   border: 'border-pink-500/30' },
  orange: { text: 'text-orange-400', bgLight: 'bg-orange-600/15', border: 'border-orange-500/30' },
  cyan:   { text: 'text-cyan-400',   bgLight: 'bg-cyan-600/15',   border: 'border-cyan-500/30' },
  yellow: { text: 'text-yellow-400', bgLight: 'bg-yellow-600/15', border: 'border-yellow-500/30' },
  red:    { text: 'text-red-400',    bgLight: 'bg-red-600/15',    border: 'border-red-500/30' },
  indigo: { text: 'text-indigo-400', bgLight: 'bg-indigo-600/15', border: 'border-indigo-500/30' },
}

// ── Team Presets ──

export const TEAM_PRESETS: Record<string, string[]> = {
  'Full Team':      ['pm', 'architect', 'developer', 'designer', 'product'],
  'Dev Team':       ['architect', 'developer', 'designer'],
  'Design Sprint':  ['pm', 'designer', 'developer'],
  'Product':        ['product', 'designer', 'developer', 'pm'],
}
