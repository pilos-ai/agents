import { describe, it, expect } from 'vitest'
import { mapMessageRow, mapStoryRow, mapCriterionRow } from './row-mappers'

describe('mapMessageRow', () => {
  const baseRow = {
    id: 42,
    role: 'assistant',
    type: 'text',
    content: 'Hello world',
    tool_name: null,
    tool_input: null,
    tool_result: null,
    agent_name: null,
    agent_emoji: null,
    agent_color: null,
    content_blocks: null,
    reply_to_id: null,
    created_at: '2024-01-15T10:30:00.000Z',
  }

  it('maps scalar fields correctly', () => {
    const result = mapMessageRow(baseRow)
    expect(result.id).toBe(42)
    expect(result.role).toBe('assistant')
    expect(result.type).toBe('text')
    expect(result.content).toBe('Hello world')
  })

  it('converts created_at to millisecond timestamp', () => {
    const result = mapMessageRow(baseRow)
    expect(result.timestamp).toBe(new Date('2024-01-15T10:30:00.000Z').getTime())
  })

  it('parses content_blocks JSON when present', () => {
    const blocks = [{ type: 'text', text: 'hi' }]
    const result = mapMessageRow({ ...baseRow, content_blocks: JSON.stringify(blocks) })
    expect(result.contentBlocks).toEqual(blocks)
  })

  it('returns undefined contentBlocks when null', () => {
    const result = mapMessageRow(baseRow)
    expect(result.contentBlocks).toBeUndefined()
  })

  it('maps agent attribution fields', () => {
    const result = mapMessageRow({
      ...baseRow,
      agent_name: 'Dev',
      agent_emoji: '🔧',
      agent_color: '#ff0000',
    })
    expect(result.agentName).toBe('Dev')
    expect(result.agentEmoji).toBe('🔧')
    expect(result.agentColor).toBe('#ff0000')
  })

  it('maps replyToId from reply_to_id', () => {
    const result = mapMessageRow({ ...baseRow, reply_to_id: 7 })
    expect(result.replyToId).toBe(7)
  })

  it('returns undefined replyToId when null', () => {
    const result = mapMessageRow(baseRow)
    expect(result.replyToId).toBeUndefined()
  })

  it('maps tool fields', () => {
    const result = mapMessageRow({
      ...baseRow,
      tool_name: 'bash',
      tool_input: '{"command": "ls"}',
      tool_result: 'file.txt',
    })
    expect(result.toolName).toBe('bash')
    expect(result.toolInput).toBe('{"command": "ls"}')
    expect(result.toolResult).toBe('file.txt')
  })
})

describe('mapStoryRow', () => {
  const baseRow = {
    id: 'story-1',
    project_path: '/home/user/project',
    title: 'User login',
    description: 'Implement login flow',
    status: 'draft',
    priority: 'high',
    story_points: 5,
    jira_epic_key: null,
    jira_epic_id: null,
    jira_project_key: null,
    jira_sync_status: 'local',
    jira_last_synced: null,
    coverage_data: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  }

  it('maps required fields', () => {
    const result = mapStoryRow(baseRow)
    expect(result.id).toBe('story-1')
    expect(result.projectPath).toBe('/home/user/project')
    expect(result.title).toBe('User login')
    expect(result.status).toBe('draft')
    expect(result.priority).toBe('high')
    expect(result.storyPoints).toBe(5)
  })

  it('defaults jiraSyncStatus to "local" when null', () => {
    const result = mapStoryRow({ ...baseRow, jira_sync_status: null })
    expect(result.jiraSyncStatus).toBe('local')
  })

  it('parses coverage_data JSON when present', () => {
    const coverage = { coveredFiles: ['src/login.ts'] }
    const result = mapStoryRow({ ...baseRow, coverage_data: JSON.stringify(coverage) })
    expect(result.coverageData).toEqual(coverage)
  })

  it('returns undefined coverageData when null', () => {
    const result = mapStoryRow(baseRow)
    expect(result.coverageData).toBeUndefined()
  })
})

describe('mapCriterionRow', () => {
  const baseRow = {
    id: 'crit-1',
    story_id: 'story-1',
    description: 'User can enter email and password',
    order_index: 0,
    is_covered: 0,
    covered_files: null,
    covered_explanation: null,
    jira_task_key: null,
    jira_task_id: null,
    created_at: '2024-01-01T00:00:00Z',
  }

  it('maps required fields', () => {
    const result = mapCriterionRow(baseRow)
    expect(result.id).toBe('crit-1')
    expect(result.storyId).toBe('story-1')
    expect(result.description).toBe('User can enter email and password')
    expect(result.orderIndex).toBe(0)
  })

  it('converts is_covered integer to boolean', () => {
    expect(mapCriterionRow({ ...baseRow, is_covered: 0 }).isCovered).toBe(false)
    expect(mapCriterionRow({ ...baseRow, is_covered: 1 }).isCovered).toBe(true)
  })

  it('parses covered_files JSON when present', () => {
    const files = ['src/auth.ts', 'src/login.ts']
    const result = mapCriterionRow({ ...baseRow, covered_files: JSON.stringify(files) })
    expect(result.coveredFiles).toEqual(files)
  })

  it('returns undefined coveredFiles when null', () => {
    const result = mapCriterionRow(baseRow)
    expect(result.coveredFiles).toBeUndefined()
  })

  it('maps jira task fields', () => {
    const result = mapCriterionRow({ ...baseRow, jira_task_key: 'PROJ-42', jira_task_id: 'abc123' })
    expect(result.jiraTaskKey).toBe('PROJ-42')
    expect(result.jiraTaskId).toBe('abc123')
  })
})
