import type { McpToolCategory, OutputField } from '../types/workflow'

// ── Structural node output schemas (used by DataPicker) ──

export const LOOP_COLLECTION_OUTPUT: OutputField[] = [
  { key: 'currentItem', label: 'Current Item', type: 'object', description: 'The current item in the collection' },
  { key: 'currentIndex', label: 'Current Index', type: 'number', description: '0-based iteration index' },
]

export const LOOP_COUNT_OUTPUT: OutputField[] = [
  { key: 'currentIndex', label: 'Current Index', type: 'number', description: '0-based iteration index' },
  { key: 'currentIteration', label: 'Current Iteration', type: 'number', description: '1-based iteration number' },
]

export const VARIABLE_OUTPUT: OutputField[] = [
  { key: 'variable', label: 'Variable Name', type: 'string' },
  { key: 'value', label: 'Value', type: 'string' },
]

export const CONDITION_OUTPUT: OutputField[] = [
  { key: 'condition', label: 'Result', type: 'boolean' },
]

export const DELAY_OUTPUT: OutputField[] = [
  { key: 'delayed', label: 'Delayed (ms)', type: 'number' },
]

export const AI_PROMPT_OUTPUT: OutputField[] = [
  { key: 'result', label: 'AI Response', type: 'string', description: 'Claude response (may be JSON if requested)' },
]

export const RESULTS_DISPLAY_OUTPUT: OutputField[] = [
  { key: 'data', label: 'Displayed Data', type: 'object', description: 'The collected results data' },
]

export const AGENT_OUTPUT: OutputField[] = [
  { key: 'result', label: 'Agent Response', type: 'string', description: 'Full text response from the Claude Code agent session' },
  { key: 'toolsUsed', label: 'Tools Used', type: 'array', description: 'List of tools the agent invoked' },
]

export const WORKFLOW_TOOL_CATEGORIES: McpToolCategory[] = [
  {
    name: 'Git Operations',
    icon: 'lucide:git-branch',
    tools: [
      {
        id: 'git_checkout',
        name: 'Git Checkout',
        icon: 'lucide:git-branch',
        description: 'Switch branches',
        category: 'Git Operations',
        parameters: [
          { key: 'branch', label: 'Branch Name', type: 'string', value: '', required: true },
          { key: 'create', label: 'Create New Branch', type: 'boolean', value: false },
          { key: 'baseBranch', label: 'Base Branch', type: 'string', value: '' },
        ],
        outputSchema: [
          { key: 'branch', label: 'Current Branch', type: 'string' },
          { key: 'created', label: 'Was Created', type: 'boolean' },
        ],
      },
      {
        id: 'git_pull',
        name: 'Git Pull',
        icon: 'lucide:download',
        description: 'Pull latest changes',
        category: 'Git Operations',
        parameters: [
          { key: 'remote', label: 'Remote', type: 'string', value: 'origin' },
          { key: 'branch', label: 'Branch', type: 'string', value: '' },
          { key: 'rebase', label: 'Rebase', type: 'boolean', value: false },
        ],
        outputSchema: [
          { key: 'stdout', label: 'Output', type: 'string' },
          { key: 'updatedFiles', label: 'Updated Files Count', type: 'number' },
        ],
      },
      {
        id: 'git_push',
        name: 'Git Push',
        icon: 'lucide:upload',
        description: 'Push to remote',
        category: 'Git Operations',
        parameters: [
          { key: 'remote', label: 'Remote', type: 'string', value: 'origin' },
          { key: 'branch', label: 'Branch', type: 'string', value: '' },
          { key: 'setUpstream', label: 'Set Upstream', type: 'boolean', value: false },
        ],
        outputSchema: [
          { key: 'stdout', label: 'Output', type: 'string' },
          { key: 'branch', label: 'Pushed Branch', type: 'string' },
        ],
      },
      {
        id: 'git_merge',
        name: 'Git Merge',
        icon: 'lucide:git-merge',
        description: 'Merge branches',
        category: 'Git Operations',
        parameters: [
          { key: 'branch', label: 'Source Branch', type: 'string', value: '', required: true },
          { key: 'message', label: 'Merge Message', type: 'string', value: '' },
          { key: 'noFf', label: 'No Fast-Forward', type: 'boolean', value: false },
        ],
        outputSchema: [
          { key: 'stdout', label: 'Output', type: 'string' },
          { key: 'hash', label: 'Merge Commit', type: 'string' },
        ],
      },
      {
        id: 'git_commit',
        name: 'Git Commit',
        icon: 'lucide:git-commit-horizontal',
        description: 'Commit staged changes',
        category: 'Git Operations',
        parameters: [
          { key: 'message', label: 'Commit Message', type: 'string', value: '', required: true },
          { key: 'addAll', label: 'Stage All Changes', type: 'boolean', value: false },
        ],
        outputSchema: [
          { key: 'hash', label: 'Commit Hash', type: 'string' },
          { key: 'message', label: 'Message', type: 'string' },
        ],
      },
      {
        id: 'git_diff',
        name: 'Git Diff',
        icon: 'lucide:diff',
        description: 'Compare file changes',
        category: 'Git Operations',
        parameters: [
          { key: 'ref', label: 'Reference', type: 'string', value: 'HEAD' },
        ],
        outputSchema: [
          { key: 'diff', label: 'Diff Output', type: 'string' },
          { key: 'files', label: 'Changed Files', type: 'array', children: [
            { key: 'path', label: 'File Path', type: 'string' },
            { key: 'status', label: 'Status', type: 'string' },
          ]},
        ],
      },
      {
        id: 'create_pr',
        name: 'Create PR',
        icon: 'lucide:git-pull-request',
        description: 'Create pull request',
        category: 'Git Operations',
        parameters: [
          { key: 'title', label: 'PR Title', type: 'string', value: '', required: true },
          { key: 'branch', label: 'Branch', type: 'string', value: '' },
          { key: 'baseBranch', label: 'Base Branch', type: 'string', value: 'main' },
          { key: 'description', label: 'Description', type: 'string', value: '' },
        ],
        outputSchema: [
          { key: 'url', label: 'PR URL', type: 'string' },
          { key: 'number', label: 'PR Number', type: 'number' },
          { key: 'title', label: 'Title', type: 'string' },
        ],
      },
    ],
  },
  {
    name: 'File Operations',
    icon: 'lucide:file-edit',
    tools: [
      {
        id: 'read_files',
        name: 'Read Files',
        icon: 'lucide:file-search',
        description: 'Read file or directory',
        category: 'File Operations',
        parameters: [
          { key: 'path', label: 'File Path', type: 'string', value: '', required: true },
          { key: 'recursive', label: 'Recursive', type: 'boolean', value: false },
        ],
        direct: { handler: 'files.read', paramMap: { path: 'path', recursive: 'recursive' } },
        outputSchema: [
          { key: 'content', label: 'File Content', type: 'string' },
          { key: 'path', label: 'File Path', type: 'string' },
          { key: 'type', label: 'Type', type: 'string', description: 'file or directory' },
          { key: 'entries', label: 'Directory Entries', type: 'array', children: [
            { key: 'name', label: 'Name', type: 'string' },
            { key: 'type', label: 'Type', type: 'string' },
          ]},
          { key: 'count', label: 'Entry Count', type: 'number' },
        ],
      },
      {
        id: 'write_file',
        name: 'Write File',
        icon: 'lucide:file-plus',
        description: 'Create or overwrite file',
        category: 'File Operations',
        parameters: [
          { key: 'path', label: 'File Path', type: 'string', value: '', required: true },
          { key: 'content', label: 'Content', type: 'string', value: '', required: true },
        ],
        outputSchema: [
          { key: 'path', label: 'File Path', type: 'string' },
          { key: 'written', label: 'Bytes Written', type: 'number' },
        ],
      },
      {
        id: 'edit_file',
        name: 'Edit File',
        icon: 'lucide:file-edit',
        description: 'Search and replace in file',
        category: 'File Operations',
        parameters: [
          { key: 'path', label: 'File Path', type: 'string', value: '', required: true },
          { key: 'search', label: 'Search Text', type: 'string', value: '', required: true },
          { key: 'replace', label: 'Replace With', type: 'string', value: '', required: true },
          { key: 'replaceAll', label: 'Replace All', type: 'boolean', value: false },
        ],
        outputSchema: [
          { key: 'path', label: 'File Path', type: 'string' },
          { key: 'replacements', label: 'Replacements Made', type: 'number' },
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
        outputSchema: [
          { key: 'result', label: 'Transformed Data', type: 'string' },
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
        outputSchema: [
          { key: 'results', label: 'Filtered Results', type: 'array' },
          { key: 'count', label: 'Result Count', type: 'number' },
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
        outputSchema: [
          { key: 'result', label: 'Aggregate Result', type: 'number' },
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
        direct: { handler: 'jira.getIssues', paramMap: { jql: 'jql' } },
        outputSchema: [
          { key: 'issues', label: 'Issues', type: 'array', children: [
            { key: 'key', label: 'Issue Key', type: 'string' },
            { key: 'summary', label: 'Summary', type: 'string' },
            { key: 'status', label: 'Status', type: 'string' },
            { key: 'assignee', label: 'Assignee', type: 'string' },
            { key: 'priority', label: 'Priority', type: 'string' },
            { key: 'description', label: 'Description', type: 'string' },
            { key: 'issueType', label: 'Issue Type', type: 'string' },
          ]},
          { key: 'total', label: 'Total Count', type: 'number' },
        ],
      },
      {
        id: 'jira_get_issue',
        name: 'Get Issue',
        icon: 'lucide:file-text',
        description: 'Get single issue details',
        category: 'Jira Integration',
        parameters: [
          { key: 'issueKey', label: 'Issue Key', type: 'string', value: '', required: true },
        ],
        direct: { handler: 'jira.getIssue', paramMap: { issueKey: 'issueKey' } },
        outputSchema: [
          { key: 'key', label: 'Issue Key', type: 'string' },
          { key: 'summary', label: 'Summary', type: 'string' },
          { key: 'status', label: 'Status', type: 'string' },
          { key: 'assignee', label: 'Assignee', type: 'string' },
          { key: 'priority', label: 'Priority', type: 'string' },
          { key: 'description', label: 'Description', type: 'string' },
          { key: 'issueType', label: 'Issue Type', type: 'string' },
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
        direct: { handler: 'jira.createIssue', paramMap: { summary: 'summary', issueType: 'issueType', description: 'description' } },
        outputSchema: [
          { key: 'key', label: 'Issue Key', type: 'string' },
          { key: 'summary', label: 'Summary', type: 'string' },
          { key: 'self', label: 'Issue URL', type: 'string' },
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
        direct: { handler: 'jira.transitionIssue', paramMap: { issueKey: 'issueKey', status: 'status' } },
        outputSchema: [
          { key: 'issueKey', label: 'Issue Key', type: 'string' },
          { key: 'newStatus', label: 'New Status', type: 'string' },
          { key: 'transitionId', label: 'Transition ID', type: 'string' },
        ],
      },
      {
        id: 'jira_get_transitions',
        name: 'Get Transitions',
        icon: 'lucide:list',
        description: 'List available transitions',
        category: 'Jira Integration',
        parameters: [
          { key: 'issueKey', label: 'Issue Key', type: 'string', value: '', required: true },
        ],
        direct: { handler: 'jira.getTransitions', paramMap: { issueKey: 'issueKey' } },
        outputSchema: [
          { key: 'issueKey', label: 'Issue Key', type: 'string' },
          { key: 'transitions', label: 'Transitions', type: 'array', children: [
            { key: 'id', label: 'ID', type: 'string' },
            { key: 'name', label: 'Name', type: 'string' },
          ]},
        ],
      },
      {
        id: 'jira_delete',
        name: 'Delete Issue',
        icon: 'lucide:trash-2',
        description: 'Delete a Jira issue',
        category: 'Jira Integration',
        parameters: [
          { key: 'issueKey', label: 'Issue Key', type: 'string', value: '', required: true },
        ],
        outputSchema: [
          { key: 'status', label: 'Status', type: 'string' },
          { key: 'issueKey', label: 'Deleted Key', type: 'string' },
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
        outputSchema: [
          { key: 'ok', label: 'Success', type: 'boolean' },
          { key: 'ts', label: 'Timestamp', type: 'string' },
          { key: 'channel', label: 'Channel ID', type: 'string' },
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
        outputSchema: [
          { key: 'ok', label: 'Success', type: 'boolean' },
          { key: 'ts', label: 'Timestamp', type: 'string' },
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
        outputSchema: [
          { key: 'stdout', label: 'Output', type: 'string' },
          { key: 'stderr', label: 'Errors', type: 'string' },
          { key: 'exitCode', label: 'Exit Code', type: 'number' },
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
        outputSchema: [
          { key: 'stdout', label: 'Output', type: 'string' },
          { key: 'stderr', label: 'Errors', type: 'string' },
          { key: 'exitCode', label: 'Exit Code', type: 'number' },
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
        outputSchema: [
          { key: 'results', label: 'Search Results', type: 'array', children: [
            { key: 'title', label: 'Title', type: 'string' },
            { key: 'url', label: 'URL', type: 'string' },
            { key: 'snippet', label: 'Snippet', type: 'string' },
          ]},
        ],
      },
    ],
  },
  {
    name: 'HTTP / API',
    icon: 'lucide:globe',
    tools: [
      {
        id: 'api_request',
        name: 'API Request',
        icon: 'lucide:send',
        description: 'Generic HTTP request',
        category: 'HTTP / API',
        parameters: [
          { key: 'url', label: 'URL', type: 'string', value: '', required: true },
          { key: 'method', label: 'Method', type: 'select', value: 'GET', options: [
            { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' }, { value: 'PATCH', label: 'PATCH' },
            { value: 'DELETE', label: 'DELETE' },
          ]},
          { key: 'headers', label: 'Headers', type: 'json', value: '{}' },
          { key: 'body', label: 'Request Body', type: 'json', value: '' },
          { key: 'auth', label: 'Auth Token', type: 'string', value: '' },
        ],
        outputSchema: [
          { key: 'status', label: 'HTTP Status', type: 'number' },
          { key: 'body', label: 'Response Body', type: 'string' },
          { key: 'headers', label: 'Response Headers', type: 'object' },
          { key: 'data', label: 'Parsed JSON', type: 'object' },
        ],
      },
      {
        id: 'webhook',
        name: 'Webhook',
        icon: 'lucide:webhook',
        description: 'Send HTTP webhook',
        category: 'HTTP / API',
        parameters: [
          { key: 'url', label: 'Webhook URL', type: 'string', value: '', required: true },
          { key: 'method', label: 'Method', type: 'select', value: 'POST', options: [{ value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }, { value: 'PATCH', label: 'PATCH' }] },
          { key: 'payload', label: 'Payload', type: 'json', value: '{}' },
        ],
        outputSchema: [
          { key: 'status', label: 'HTTP Status', type: 'number' },
          { key: 'body', label: 'Response Body', type: 'string' },
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
        description: 'SMTP Integration',
        category: 'Notifications',
        parameters: [
          { key: 'to', label: 'To', type: 'string', value: '', required: true },
          { key: 'subject', label: 'Subject', type: 'string', value: '', required: true },
          { key: 'body', label: 'Body', type: 'string', value: '' },
        ],
        outputSchema: [
          { key: 'sent', label: 'Sent', type: 'boolean' },
          { key: 'messageId', label: 'Message ID', type: 'string' },
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

const CODE_CATEGORIES = new Set(['Git Operations', 'File Operations', 'Code Execution'])
const DATA_CATEGORIES = new Set(['Data Processing'])
const API_CATEGORIES = new Set(['Jira Integration', 'Slack Integration', 'HTTP / API', 'Notifications'])

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
