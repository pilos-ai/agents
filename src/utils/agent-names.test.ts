import { describe, it, expect, beforeEach, vi } from 'vitest'

// We need fresh module state for each test suite since agent-names.ts
// uses module-level Maps and a counter.
let replaceAgentIds: typeof import('./agent-names').replaceAgentIds
let restoreAgentIds: typeof import('./agent-names').restoreAgentIds

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('./agent-names')
  replaceAgentIds = mod.replaceAgentIds
  restoreAgentIds = mod.restoreAgentIds
})

describe('replaceAgentIds', () => {
  it('replaces hex IDs on lines with agent context markers', () => {
    const text = 'agent a1b2c3d started'
    const result = replaceAgentIds(text)
    expect(result).not.toContain('a1b2c3d')
    expect(result).toMatch(/agent \w+ started/)
  })

  it('does not replace hex IDs on lines without context markers', () => {
    const text = 'some random line with a1b2c3d in it'
    expect(replaceAgentIds(text)).toBe(text)
  })

  it('skips all-letter hex strings that look like English words', () => {
    const text = 'agent facade started'
    expect(replaceAgentIds(text)).toBe('agent facade started')
  })

  it('replaces multiple IDs on the same line', () => {
    const text = 'task a1b2c3 waiting on d4e5f6'
    const result = replaceAgentIds(text)
    expect(result).not.toContain('a1b2c3')
    expect(result).not.toContain('d4e5f6')
  })

  it('assigns the same name to the same ID across calls', () => {
    const text1 = 'agent a1b2c3d started'
    const result1 = replaceAgentIds(text1)
    const text2 = 'agent a1b2c3d completed'
    const result2 = replaceAgentIds(text2)
    // Extract the name from first result
    const name1 = result1.replace('agent ', '').replace(' started', '')
    const name2 = result2.replace('agent ', '').replace(' completed', '')
    expect(name1).toBe(name2)
  })

  it('assigns different names to different IDs', () => {
    const text = 'agent a1b2c3d started\nagent e4f5a6b7 running'
    const result = replaceAgentIds(text)
    const lines = result.split('\n')
    const name1 = lines[0].replace('agent ', '').replace(' started', '')
    const name2 = lines[1].replace('agent ', '').replace(' running', '')
    expect(name1).not.toBe(name2)
  })

  it('handles multiline text, only replacing on context lines', () => {
    const text = [
      'Starting workflow execution',
      'agent a1b2c3d spawned',
      'Processing data...',
      'task e4f5a6b7 completed',
    ].join('\n')
    const result = replaceAgentIds(text)
    const lines = result.split('\n')
    expect(lines[0]).toBe('Starting workflow execution')
    expect(lines[1]).not.toContain('a1b2c3d')
    expect(lines[2]).toBe('Processing data...')
    expect(lines[3]).not.toContain('e4f5a6b7')
  })

  it('matches 6 to 10 character hex IDs', () => {
    // 6 chars
    expect(replaceAgentIds('agent a1b2c3 started')).not.toContain('a1b2c3')
    // 10 chars
    expect(replaceAgentIds('agent a1b2c3d4e5 started')).not.toContain('a1b2c3d4e5')
  })

  it('wraps around FRIENDLY_NAMES with a suffix for 27+ agents', () => {
    // Register 26 unique IDs (one full cycle of FRIENDLY_NAMES)
    for (let i = 0; i < 26; i++) {
      const hex = (0xa00000 + i).toString(16)
      replaceAgentIds(`agent ${hex} started`)
    }
    // 27th should get first name + " 2"
    const result = replaceAgentIds('agent b00000 started')
    // The name should contain a space and number suffix
    const name = result.replace('agent ', '').replace(' started', '')
    expect(name).toMatch(/\w+ \d+/)
  })
})

describe('restoreAgentIds', () => {
  it('restores friendly names back to hex IDs', () => {
    const original = 'agent a1b2c3d started'
    const replaced = replaceAgentIds(original)
    const restored = restoreAgentIds(replaced)
    expect(restored).toBe(original)
  })

  it('returns text unchanged if no names are registered', () => {
    const text = 'some text with Atlas in it'
    expect(restoreAgentIds(text)).toBe(text)
  })

  it('is case-insensitive when restoring', () => {
    const original = 'agent a1b2c3d started'
    const replaced = replaceAgentIds(original)
    // Get the friendly name assigned
    const name = replaced.replace('agent ', '').replace(' started', '')
    // Try lowercase version
    const lowered = `agent ${name.toLowerCase()} started`
    const restored = restoreAgentIds(lowered)
    expect(restored).toBe(original)
  })

  it('handles multiple names in a single line', () => {
    replaceAgentIds('agent a1b2c3d started\nagent e4f5a6b7 running')
    const text = replaceAgentIds('task a1b2c3d waiting on e4f5a6b7')
    const restored = restoreAgentIds(text)
    expect(restored).toBe('task a1b2c3d waiting on e4f5a6b7')
  })

  it('leaves text unchanged when nameToId is populated but text has no known names', () => {
    // Seed the map with at least one ID
    replaceAgentIds('agent a1b2c3d started')
    // Text that has no known friendly names — passes through unmodified (exercises the
    // populated-map path at line 51 but the replacement finds nothing)
    const unrelated = 'nothing to restore here'
    expect(restoreAgentIds(unrelated)).toBe(unrelated)
  })

  it('performs replacement when nameToId has entries and text contains a known name', () => {
    // Explicitly exercise the branch where nameToId.size > 0 AND a match is found
    const original = 'agent fa01234 started'
    const replaced = replaceAgentIds(original)
    // Verify that restoreAgentIds reverses the replacement (not the early-return path)
    const restored = restoreAgentIds(replaced)
    expect(restored).toContain('fa01234')
  })
})
