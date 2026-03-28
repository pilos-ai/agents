import { describe, it, expect } from 'vitest'
import { parseAgentSegments, detectLastAgent } from './agent-segments'
import type { AgentDefinition } from '../types'

const agents: AgentDefinition[] = [
  { id: 'dev-1', name: 'Dev', icon: '🔧', color: '#3b82f6', role: 'Developer', personality: '', expertise: [] },
  { id: 'qa-1', name: 'QA', icon: '🧪', color: '#10b981', role: 'QA', personality: '', expertise: [] },
  { id: 'architect-1', name: 'Architect', icon: '🏗️', color: '#8b5cf6', role: 'Architect', personality: '', expertise: [] },
]

describe('parseAgentSegments', () => {
  it('returns single segment with no agentName when no markers present', () => {
    const result = parseAgentSegments('Hello world', agents)
    expect(result).toHaveLength(1)
    expect(result[0].agentName).toBeNull()
    expect(result[0].text).toBe('Hello world')
  })

  it('splits text at [AgentName] markers', () => {
    const text = '[Dev]\nI will implement this.\n\n[QA]\nI will test it.'
    const result = parseAgentSegments(text, agents)
    expect(result).toHaveLength(2)
    expect(result[0].agentName).toBe('Dev')
    expect(result[0].text).toBe('I will implement this.')
    expect(result[1].agentName).toBe('QA')
    expect(result[1].text).toBe('I will test it.')
  })

  it('preserves text before first marker as null-attributed segment', () => {
    const text = 'Preamble text.\n[Dev]\nCode here.'
    const result = parseAgentSegments(text, agents)
    expect(result).toHaveLength(2)
    expect(result[0].agentName).toBeNull()
    expect(result[0].text).toBe('Preamble text.')
    expect(result[1].agentName).toBe('Dev')
  })

  it('ignores markers for unknown agent names', () => {
    const text = '[Unknown]\nStill unattributed.\n[Dev]\nDev content.'
    const result = parseAgentSegments(text, agents)
    expect(result).toHaveLength(2)
    expect(result[0].agentName).toBeNull()
    expect(result[0].text).toContain('[Unknown]')
    expect(result[1].agentName).toBe('Dev')
  })

  it('attaches agent id, icon, and color to segments', () => {
    const text = '[Dev]\nSome output.'
    const result = parseAgentSegments(text, agents)
    expect(result[0].agentId).toBe('dev-1')
    expect(result[0].agentIcon).toBe('🔧')
    expect(result[0].agentColor).toBe('#3b82f6')
  })

  it('handles multi-agent response with 3 agents', () => {
    const text = '[Dev]\nCode.\n[QA]\nTests.\n[Architect]\nDesign.'
    const result = parseAgentSegments(text, agents)
    expect(result).toHaveLength(3)
    expect(result.map((s) => s.agentName)).toEqual(['Dev', 'QA', 'Architect'])
  })

  it('returns empty array for empty string', () => {
    expect(parseAgentSegments('', agents)).toHaveLength(0)
  })

  it('skips empty segments between consecutive markers', () => {
    const text = '[Dev]\n\n[QA]\nTests.'
    const result = parseAgentSegments(text, agents)
    // Dev segment has empty text after trim — should be skipped
    expect(result.every((s) => s.text.length > 0)).toBe(true)
    const qa = result.find((s) => s.agentName === 'QA')
    expect(qa?.text).toBe('Tests.')
  })

  it('handles marker with trailing spaces', () => {
    const text = '[Dev]   \nCode here.'
    const result = parseAgentSegments(text, agents)
    expect(result[0].agentName).toBe('Dev')
  })

  it('returns single segment for text with no agents defined', () => {
    const result = parseAgentSegments('[Dev]\nHello', [])
    expect(result).toHaveLength(1)
    expect(result[0].agentName).toBeNull()
  })
})

describe('detectLastAgent', () => {
  it('returns null when no markers present', () => {
    expect(detectLastAgent('Hello world', agents)).toBeNull()
  })

  it('returns the last agent marker found in text', () => {
    const text = '[Dev]\nSome text.\n[QA]\nMore text.'
    expect(detectLastAgent(text, agents)).toBe('QA')
  })

  it('returns null for unknown agent markers', () => {
    expect(detectLastAgent('[Unknown]\ntext', agents)).toBeNull()
  })

  it('returns the last known marker even when followed by unknown ones', () => {
    const text = '[Dev]\nCode.\n[BadAgent]\nSomething.'
    expect(detectLastAgent(text, agents)).toBe('Dev')
  })

  it('returns first agent when only one marker exists', () => {
    expect(detectLastAgent('[Architect]\nDesign notes.', agents)).toBe('Architect')
  })
})
