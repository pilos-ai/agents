import type { JiraOAuth, JiraTokens } from './jira-oauth'

export interface JiraProject {
  id: string
  key: string
  name: string
  avatarUrl?: string
}

export interface JiraBoard {
  id: number
  name: string
  type: string
}

export interface JiraSprint {
  id: number
  name: string
  state: string
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

export class JiraClient {
  private oauth: JiraOAuth

  constructor(oauth: JiraOAuth) {
    this.oauth = oauth
  }

  private async request(path: string, options: RequestInit = {}): Promise<unknown> {
    const tokens = await this.oauth.getValidTokens()
    if (!tokens) throw new Error('Not connected to Jira')

    const baseUrl = `https://api.atlassian.com/ex/jira/${tokens.cloudId}`
    const url = `${baseUrl}${path}`

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
      throw new Error(`Jira API error ${response.status}: ${text}`)
    }

    if (response.status === 204) return null
    return response.json()
  }

  async getProjects(): Promise<JiraProject[]> {
    const data = await this.request('/rest/api/3/project/search?maxResults=50') as {
      values: Array<{ id: string; key: string; name: string; avatarUrls?: Record<string, string> }>
    }
    return data.values.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      avatarUrl: p.avatarUrls?.['24x24'],
    }))
  }

  async getBoards(projectKey: string): Promise<JiraBoard[]> {
    const data = await this.request(
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`
    ) as { values: Array<{ id: number; name: string; type: string }> }
    return data.values.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
    }))
  }

  async getSprints(boardId: number): Promise<JiraSprint[]> {
    const data = await this.request(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active,future&maxResults=20`
    ) as { values: Array<JiraSprint> }
    return data.values
  }

  async getBoardIssues(boardId: number): Promise<JiraIssue[]> {
    const data = await this.request(
      `/rest/agile/1.0/board/${boardId}/issue?maxResults=100&fields=summary,status,priority,assignee,issuetype,created,updated,parent,${encodeURIComponent('customfield_10016')}`
    ) as { issues: Array<Record<string, unknown>> }
    return data.issues.map(mapIssue)
  }

  async getSprintIssues(sprintId: number): Promise<JiraIssue[]> {
    const data = await this.request(
      `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=100&fields=summary,status,priority,assignee,issuetype,created,updated,parent,${encodeURIComponent('customfield_10016')}`
    ) as { issues: Array<Record<string, unknown>> }
    return data.issues.map(mapIssue)
  }

  async getIssues(jql: string): Promise<JiraIssue[]> {
    const data = await this.request(
      `/rest/api/3/search/jql`,
      {
        method: 'POST',
        body: JSON.stringify({
          jql,
          maxResults: 100,
          fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'created', 'updated', 'parent', 'customfield_10016'],
        }),
      }
    ) as { issues: Array<Record<string, unknown>> }
    return data.issues.map(mapIssue)
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const data = await this.request(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,priority,assignee,issuetype,created,updated,parent,description,${encodeURIComponent('customfield_10016')}`
    ) as Record<string, unknown>
    return mapIssue(data)
  }

  async createEpic(projectKey: string, summary: string, description: string): Promise<JiraIssue> {
    const body = {
      fields: {
        project: { key: projectKey },
        summary,
        description: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
        },
        issuetype: { name: 'Epic' },
      },
    }
    const data = await this.request('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify(body),
    }) as { id: string; key: string }
    return this.getIssue(data.key)
  }

  async createSubTask(parentKey: string, summary: string, description: string): Promise<JiraIssue> {
    // Get parent to find project key
    const parent = await this.getIssue(parentKey)
    const projectKey = parentKey.split('-')[0]

    const body = {
      fields: {
        project: { key: projectKey },
        parent: { key: parentKey },
        summary,
        description: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
        },
        issuetype: { name: 'Sub-task' },
      },
    }
    const data = await this.request('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify(body),
    }) as { id: string; key: string }
    return this.getIssue(data.key)
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    })
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const data = await this.request(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`
    ) as { transitions: JiraTransition[] }
    return data.transitions
  }

  async getUsers(projectKey: string): Promise<JiraUser[]> {
    const data = await this.request(
      `/rest/api/3/user/assignable/search?project=${encodeURIComponent(projectKey)}&maxResults=50`
    ) as Array<{ accountId: string; displayName: string; avatarUrls?: Record<string, string>; emailAddress?: string }>
    return data.map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrls?.['24x24'],
      emailAddress: u.emailAddress,
    }))
  }
}

function mapIssue(raw: Record<string, unknown>): JiraIssue {
  const fields = raw.fields as Record<string, unknown>
  const status = fields.status as Record<string, unknown> | undefined
  const statusCategory = status?.statusCategory as Record<string, unknown> | undefined
  const priority = fields.priority as Record<string, unknown> | undefined
  const assignee = fields.assignee as Record<string, unknown> | undefined
  const issuetype = fields.issuetype as Record<string, unknown> | undefined
  const parent = fields.parent as Record<string, unknown> | undefined

  return {
    id: raw.id as string,
    key: raw.key as string,
    summary: fields.summary as string,
    description: typeof fields.description === 'string' ? fields.description : undefined,
    status: {
      name: (status?.name as string) || 'Unknown',
      categoryKey: (statusCategory?.key as string) || 'undefined',
    },
    priority: priority ? {
      name: priority.name as string,
      iconUrl: priority.iconUrl as string | undefined,
    } : undefined,
    assignee: assignee ? {
      accountId: assignee.accountId as string,
      displayName: assignee.displayName as string,
      avatarUrl: (assignee.avatarUrls as Record<string, string>)?.['24x24'],
    } : undefined,
    issuetype: {
      name: (issuetype?.name as string) || 'Task',
      subtask: (issuetype?.subtask as boolean) || false,
    },
    storyPoints: fields['customfield_10016'] as number | undefined,
    created: fields.created as string,
    updated: fields.updated as string,
    parentKey: parent?.key as string | undefined,
  }
}
