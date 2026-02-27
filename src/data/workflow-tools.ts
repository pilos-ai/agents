import type { McpToolCategory } from '../types/workflow'

export const WORKFLOW_TOOL_CATEGORIES: McpToolCategory[] = [
  {
    name: 'GitHub Operations',
    icon: 'lucide:github',
    tools: [
      {
        id: 'read_files',
        name: 'Read Files',
        icon: 'lucide:file-search',
        description: 'Fetch source context',
        category: 'GitHub Operations',
        parameters: [
          { key: 'path', label: 'File Path', type: 'string', value: '', required: true },
          { key: 'recursive', label: 'Recursive', type: 'boolean', value: false },
        ],
      },
      {
        id: 'create_pr',
        name: 'Create PR',
        icon: 'lucide:git-pull-request',
        description: 'Automate submissions',
        category: 'GitHub Operations',
        parameters: [
          { key: 'title', label: 'PR Title', type: 'string', value: '', required: true },
          { key: 'branch', label: 'Branch', type: 'string', value: '' },
          { key: 'description', label: 'Description', type: 'string', value: '' },
        ],
      },
      {
        id: 'git_commit',
        name: 'Git Commit',
        icon: 'lucide:git-commit-horizontal',
        description: 'Commit staged changes',
        category: 'GitHub Operations',
        parameters: [
          { key: 'message', label: 'Commit Message', type: 'string', value: '', required: true },
        ],
      },
      {
        id: 'git_diff',
        name: 'Git Diff',
        icon: 'lucide:diff',
        description: 'Compare file changes',
        category: 'GitHub Operations',
        parameters: [
          { key: 'ref', label: 'Reference', type: 'string', value: 'HEAD' },
        ],
      },
    ],
  },
  {
    name: 'Data Processing',
    icon: 'lucide:database',
    tools: [
      {
        id: 'transform_json',
        name: 'Transform JSON',
        icon: 'lucide:braces',
        description: 'Map data schema',
        category: 'Data Processing',
        parameters: [
          { key: 'outputFormat', label: 'Output Format', type: 'select', value: 'json', options: [{ value: 'json', label: 'JSON' }, { value: 'csv', label: 'CSV' }, { value: 'yaml', label: 'YAML' }] },
          { key: 'contextDepth', label: 'Context Depth', type: 'number', value: 4 },
          { key: 'flattenHierarchy', label: 'Flatten Hierarchy', type: 'boolean', value: false },
        ],
      },
      {
        id: 'filter_data',
        name: 'Filter Data',
        icon: 'lucide:filter',
        description: 'Filter and reduce datasets',
        category: 'Data Processing',
        parameters: [
          { key: 'expression', label: 'Filter Expression', type: 'string', value: '', required: true },
        ],
      },
      {
        id: 'aggregate',
        name: 'Aggregate',
        icon: 'lucide:sigma',
        description: 'Summarize and aggregate data',
        category: 'Data Processing',
        parameters: [
          { key: 'operation', label: 'Operation', type: 'select', value: 'count', options: [{ value: 'count', label: 'Count' }, { value: 'sum', label: 'Sum' }, { value: 'avg', label: 'Average' }] },
        ],
      },
    ],
  },
  {
    name: 'Jira Integration',
    icon: 'lucide:layout-kanban',
    tools: [
      {
        id: 'jira_search',
        name: 'Search Issues',
        icon: 'lucide:search',
        description: 'Search with JQL',
        category: 'Jira Integration',
        parameters: [
          { key: 'jql', label: 'JQL Query', type: 'string', value: '', required: true },
          { key: 'maxResults', label: 'Max Results', type: 'number', value: 50 },
        ],
      },
      {
        id: 'jira_create',
        name: 'Create Issue',
        icon: 'lucide:plus-circle',
        description: 'Create Jira ticket',
        category: 'Jira Integration',
        parameters: [
          { key: 'summary', label: 'Summary', type: 'string', value: '', required: true },
          { key: 'issueType', label: 'Issue Type', type: 'select', value: 'Task', options: [{ value: 'Task', label: 'Task' }, { value: 'Bug', label: 'Bug' }, { value: 'Story', label: 'Story' }] },
          { key: 'description', label: 'Description', type: 'string', value: '' },
        ],
      },
      {
        id: 'jira_transition',
        name: 'Transition Issue',
        icon: 'lucide:arrow-right-circle',
        description: 'Move issue status',
        category: 'Jira Integration',
        parameters: [
          { key: 'issueKey', label: 'Issue Key', type: 'string', value: '', required: true },
          { key: 'status', label: 'Target Status', type: 'string', value: '' },
        ],
      },
    ],
  },
  {
    name: 'Slack Integration',
    icon: 'lucide:hash',
    tools: [
      {
        id: 'slack_message',
        name: 'Send Message',
        icon: 'lucide:message-square',
        description: 'Post to channel',
        category: 'Slack Integration',
        parameters: [
          { key: 'channel', label: 'Channel', type: 'string', value: '', required: true },
          { key: 'message', label: 'Message', type: 'string', value: '', required: true },
        ],
      },
      {
        id: 'slack_thread',
        name: 'Reply in Thread',
        icon: 'lucide:messages-square',
        description: 'Reply to a thread',
        category: 'Slack Integration',
        parameters: [
          { key: 'threadId', label: 'Thread ID', type: 'string', value: '', required: true },
          { key: 'message', label: 'Message', type: 'string', value: '', required: true },
        ],
      },
    ],
  },
  {
    name: 'Code Execution',
    icon: 'lucide:terminal',
    tools: [
      {
        id: 'run_command',
        name: 'Run Command',
        icon: 'lucide:terminal',
        description: 'Execute shell command',
        category: 'Code Execution',
        parameters: [
          { key: 'command', label: 'Command', type: 'string', value: '', required: true },
          { key: 'cwd', label: 'Working Directory', type: 'string', value: '' },
          { key: 'timeout', label: 'Timeout (ms)', type: 'number', value: 30000 },
        ],
      },
      {
        id: 'run_script',
        name: 'Run Script',
        icon: 'lucide:file-code-2',
        description: 'Execute script file',
        category: 'Code Execution',
        parameters: [
          { key: 'path', label: 'Script Path', type: 'string', value: '', required: true },
          { key: 'args', label: 'Arguments', type: 'string', value: '' },
        ],
      },
      {
        id: 'web_search',
        name: 'Web Search',
        icon: 'lucide:globe',
        description: 'Search the web',
        category: 'Code Execution',
        parameters: [
          { key: 'query', label: 'Search Query', type: 'string', value: '', required: true },
        ],
      },
    ],
  },
  {
    name: 'Notifications',
    icon: 'lucide:bell',
    tools: [
      {
        id: 'email_alert',
        name: 'Email Alert',
        icon: 'lucide:bell-ring',
        description: 'SMTP SMTP Integration',
        category: 'Notifications',
        parameters: [
          { key: 'to', label: 'To', type: 'string', value: '', required: true },
          { key: 'subject', label: 'Subject', type: 'string', value: '', required: true },
          { key: 'body', label: 'Body', type: 'string', value: '' },
        ],
      },
      {
        id: 'webhook',
        name: 'Webhook',
        icon: 'lucide:webhook',
        description: 'Send HTTP webhook',
        category: 'Notifications',
        parameters: [
          { key: 'url', label: 'Webhook URL', type: 'string', value: '', required: true },
          { key: 'method', label: 'Method', type: 'select', value: 'POST', options: [{ value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }, { value: 'PATCH', label: 'PATCH' }] },
          { key: 'payload', label: 'Payload', type: 'json', value: '{}' },
        ],
      },
    ],
  },
]

export const TOOL_FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'code', label: 'Code' },
  { id: 'data', label: 'Data' },
  { id: 'api', label: 'API' },
] as const

const CODE_CATEGORIES = new Set(['GitHub Operations', 'Code Execution'])
const DATA_CATEGORIES = new Set(['Data Processing'])
const API_CATEGORIES = new Set(['Jira Integration', 'Slack Integration', 'Notifications'])

export function filterToolCategories(categories: McpToolCategory[], tab: string, search: string): McpToolCategory[] {
  let filtered = categories

  if (tab !== 'all') {
    const allowed = tab === 'code' ? CODE_CATEGORIES : tab === 'data' ? DATA_CATEGORIES : API_CATEGORIES
    filtered = filtered.filter((c) => allowed.has(c.name))
  }

  if (search) {
    const q = search.toLowerCase()
    filtered = filtered
      .map((c) => ({
        ...c,
        tools: c.tools.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
      }))
      .filter((c) => c.tools.length > 0)
  }

  return filtered
}
