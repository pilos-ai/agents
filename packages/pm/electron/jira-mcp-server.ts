/**
 * Jira MCP Server - Standalone script exposing Jira tools to Claude sessions.
 *
 * This file is auto-registered as an MCP server when Jira is connected.
 * It reads OAuth tokens from a temp file written by the main process.
 *
 * MCP Tools exposed:
 * - jira_search_issues: Search Jira issues with JQL
 * - jira_create_issue: Create a new Jira issue
 * - jira_create_epic: Create an epic
 * - jira_add_subtask: Add a sub-task to a parent issue
 * - jira_transition_issue: Transition an issue to a new status
 * - jira_get_sprint: Get current sprint issues
 *
 * Usage: This is meant to be spawned as a child process by the main Electron app
 * with stdin/stdout MCP protocol.
 */

import fs from 'fs'
import path from 'path'

// Token file path passed as first argument
const tokenFilePath = process.argv[2]

interface Tokens {
  accessToken: string
  cloudId: string
}

function readTokens(): Tokens | null {
  try {
    if (!tokenFilePath || !fs.existsSync(tokenFilePath)) return null
    const raw = fs.readFileSync(tokenFilePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function jiraRequest(path: string, tokens: Tokens, options: RequestInit = {}): Promise<unknown> {
  const url = `https://api.atlassian.com/ex/jira/${tokens.cloudId}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Jira API ${response.status}: ${text}`)
  }
  if (response.status === 204) return null
  return response.json()
}

// Simple MCP protocol handler over stdin/stdout
const tools = [
  {
    name: 'jira_search_issues',
    description: 'Search Jira issues using JQL query',
    inputSchema: {
      type: 'object',
      properties: {
        jql: { type: 'string', description: 'JQL search query' },
      },
      required: ['jql'],
    },
  },
  {
    name: 'jira_create_issue',
    description: 'Create a Jira issue (Task, Bug, Story)',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Jira project key (e.g. PROJ)' },
        summary: { type: 'string', description: 'Issue summary' },
        description: { type: 'string', description: 'Issue description' },
        issueType: { type: 'string', description: 'Issue type (Task, Bug, Story)', default: 'Task' },
      },
      required: ['projectKey', 'summary'],
    },
  },
  {
    name: 'jira_create_epic',
    description: 'Create a Jira epic',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Jira project key' },
        summary: { type: 'string', description: 'Epic summary' },
        description: { type: 'string', description: 'Epic description' },
      },
      required: ['projectKey', 'summary'],
    },
  },
  {
    name: 'jira_add_subtask',
    description: 'Add a sub-task to an existing issue',
    inputSchema: {
      type: 'object',
      properties: {
        parentKey: { type: 'string', description: 'Parent issue key (e.g. PROJ-123)' },
        summary: { type: 'string', description: 'Sub-task summary' },
        description: { type: 'string', description: 'Sub-task description' },
      },
      required: ['parentKey', 'summary'],
    },
  },
  {
    name: 'jira_transition_issue',
    description: 'Transition a Jira issue to a new status',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: { type: 'string', description: 'Issue key (e.g. PROJ-123)' },
        transitionName: { type: 'string', description: 'Target status name (e.g. "In Progress", "Done")' },
      },
      required: ['issueKey', 'transitionName'],
    },
  },
  {
    name: 'jira_get_sprint',
    description: 'Get issues in the current active sprint',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'number', description: 'Jira board ID' },
      },
      required: ['boardId'],
    },
  },
  {
    name: 'jira_delete_issue',
    description: 'Delete a Jira issue (and its sub-tasks if deleteSubtasks is true)',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: { type: 'string', description: 'Issue key to delete (e.g. PROJ-123)' },
        deleteSubtasks: { type: 'boolean', description: 'Also delete sub-tasks (default: true)', default: true },
      },
      required: ['issueKey'],
    },
  },
]

async function handleToolCall(name: string, input: Record<string, unknown>): Promise<string> {
  const tokens = readTokens()
  if (!tokens) return 'Error: Jira not connected (no tokens available)'

  switch (name) {
    case 'jira_search_issues': {
      const data = await jiraRequest(
        `/rest/api/3/search/jql`,
        tokens,
        {
          method: 'POST',
          body: JSON.stringify({
            jql: input.jql as string,
            maxResults: 50,
            fields: ['summary', 'status', 'priority', 'assignee', 'issuetype'],
          }),
        }
      ) as { issues: Array<Record<string, unknown>> }
      return JSON.stringify(data.issues.map((i: any) => ({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name,
        assignee: i.fields.assignee?.displayName,
        type: i.fields.issuetype?.name,
      })), null, 2)
    }

    case 'jira_create_issue': {
      const body = {
        fields: {
          project: { key: input.projectKey },
          summary: input.summary,
          description: input.description ? {
            type: 'doc', version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: input.description as string }] }],
          } : undefined,
          issuetype: { name: input.issueType || 'Task' },
        },
      }
      const result = await jiraRequest('/rest/api/3/issue', tokens, {
        method: 'POST', body: JSON.stringify(body),
      }) as { key: string }
      return `Created issue: ${result.key}`
    }

    case 'jira_create_epic': {
      const body = {
        fields: {
          project: { key: input.projectKey },
          summary: input.summary,
          description: input.description ? {
            type: 'doc', version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: input.description as string }] }],
          } : undefined,
          issuetype: { name: 'Epic' },
        },
      }
      const result = await jiraRequest('/rest/api/3/issue', tokens, {
        method: 'POST', body: JSON.stringify(body),
      }) as { key: string }
      return `Created epic: ${result.key}`
    }

    case 'jira_add_subtask': {
      const projectKey = (input.parentKey as string).split('-')[0]
      const body = {
        fields: {
          project: { key: projectKey },
          parent: { key: input.parentKey },
          summary: input.summary,
          description: input.description ? {
            type: 'doc', version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: input.description as string }] }],
          } : undefined,
          issuetype: { name: 'Sub-task' },
        },
      }
      const result = await jiraRequest('/rest/api/3/issue', tokens, {
        method: 'POST', body: JSON.stringify(body),
      }) as { key: string }
      return `Created sub-task: ${result.key}`
    }

    case 'jira_transition_issue': {
      const transitions = await jiraRequest(
        `/rest/api/3/issue/${encodeURIComponent(input.issueKey as string)}/transitions`,
        tokens
      ) as { transitions: Array<{ id: string; name: string }> }
      const target = transitions.transitions.find(
        (t) => t.name.toLowerCase() === (input.transitionName as string).toLowerCase()
      )
      if (!target) {
        return `Available transitions: ${transitions.transitions.map(t => t.name).join(', ')}`
      }
      await jiraRequest(
        `/rest/api/3/issue/${encodeURIComponent(input.issueKey as string)}/transitions`,
        tokens,
        { method: 'POST', body: JSON.stringify({ transition: { id: target.id } }) }
      )
      return `Transitioned ${input.issueKey} to "${target.name}"`
    }

    case 'jira_get_sprint': {
      const sprintsData = await jiraRequest(
        `/rest/agile/1.0/board/${input.boardId}/sprint?state=active`,
        tokens
      ) as { values: Array<{ id: number; name: string }> }
      if (sprintsData.values.length === 0) return 'No active sprint found'
      const sprint = sprintsData.values[0]
      const issuesData = await jiraRequest(
        `/rest/agile/1.0/sprint/${sprint.id}/issue?maxResults=50&fields=summary,status,assignee,issuetype,priority`,
        tokens
      ) as { issues: Array<Record<string, unknown>> }
      return JSON.stringify({
        sprint: sprint.name,
        issues: issuesData.issues.map((i: any) => ({
          key: i.key,
          summary: i.fields.summary,
          status: i.fields.status?.name,
          assignee: i.fields.assignee?.displayName,
          type: i.fields.issuetype?.name,
        })),
      }, null, 2)
    }

    case 'jira_delete_issue': {
      const deleteSubtasks = input.deleteSubtasks !== false
      await jiraRequest(
        `/rest/api/3/issue/${encodeURIComponent(input.issueKey as string)}?deleteSubtasks=${deleteSubtasks}`,
        tokens,
        { method: 'DELETE' }
      )
      return `Deleted issue: ${input.issueKey}${deleteSubtasks ? ' (including sub-tasks)' : ''}`
    }

    default:
      return `Unknown tool: ${name}`
  }
}

// Serialized request queue — Jira rate-limits concurrent requests, and
// if any parallel MCP tool call errors, Claude CLI auto-fails all siblings.
// Processing one at a time prevents cascading failures.
const requestQueue: Array<{ msg: JsonRpcMessage; resolve: () => void }> = []
let processing = false

async function drainQueue() {
  if (processing) return
  processing = true
  while (requestQueue.length > 0) {
    const item = requestQueue.shift()!
    await handleMessage(item.msg)
    item.resolve()
  }
  processing = false
}

function enqueue(msg: JsonRpcMessage) {
  return new Promise<void>((resolve) => {
    requestQueue.push({ msg, resolve })
    drainQueue()
  })
}

// Retry helper for Jira API calls (handles transient 429 / 5xx errors)
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const msg = String(err?.message || err)
      const isRetryable = /429|500|502|503|504/.test(msg)
      if (!isRetryable || attempt === retries) throw err
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)))
    }
  }
  throw new Error('Unreachable')
}

interface JsonRpcMessage { jsonrpc: string; id?: number; method: string; params?: unknown }

// MCP stdio protocol - simplified JSON-RPC over stdin/stdout
let buffer = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk: string) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line) as JsonRpcMessage
      // Non-tool methods (initialize, tools/list) are fast — still serialize for safety
      enqueue(msg)
    } catch {
      // Ignore malformed JSON
    }
  }
})

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function handleMessage(msg: JsonRpcMessage) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'jira-mcp-server', version: '1.0.0' },
      },
    })
  } else if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: { tools },
    })
  } else if (msg.method === 'tools/call') {
    const params = msg.params as { name: string; arguments: Record<string, unknown> }
    try {
      const result = await withRetry(() => handleToolCall(params.name, params.arguments || {}))
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: result }],
        },
      })
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: `Error: ${err}` }],
          isError: true,
        },
      })
    }
  } else if (msg.method === 'notifications/initialized') {
    // Acknowledgement from client, no response needed
  }
}
