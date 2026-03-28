import { describe, it, expect } from 'vitest'
import { buildTeamSystemPrompt, detectRelevantAgents, buildMessageContextHint } from './team-prompt-builder'
import type { AgentDefinition } from '../types'

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'developer',
    name: 'Dev',
    icon: 'lucide:code-2',
    color: 'blue',
    role: 'Senior Developer',
    personality: 'You are a skilled developer.',
    expertise: ['implementation', 'debugging'],
    ...overrides,
  }
}

describe('buildTeamSystemPrompt', () => {
  it('returns empty string for empty agents array', () => {
    expect(buildTeamSystemPrompt([])).toBe('')
  })

  it('includes agent name and role in output', () => {
    const result = buildTeamSystemPrompt([makeAgent()])
    expect(result).toContain('**Dev**')
    expect(result).toContain('Senior Developer')
  })

  it('includes agent personality text', () => {
    const result = buildTeamSystemPrompt([makeAgent()])
    expect(result).toContain('You are a skilled developer.')
  })

  it('includes expertise as comma-separated list', () => {
    const result = buildTeamSystemPrompt([makeAgent()])
    expect(result).toContain('Expertise: implementation, debugging')
  })

  it('lists all agents in team members section', () => {
    const agents = [
      makeAgent({ id: 'developer', name: 'Dev', role: 'Senior Developer' }),
      makeAgent({ id: 'architect', name: 'Architect', role: 'Software Architect', expertise: ['system design'] }),
      makeAgent({ id: 'pm', name: 'PM', role: 'Project Manager', expertise: ['planning'] }),
    ]
    const result = buildTeamSystemPrompt(agents)
    expect(result).toContain('**Dev**')
    expect(result).toContain('**Architect**')
    expect(result).toContain('**PM**')
  })

  it('assigns dev agent to handle all tool use', () => {
    const agents = [
      makeAgent({ id: 'developer', name: 'Dev', expertise: ['implementation'] }),
      makeAgent({ id: 'architect', name: 'Architect', expertise: ['system design'] }),
    ]
    const result = buildTeamSystemPrompt(agents)
    expect(result).toContain('**Dev** handles all tool use')
  })

  it('falls back to first agent if no dev agent found', () => {
    const agents = [
      makeAgent({ id: 'architect', name: 'Architect', expertise: ['system design'] }),
      makeAgent({ id: 'pm', name: 'PM', expertise: ['planning'] }),
    ]
    const result = buildTeamSystemPrompt(agents)
    expect(result).toContain('**Architect** handles all tool use')
  })

  it('includes proactive trigger rules for each agent', () => {
    const agents = [
      makeAgent({ id: 'developer', name: 'Dev' }),
      makeAgent({ id: 'architect', name: 'Architect', expertise: ['system design'] }),
    ]
    const result = buildTeamSystemPrompt(agents)
    expect(result).toContain('**Architect**: Jump in whenever the topic involves system design')
    expect(result).toContain('**Dev**: Jump in whenever the topic involves implementation')
  })

  it('includes all expertise keywords in trigger rules', () => {
    const agents = [
      makeAgent({ id: 'developer', name: 'Dev', expertise: ['implementation', 'debugging', 'code review'] }),
    ]
    const result = buildTeamSystemPrompt(agents)
    expect(result).toContain('implementation, debugging, code review')
  })

  it('includes response format rules and example', () => {
    const result = buildTeamSystemPrompt([makeAgent()])
    expect(result).toContain('Response Format Rules')
    expect(result).toContain('[AgentName]')
    expect(result).toContain('Proactive Trigger Rules')
  })

  it('lists agent names in the remember section', () => {
    const agents = [
      makeAgent({ id: 'developer', name: 'Dev' }),
      makeAgent({ id: 'qa', name: 'QA', expertise: ['testing'] }),
    ]
    const result = buildTeamSystemPrompt(agents)
    expect(result).toContain('Use the exact agent names listed above (Dev, QA)')
  })
})

// ── detectRelevantAgents ──────────────────────────────────────────────────────

describe('detectRelevantAgents', () => {
  const agents: AgentDefinition[] = [
    makeAgent({ id: 'dev', name: 'Dev', expertise: ['implementation', 'debugging'] }),
    makeAgent({ id: 'architect', name: 'Architect', role: 'Software Architect', expertise: ['system design', 'patterns'] }),
    makeAgent({ id: 'pm', name: 'PM', role: 'Project Manager', expertise: ['planning', 'requirements'] }),
  ]

  it('returns empty array for empty agents list', () => {
    expect(detectRelevantAgents('any message', [])).toEqual([])
  })

  it('returns agent whose expertise keyword appears in message', () => {
    const result = detectRelevantAgents('I need help with implementation', agents)
    expect(result.map((a) => a.name)).toContain('Dev')
  })

  it('returns agent whose role appears in message', () => {
    const result = detectRelevantAgents('we need a software architect to review this', agents)
    expect(result.map((a) => a.name)).toContain('Architect')
  })

  it('returns agent @mentioned in message even with no expertise match', () => {
    const result = detectRelevantAgents('@PM what do you think?', agents)
    expect(result.map((a) => a.name)).toContain('PM')
  })

  it('deduplicates when agent is both mentioned and expertise-matched', () => {
    const result = detectRelevantAgents('@Dev help with implementation', agents)
    const devEntries = result.filter((a) => a.name === 'Dev')
    expect(devEntries).toHaveLength(1)
  })

  it('returns multiple relevant agents', () => {
    const result = detectRelevantAgents('system design and planning session', agents)
    const names = result.map((a) => a.name)
    expect(names).toContain('Architect')
    expect(names).toContain('PM')
  })

  it('returns empty when no keywords match', () => {
    const result = detectRelevantAgents('completely unrelated topic xyz', agents)
    expect(result).toHaveLength(0)
  })
})

// ── buildMessageContextHint ───────────────────────────────────────────────────

describe('buildMessageContextHint', () => {
  const agents: AgentDefinition[] = [
    makeAgent({ id: 'dev', name: 'Dev', expertise: ['implementation'] }),
    makeAgent({ id: 'architect', name: 'Architect', role: 'Software Architect', expertise: ['system design'] }),
    makeAgent({ id: 'pm', name: 'PM', role: 'Project Manager', expertise: ['planning'] }),
  ]

  it('returns empty string when no agents are relevant', () => {
    expect(buildMessageContextHint('completely unrelated xyz', agents)).toBe('')
  })

  it('returns empty string when all agents are relevant (broad message)', () => {
    // A message that matches all agents returns empty (no useful routing)
    const broad = 'implementation system design planning'
    const result = buildMessageContextHint(broad, agents)
    expect(result).toBe('')
  })

  it('includes relevant agent @mention when only subset matches', () => {
    const hint = buildMessageContextHint('help with implementation', agents)
    expect(hint).toContain('@Dev')
    expect(hint).toContain('should lead')
  })

  it('includes other agents in the "join only if" part', () => {
    const hint = buildMessageContextHint('help with implementation', agents)
    expect(hint).toContain('Architect')
    expect(hint).toContain('PM')
  })

  it('returns empty string for empty agents list', () => {
    expect(buildMessageContextHint('any message', [])).toBe('')
  })

  it('omits the "should join only if" clause when others is empty (duplicate agents edge case)', () => {
    // Pass the same agent object twice — relevant=[dev], and agents.filter(not in relevant)
    // uses object identity, so the duplicate IS in relevant, making others=[].
    // relevant.length(1) < agents.length(2) so we don't hit the early return.
    const dev = makeAgent({ id: 'dev', name: 'Dev', expertise: ['implementation'] })
    const hint = buildMessageContextHint('help with implementation', [dev, dev])
    // Should produce a hint (not empty) but without the "should join only if" clause
    expect(hint).toContain('@Dev')
    expect(hint).not.toContain('should join only if')
    expect(hint).toContain('All agents may still contribute')
  })
})
