import type { StoryPriority } from '../types'

export interface ParsedStory {
  title: string
  description: string
  priority: StoryPriority
  points?: number
  criteria: string[]
}

/**
 * Parses a ```story fenced block from Claude's output into a structured Story object.
 *
 * Expected format:
 * ```story
 * title: User Login Flow
 * priority: high
 * points: 5
 * description: Optional longer description text
 * criteria:
 * - User can enter email and password
 * - Form validates email format
 * ```
 */
export function parseStoryBlock(raw: string): ParsedStory | null {
  const lines = raw.trim().split('\n')
  const result: ParsedStory = {
    title: '',
    description: '',
    priority: 'medium',
    criteria: [],
  }

  let inCriteria = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('- ') && inCriteria) {
      result.criteria.push(trimmed.slice(2).trim())
      continue
    }

    if (trimmed.startsWith('title:')) {
      result.title = trimmed.slice(6).trim()
      inCriteria = false
      continue
    }

    if (trimmed.startsWith('priority:')) {
      const val = trimmed.slice(9).trim().toLowerCase()
      if (['low', 'medium', 'high', 'critical'].includes(val)) {
        result.priority = val as StoryPriority
      }
      inCriteria = false
      continue
    }

    if (trimmed.startsWith('points:')) {
      const n = parseInt(trimmed.slice(7).trim(), 10)
      if (!isNaN(n)) result.points = n
      inCriteria = false
      continue
    }

    if (trimmed.startsWith('description:')) {
      result.description = trimmed.slice(12).trim()
      inCriteria = false
      continue
    }

    if (trimmed === 'criteria:' || trimmed === 'criteria') {
      inCriteria = true
      continue
    }
  }

  if (!result.title) return null
  return result
}

/**
 * Detects ```story fenced blocks in text and returns their raw content.
 */
export function detectStoryBlocks(text: string): string[] {
  const blocks: string[] = []
  const regex = /```story\s*\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1])
  }
  return blocks
}
