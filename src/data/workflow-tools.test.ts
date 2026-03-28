import { describe, it, expect } from 'vitest'
import { filterToolCategories } from './workflow-tools'
import type { McpToolCategory } from '../types/workflow'

// Minimal fixture: filterToolCategories only reads c.name, t.name, t.description
const makeTool = (name: string, description = 'A tool') =>
  ({ id: name, name, icon: '', description, category: '', parameters: [] } as McpToolCategory['tools'][number])

const makeCategory = (name: string, tools: ReturnType<typeof makeTool>[]): McpToolCategory =>
  ({ name, icon: '', tools })

const GIT_CAT = makeCategory('Git Operations', [makeTool('git_commit', 'commit changes'), makeTool('git_push', 'push to remote')])
const FILE_CAT = makeCategory('File Operations', [makeTool('read_file', 'read a file')])
const CODE_CAT = makeCategory('Code Execution', [makeTool('run_script', 'execute script')])
const DATA_CAT = makeCategory('Data Processing', [makeTool('parse_json', 'parse json data')])
const JIRA_CAT = makeCategory('Jira Integration', [makeTool('create_issue', 'create a jira issue')])
const SLACK_CAT = makeCategory('Slack Integration', [makeTool('send_message', 'send slack message')])
const HTTP_CAT = makeCategory('HTTP / API', [makeTool('http_get', 'make a get request')])
const NOTIF_CAT = makeCategory('Notifications', [makeTool('notify', 'send notification')])
const UNKNOWN_CAT = makeCategory('Unknown Category', [makeTool('mystery_tool', 'unknown')])

const ALL_CATEGORIES = [GIT_CAT, FILE_CAT, CODE_CAT, DATA_CAT, JIRA_CAT, SLACK_CAT, HTTP_CAT, NOTIF_CAT, UNKNOWN_CAT]

describe('filterToolCategories', () => {
  describe('tab filtering', () => {
    it('tab="all" returns all categories unchanged', () => {
      const result = filterToolCategories(ALL_CATEGORIES, 'all', '')
      expect(result).toEqual(ALL_CATEGORIES)
    })

    it('tab="code" returns only code categories', () => {
      const result = filterToolCategories(ALL_CATEGORIES, 'code', '')
      const names = result.map((c) => c.name)
      expect(names).toContain('Git Operations')
      expect(names).toContain('File Operations')
      expect(names).toContain('Code Execution')
      expect(names).not.toContain('Data Processing')
      expect(names).not.toContain('Jira Integration')
    })

    it('tab="data" returns only data categories', () => {
      const result = filterToolCategories(ALL_CATEGORIES, 'data', '')
      const names = result.map((c) => c.name)
      expect(names).toEqual(['Data Processing'])
    })

    it('tab="api" returns only API categories', () => {
      const result = filterToolCategories(ALL_CATEGORIES, 'api', '')
      const names = result.map((c) => c.name)
      expect(names).toContain('Jira Integration')
      expect(names).toContain('Slack Integration')
      expect(names).toContain('HTTP / API')
      expect(names).toContain('Notifications')
      expect(names).not.toContain('Git Operations')
      expect(names).not.toContain('Data Processing')
    })

    it('tab="api" does not include categories not in API set', () => {
      const result = filterToolCategories(ALL_CATEGORIES, 'api', '')
      expect(result.find((c) => c.name === 'Unknown Category')).toBeUndefined()
    })

    it('unknown tab value falls through to API_CATEGORIES set', () => {
      // The ternary chain: not 'code', not 'data' → API_CATEGORIES
      const result = filterToolCategories(ALL_CATEGORIES, 'other', '')
      const names = result.map((c) => c.name)
      expect(names).toContain('Jira Integration')
    })
  })

  describe('search filtering', () => {
    it('empty search string returns all (no filtering by search)', () => {
      const result = filterToolCategories([GIT_CAT, DATA_CAT], 'all', '')
      expect(result).toHaveLength(2)
    })

    it('search matches tool name (case-insensitive)', () => {
      const result = filterToolCategories(ALL_CATEGORIES, 'all', 'GIT_COMMIT')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Git Operations')
      expect(result[0].tools).toHaveLength(1)
      expect(result[0].tools[0].name).toBe('git_commit')
    })

    it('search matches tool description', () => {
      const result = filterToolCategories(ALL_CATEGORIES, 'all', 'push to remote')
      expect(result).toHaveLength(1)
      expect(result[0].tools[0].name).toBe('git_push')
    })

    it('search filters within a category, keeping only matching tools', () => {
      const result = filterToolCategories([GIT_CAT], 'all', 'commit')
      expect(result).toHaveLength(1)
      expect(result[0].tools).toHaveLength(1)
      expect(result[0].tools[0].name).toBe('git_commit')
    })

    it('search that matches nothing returns empty array', () => {
      const result = filterToolCategories(ALL_CATEGORIES, 'all', 'zzzznotfound')
      expect(result).toHaveLength(0)
    })

    it('search combined with tab filter only searches within tab results', () => {
      const result = filterToolCategories(ALL_CATEGORIES, 'code', 'commit')
      const names = result.map((c) => c.name)
      expect(names).toContain('Git Operations')
      expect(names).not.toContain('Data Processing')
    })

    it('search that removes all tools from a category omits that category', () => {
      const result = filterToolCategories([GIT_CAT, DATA_CAT], 'all', 'zzz')
      expect(result).toHaveLength(0)
    })
  })
})
