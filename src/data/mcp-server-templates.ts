import type { McpServerTemplate } from '../types'

export const MCP_CATEGORIES = [
  'Development',
  'Database',
] as const

export const MCP_SERVER_TEMPLATES: McpServerTemplate[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    description: 'Issues, PRs, repos, and code search',
    category: 'Development',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: '' },
    },
    requiredEnvVars: ['GITHUB_TOKEN'],
    setupSteps: [
      'Go to github.com > Settings > Developer settings > Personal access tokens > Tokens (classic)',
      'Click "Generate new token (classic)"',
      'Select scopes: repo, read:org, read:user',
      'Copy the generated token and paste it as GITHUB_TOKEN below',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    icon: '⚡',
    description: 'Database queries, auth, and storage',
    category: 'Database',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@supabase/mcp-server-supabase'],
      env: { SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' },
    },
    requiredEnvVars: ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'],
    setupSteps: [
      'Open your Supabase project dashboard',
      'Go to Settings > API',
      'Copy "Project URL" and paste as SUPABASE_URL',
      'Copy "service_role" key (under Project API keys) and paste as SUPABASE_SERVICE_KEY',
      'Warning: service_role key bypasses RLS — use with caution',
    ],
    docsUrl: 'https://supabase.com/docs/guides/api#api-url-and-keys',
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    icon: '📁',
    description: 'Read, write, and search files',
    category: 'Development',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: {},
    },
    requiredEnvVars: [],
    setupSteps: [
      'No configuration needed — works out of the box',
      'You can optionally pass allowed directories as additional args',
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
  },
]
