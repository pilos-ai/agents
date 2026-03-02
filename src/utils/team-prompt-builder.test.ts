import { describe, it, expect } from 'vitest'
import { buildTeamSystemPrompt } from './team-prompt-builder'
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

  it('uses agent names in coordinator heuristics', () => {
    const agents = [
      makeAgent({ id: 'developer', name: 'Dev' }),
      makeAgent({ id: 'architect', name: 'Architect', expertise: ['system design'] }),
    ]
    const result = buildTeamSystemPrompt(agents)
    expect(result).toContain('Architect speaks first')
  })

  it('falls back to all agent names for missing specialist roles', () => {
    const agents = [
      makeAgent({ id: 'developer', name: 'Dev' }),
    ]
    const result = buildTeamSystemPrompt(agents)
    // No architect found, so heuristic falls back to all names
    expect(result).toContain('Dev speaks first')
  })

  it('includes response format rules and example', () => {
    const result = buildTeamSystemPrompt([makeAgent()])
    expect(result).toContain('Response Format Rules')
    expect(result).toContain('[AgentName]')
    expect(result).toContain('Coordinator Heuristics')
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
