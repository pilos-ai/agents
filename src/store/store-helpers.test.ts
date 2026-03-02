import { describe, it, expect, vi } from 'vitest'

// Mock the api module to avoid `window is not defined` from Electron API
vi.mock('../api', () => ({
  api: {
    settings: { get: vi.fn(), set: vi.fn() },
    jira: null,
    claude: { sendPrompt: vi.fn() },
    mcp: { callTool: vi.fn() },
  },
}))

import { computeSummary, computeRecentEntries, computeTokensByDay, type AnalyticsEntry } from './useAnalyticsStore'
import { computeNextRunAt, type ScheduleInterval } from './useTaskStore'
import { stripRuntimeFields, stripEdgeRuntime, buildAiFixPrompt } from './useWorkflowStore'
import { validateAiPromptNodes } from '../utils/workflow-ai'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowExecution, WorkflowStepResult } from '../types/workflow'

// ── Helpers ──

function makeEntry(overrides: Partial<AnalyticsEntry> = {}): AnalyticsEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    agentName: 'Dev',
    tokens: 1000,
    cost: 0.01,
    durationMs: 2000,
    success: true,
    conversationId: null,
    ...overrides,
  }
}

function makeNode(id: string, type: string, overrides: Partial<WorkflowNodeData> = {}): Node<WorkflowNodeData> {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { type: type as WorkflowNodeData['type'], label: `Node ${id}`, ...overrides },
  }
}

function makeEdge(source: string, target: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    type: 'smoothstep',
    // Simulate runtime fields that should be stripped
    animated: true,
    style: { stroke: 'red' },
  } as Edge
}

// ═══════════════════════════════════════════════════════════
// Analytics Helpers
// ═══════════════════════════════════════════════════════════

describe('computeSummary', () => {
  it('returns zeroed summary for empty entries', () => {
    const result = computeSummary([])
    expect(result).toEqual({
      totalTokens: 0,
      totalCost: 0,
      avgResponseTime: 0,
      successRate: 100,
      totalSessions: 0,
    })
  })

  it('sums tokens and cost', () => {
    const entries = [
      makeEntry({ tokens: 500, cost: 0.005 }),
      makeEntry({ tokens: 1500, cost: 0.015 }),
    ]
    const result = computeSummary(entries)
    expect(result.totalTokens).toBe(2000)
    expect(result.totalCost).toBeCloseTo(0.02)
  })

  it('computes average response time', () => {
    const entries = [
      makeEntry({ durationMs: 1000 }),
      makeEntry({ durationMs: 3000 }),
    ]
    expect(computeSummary(entries).avgResponseTime).toBe(2000)
  })

  it('computes success rate', () => {
    const entries = [
      makeEntry({ success: true }),
      makeEntry({ success: true }),
      makeEntry({ success: false }),
      makeEntry({ success: true }),
    ]
    expect(computeSummary(entries).successRate).toBe(75)
  })

  it('reports totalSessions as entry count', () => {
    const entries = [makeEntry(), makeEntry(), makeEntry()]
    expect(computeSummary(entries).totalSessions).toBe(3)
  })
})

describe('computeRecentEntries', () => {
  it('returns last N entries in reverse order', () => {
    const entries = [
      makeEntry({ id: 'a' }),
      makeEntry({ id: 'b' }),
      makeEntry({ id: 'c' }),
      makeEntry({ id: 'd' }),
    ]
    const recent = computeRecentEntries(entries, 2)
    expect(recent).toHaveLength(2)
    expect(recent[0].id).toBe('d')
    expect(recent[1].id).toBe('c')
  })

  it('returns all entries reversed when limit exceeds length', () => {
    const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]
    const recent = computeRecentEntries(entries, 10)
    expect(recent).toHaveLength(2)
    expect(recent[0].id).toBe('b')
    expect(recent[1].id).toBe('a')
  })

  it('returns empty array for empty entries', () => {
    expect(computeRecentEntries([], 5)).toEqual([])
  })
})

describe('computeTokensByDay', () => {
  it('aggregates tokens and cost by date', () => {
    const day1 = new Date('2024-01-15T10:00:00Z').getTime()
    const day1b = new Date('2024-01-15T14:00:00Z').getTime()
    const day2 = new Date('2024-01-16T10:00:00Z').getTime()

    const entries = [
      makeEntry({ timestamp: day1, tokens: 100, cost: 0.01 }),
      makeEntry({ timestamp: day1b, tokens: 200, cost: 0.02 }),
      makeEntry({ timestamp: day2, tokens: 300, cost: 0.03 }),
    ]
    const result = computeTokensByDay(entries)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ date: '2024-01-15', tokens: 300, cost: 0.03 })
    expect(result[1]).toEqual({ date: '2024-01-16', tokens: 300, cost: 0.03 })
  })

  it('returns sorted by date', () => {
    const entries = [
      makeEntry({ timestamp: new Date('2024-01-20').getTime() }),
      makeEntry({ timestamp: new Date('2024-01-10').getTime() }),
      makeEntry({ timestamp: new Date('2024-01-15').getTime() }),
    ]
    const result = computeTokensByDay(entries)
    expect(result.map((r) => r.date)).toEqual(['2024-01-10', '2024-01-15', '2024-01-20'])
  })

  it('limits to last 14 days of data', () => {
    const entries: AnalyticsEntry[] = []
    for (let i = 0; i < 20; i++) {
      const d = new Date(`2024-01-${String(i + 1).padStart(2, '0')}`)
      entries.push(makeEntry({ timestamp: d.getTime() }))
    }
    const result = computeTokensByDay(entries)
    expect(result).toHaveLength(14)
    // Should have the last 14 days
    expect(result[0].date).toBe('2024-01-07')
    expect(result[13].date).toBe('2024-01-20')
  })

  it('returns empty array for empty entries', () => {
    expect(computeTokensByDay([])).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════
// Task Store — computeNextRunAt
// ═══════════════════════════════════════════════════════════

describe('computeNextRunAt', () => {
  const base = '2024-06-15T12:00:00.000Z'

  it('returns null for manual interval', () => {
    expect(computeNextRunAt(base, 'manual')).toBeNull()
  })

  it('adds 15 minutes for 15min interval', () => {
    const result = computeNextRunAt(base, '15min')
    expect(result).toBe('2024-06-15T12:15:00.000Z')
  })

  it('adds 1 hour for 1h interval', () => {
    expect(computeNextRunAt(base, '1h')).toBe('2024-06-15T13:00:00.000Z')
  })

  it('adds 1 day for 1d interval', () => {
    expect(computeNextRunAt(base, '1d')).toBe('2024-06-16T12:00:00.000Z')
  })

  it('adds 1 week for 1w interval', () => {
    expect(computeNextRunAt(base, '1w')).toBe('2024-06-22T12:00:00.000Z')
  })

  it('returns an ISO string', () => {
    const result = computeNextRunAt(base, '30min')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
  })

  it.each<[ScheduleInterval, number]>([
    ['15min', 15 * 60 * 1000],
    ['30min', 30 * 60 * 1000],
    ['2h', 2 * 60 * 60 * 1000],
    ['4h', 4 * 60 * 60 * 1000],
    ['8h', 8 * 60 * 60 * 1000],
    ['12h', 12 * 60 * 60 * 1000],
  ])('computes correct offset for %s', (interval, expectedMs) => {
    const result = computeNextRunAt(base, interval)!
    const diff = new Date(result).getTime() - new Date(base).getTime()
    expect(diff).toBe(expectedMs)
  })
})

// ═══════════════════════════════════════════════════════════
// Workflow Store — stripRuntimeFields / stripEdgeRuntime
// ═══════════════════════════════════════════════════════════

describe('stripRuntimeFields', () => {
  it('removes executionStatus from nodes', () => {
    const nodes = [
      makeNode('n1', 'mcp_tool', { executionStatus: 'completed' }),
      makeNode('n2', 'mcp_tool', { executionStatus: 'failed' }),
    ]
    const stripped = stripRuntimeFields(nodes)
    expect(stripped[0].data.executionStatus).toBeUndefined()
    expect(stripped[1].data.executionStatus).toBeUndefined()
  })

  it('preserves core node properties', () => {
    const nodes = [makeNode('n1', 'mcp_tool', { label: 'Search Issues', toolId: 'jira.search' })]
    const stripped = stripRuntimeFields(nodes)
    expect(stripped[0].id).toBe('n1')
    expect(stripped[0].type).toBe('mcp_tool')
    expect(stripped[0].data.label).toBe('Search Issues')
    expect(stripped[0].data.toolId).toBe('jira.search')
  })

  it('preserves position', () => {
    const node = makeNode('n1', 'start')
    node.position = { x: 100, y: 200 }
    const stripped = stripRuntimeFields([node])
    expect(stripped[0].position).toEqual({ x: 100, y: 200 })
  })
})

describe('stripEdgeRuntime', () => {
  it('keeps only structural fields', () => {
    const edge = makeEdge('a', 'b')
    const stripped = stripEdgeRuntime([edge])
    expect(stripped[0]).toEqual({
      id: 'a-b',
      source: 'a',
      target: 'b',
      sourceHandle: null,
      targetHandle: null,
      type: 'smoothstep',
    })
  })

  it('strips animated and style properties', () => {
    const stripped = stripEdgeRuntime([makeEdge('a', 'b')])
    expect(stripped[0]).not.toHaveProperty('animated')
    expect(stripped[0]).not.toHaveProperty('style')
  })
})

// ═══════════════════════════════════════════════════════════
// Workflow Store — buildAiFixPrompt
// ═══════════════════════════════════════════════════════════

describe('buildAiFixPrompt', () => {
  function makeExecution(stepResults: WorkflowStepResult[]): WorkflowExecution {
    return {
      id: 'exec-1',
      taskId: 'task-1',
      status: 'failed',
      currentNodeId: null,
      currentStep: stepResults.length,
      totalSteps: stepResults.length,
      stepResults,
      startedAt: '2024-01-01T00:00:00Z',
      logs: [],
    }
  }

  function makeStepResult(nodeId: string, status: 'completed' | 'failed', error?: string): WorkflowStepResult {
    return {
      nodeId,
      status,
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:00:01Z',
      duration: 1000,
      ...(error ? { error } : {}),
    }
  }

  it('includes node descriptions in the prompt', () => {
    const nodes = [makeNode('n1', 'mcp_tool', { label: 'Create Issue' })]
    const edges: Edge[] = []
    const execution = makeExecution([makeStepResult('n1', 'completed')])
    const prompt = buildAiFixPrompt(nodes, edges, execution)
    expect(prompt).toContain('Node n1 (mcp_tool) at (0,0): "Create Issue"')
  })

  it('includes edge descriptions', () => {
    const nodes = [makeNode('n1', 'start'), makeNode('n2', 'end')]
    const edges = [makeEdge('n1', 'n2')]
    const execution = makeExecution([])
    const prompt = buildAiFixPrompt(nodes, edges, execution)
    expect(prompt).toContain('n1 --> n2')
  })

  it('includes edge source handles', () => {
    const nodes = [makeNode('cond', 'condition'), makeNode('yes', 'mcp_tool')]
    const edges: Edge[] = [{
      id: 'e1', source: 'cond', target: 'yes',
      sourceHandle: 'yes', targetHandle: null, type: 'smoothstep',
    }]
    const execution = makeExecution([])
    const prompt = buildAiFixPrompt(nodes, edges, execution)
    expect(prompt).toContain('cond[yes] --> yes')
  })

  it('includes failed node errors in summary', () => {
    const nodes = [makeNode('n1', 'mcp_tool', { label: 'Search' })]
    const execution = makeExecution([makeStepResult('n1', 'failed', 'No project key')])
    const prompt = buildAiFixPrompt(nodes, [], execution)
    expect(prompt).toContain('FAILED NODES')
    expect(prompt).toContain('n1: No project key')
  })

  it('includes execution step results with status and duration', () => {
    const nodes = [makeNode('n1', 'mcp_tool', { label: 'Search' })]
    const execution = makeExecution([makeStepResult('n1', 'completed')])
    const prompt = buildAiFixPrompt(nodes, [], execution)
    expect(prompt).toContain('"Search"): completed')
    expect(prompt).toContain('1000ms')
  })

  it('includes FOCUS note when targetNodeId is provided', () => {
    const nodes = [makeNode('n1', 'mcp_tool')]
    const execution = makeExecution([makeStepResult('n1', 'failed', 'err')])
    const prompt = buildAiFixPrompt(nodes, [], execution, 'n1')
    expect(prompt).toContain('FOCUS: Prioritize fixes around node "n1"')
  })

  it('does not include FOCUS note when no targetNodeId', () => {
    const nodes = [makeNode('n1', 'mcp_tool')]
    const execution = makeExecution([makeStepResult('n1', 'failed', 'err')])
    const prompt = buildAiFixPrompt(nodes, [], execution)
    expect(prompt).not.toContain('FOCUS')
  })

  it('includes node parameters in the prompt', () => {
    const nodes = [makeNode('n1', 'mcp_tool', {
      label: 'Create',
      parameters: {
        summary: { key: 'summary', label: 'Summary', type: 'string', value: 'Bug fix' },
      },
    })]
    const execution = makeExecution([])
    const prompt = buildAiFixPrompt(nodes, [], execution)
    expect(prompt).toContain('summary: "Bug fix"')
  })

  it('includes AI prompt if present on node', () => {
    const nodes = [makeNode('n1', 'ai_prompt', {
      label: 'Analyze',
      aiPrompt: 'Analyze the sprint',
    })]
    const execution = makeExecution([])
    const prompt = buildAiFixPrompt(nodes, [], execution)
    expect(prompt).toContain('AI Prompt: Analyze the sprint')
  })

  it('includes condition expression for condition nodes', () => {
    const nodes = [makeNode('n1', 'condition', {
      label: 'Check',
      conditionExpression: '{{search.count}}',
      conditionOperator: 'greater_than',
      conditionValue: '0',
    })]
    const execution = makeExecution([])
    const prompt = buildAiFixPrompt(nodes, [], execution)
    expect(prompt).toContain('Condition: {{search.count}} greater_than 0')
  })

  it('requests JSON response format', () => {
    const nodes = [makeNode('n1', 'mcp_tool')]
    const execution = makeExecution([])
    const prompt = buildAiFixPrompt(nodes, [], execution)
    expect(prompt).toContain('OUTPUT ONLY THE RAW JSON OBJECT')
    expect(prompt).toContain('"nodes"')
    expect(prompt).toContain('"edges"')
  })

  it('includes runtime behavior guide', () => {
    const nodes = [makeNode('n1', 'mcp_tool')]
    const execution = makeExecution([])
    const prompt = buildAiFixPrompt(nodes, [], execution)
    expect(prompt).toContain('WORKFLOW ENGINE RUNTIME BEHAVIOR')
    expect(prompt).toContain('Nested Loops')
    expect(prompt).toContain('Template Syntax')
    expect(prompt).toContain('Edge Rules')
  })
})

// ═══════════════════════════════════════════════════════════
// Workflow AI — validateAiPromptNodes
// ═══════════════════════════════════════════════════════════

describe('validateAiPromptNodes', () => {
  it('passes through non-ai_prompt nodes unchanged', () => {
    const nodes = [makeNode('n1', 'mcp_tool', { label: 'Search' })]
    const result = validateAiPromptNodes(nodes, [])
    expect(result).toEqual(nodes)
  })

  it('passes through ai_prompt nodes with existing prompt', () => {
    const nodes = [makeNode('n1', 'ai_prompt', { label: 'Analyze', aiPrompt: 'Analyze the data' })]
    const result = validateAiPromptNodes(nodes, [])
    expect(result[0].data.aiPrompt).toBe('Analyze the data')
  })

  it('fills empty aiPrompt with default based on label', () => {
    const nodes = [makeNode('n1', 'ai_prompt', { label: 'Summarize Results', aiPrompt: '' })]
    const result = validateAiPromptNodes(nodes, [])
    expect(result[0].data.aiPrompt).toContain('Summarize Results')
    expect(result[0].data.aiPrompt).toContain('Return structured JSON')
  })

  it('fills undefined aiPrompt with default', () => {
    const nodes = [makeNode('n1', 'ai_prompt', { label: 'Analyze' })]
    const result = validateAiPromptNodes(nodes, [])
    expect(result[0].data.aiPrompt).toBeTruthy()
    expect(result[0].data.aiPrompt).toContain('Analyze')
  })

  it('includes upstream node references in default prompt', () => {
    const nodes = [
      makeNode('n1', 'mcp_tool', { label: 'Read Files' }),
      makeNode('n2', 'ai_prompt', { label: 'Analyze Code', aiPrompt: '' }),
    ]
    const edges: Edge[] = [{ id: 'e1', source: 'n1', target: 'n2' }]
    const result = validateAiPromptNodes(nodes, edges)
    expect(result[1].data.aiPrompt).toContain('{{n1}}')
    expect(result[1].data.aiPrompt).toContain('Analyze Code')
  })

  it('includes multiple upstream refs', () => {
    const nodes = [
      makeNode('a', 'mcp_tool', { label: 'Step A' }),
      makeNode('b', 'mcp_tool', { label: 'Step B' }),
      makeNode('c', 'ai_prompt', { label: 'Combine', aiPrompt: '' }),
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'c' },
      { id: 'e2', source: 'b', target: 'c' },
    ]
    const result = validateAiPromptNodes(nodes, edges)
    expect(result[2].data.aiPrompt).toContain('{{a}}')
    expect(result[2].data.aiPrompt).toContain('{{b}}')
  })

  it('does not modify nodes that already have prompts', () => {
    const nodes = [
      makeNode('n1', 'mcp_tool', { label: 'Read' }),
      makeNode('n2', 'ai_prompt', { label: 'Analyze', aiPrompt: 'My custom prompt' }),
    ]
    const edges: Edge[] = [{ id: 'e1', source: 'n1', target: 'n2' }]
    const result = validateAiPromptNodes(nodes, edges)
    expect(result[1].data.aiPrompt).toBe('My custom prompt')
  })

  it('uses fallback label when node has no label', () => {
    const node = makeNode('n1', 'ai_prompt', { aiPrompt: '' })
    node.data.label = ''
    const result = validateAiPromptNodes([node], [])
    expect(result[0].data.aiPrompt).toContain('Analyze')
  })
})
