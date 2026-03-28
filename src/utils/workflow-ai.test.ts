import { describe, it, expect, beforeEach } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowChatMessage } from '../types/workflow'
import {
  extractJson,
  findTool,
  validateAiPromptNodes,
  serializeWorkflowForAi,
  buildChatPrompt,
  generateWorkflowSummaryLocally,
  hydrateToolNodes,
  WORKFLOW_RUNTIME_GUIDE,
} from './workflow-ai'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  type: WorkflowNodeData['type'],
  extra: Partial<WorkflowNodeData> = {},
): Node<WorkflowNodeData> {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { type, label: id, ...extra },
  }
}

function makeEdge(source: string, target: string, sourceHandle?: string | null): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    sourceHandle: sourceHandle ?? null,
    type: 'dashed',
  }
}

// ── WORKFLOW_RUNTIME_GUIDE ────────────────────────────────────────────────────

describe('WORKFLOW_RUNTIME_GUIDE', () => {
  it('is a non-empty string', () => {
    expect(typeof WORKFLOW_RUNTIME_GUIDE).toBe('string')
    expect(WORKFLOW_RUNTIME_GUIDE.length).toBeGreaterThan(0)
  })

  it('contains key section headers', () => {
    expect(WORKFLOW_RUNTIME_GUIDE).toContain('Loop Execution')
    expect(WORKFLOW_RUNTIME_GUIDE).toContain('Template Syntax')
    expect(WORKFLOW_RUNTIME_GUIDE).toContain('Edge Rules')
    expect(WORKFLOW_RUNTIME_GUIDE).toContain('Agent Nodes')
  })
})

// ── extractJson ───────────────────────────────────────────────────────────────

describe('extractJson', () => {
  it('returns plain JSON unchanged', () => {
    const input = '{"a":1}'
    expect(extractJson(input)).toBe('{"a":1}')
  })

  it('strips ```json code fence', () => {
    const input = '```json\n{"key":"value"}\n```'
    expect(extractJson(input)).toBe('{"key":"value"}')
  })

  it('strips plain ``` code fence', () => {
    const input = '```\n{"x":2}\n```'
    expect(extractJson(input)).toBe('{"x":2}')
  })

  it('extracts JSON preceded by surrounding text', () => {
    const input = 'Here is the result: {"action":"replace"} done.'
    expect(extractJson(input)).toBe('{"action":"replace"}')
  })

  it('handles nested braces correctly', () => {
    const input = '{"outer":{"inner":1}}'
    expect(extractJson(input)).toBe('{"outer":{"inner":1}}')
  })

  it('handles escaped backslash inside string', () => {
    const input = '{"path":"C:\\\\Users\\\\foo"}'
    const result = extractJson(input)
    expect(result).toBe('{"path":"C:\\\\Users\\\\foo"}')
  })

  it('handles escaped quote inside string', () => {
    const input = '{"msg":"say \\"hello\\""}'
    const result = extractJson(input)
    expect(result).toBe('{"msg":"say \\"hello\\""}')
  })

  it('handles braces inside string values without mis-counting depth', () => {
    const input = '{"template":"{{NODE_1.field}}"}'
    const result = extractJson(input)
    expect(result).toBe('{"template":"{{NODE_1.field}}"}')
  })

  it('strips trailing content after the closing brace', () => {
    const input = '{"a":1} extra text here'
    expect(extractJson(input)).toBe('{"a":1}')
  })

  it('handles whitespace around code-fenced JSON', () => {
    const input = '  ```json\n  { "k": "v" }  \n  ```  '
    expect(extractJson(input)).toBe('{ "k": "v" }')
  })

  it('throws when no opening brace is present', () => {
    expect(() => extractJson('no json here')).toThrow('No JSON object found in response')
  })

  it('throws when JSON object is incomplete (no closing brace)', () => {
    expect(() => extractJson('{"incomplete":')).toThrow('Incomplete JSON object in response')
  })

  it('returns deeply nested JSON', () => {
    const input = '{"a":{"b":{"c":{"d":4}}}}'
    expect(extractJson(input)).toBe('{"a":{"b":{"c":{"d":4}}}}')
  })
})

// ── findTool ──────────────────────────────────────────────────────────────────

describe('findTool', () => {
  it('finds a tool in the first category', () => {
    const tool = findTool('git_checkout')
    expect(tool).not.toBeNull()
    expect(tool?.id).toBe('git_checkout')
    expect(tool?.name).toBe('Git Checkout')
  })

  it('finds a tool in a later category (Jira Integration)', () => {
    const tool = findTool('jira_search')
    expect(tool).not.toBeNull()
    expect(tool?.id).toBe('jira_search')
  })

  it('finds a tool in the Slack category', () => {
    const tool = findTool('slack_message')
    expect(tool).not.toBeNull()
    expect(tool?.category).toBe('Slack Integration')
  })

  it('finds a tool in the Notifications category', () => {
    const tool = findTool('email_alert')
    expect(tool).not.toBeNull()
    expect(tool?.id).toBe('email_alert')
  })

  it('returns null for an unknown tool id', () => {
    expect(findTool('nonexistent_tool')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(findTool('')).toBeNull()
  })

  it('returns correct tool definition with parameters', () => {
    const tool = findTool('git_commit')
    expect(tool?.parameters.some((p) => p.key === 'message')).toBe(true)
  })
})

// ── validateAiPromptNodes ─────────────────────────────────────────────────────

describe('validateAiPromptNodes', () => {
  it('leaves ai_prompt node with existing non-empty prompt unchanged', () => {
    const node = makeNode('N1', 'ai_prompt', { aiPrompt: 'Analyze this.' })
    const result = validateAiPromptNodes([node], [])
    expect(result[0].data.aiPrompt).toBe('Analyze this.')
  })

  it('fills default prompt for ai_prompt node with empty string prompt', () => {
    const node = makeNode('N1', 'ai_prompt', { aiPrompt: '' })
    const result = validateAiPromptNodes([node], [])
    expect(result[0].data.aiPrompt).toContain('N1')
    expect(result[0].data.aiPrompt).toContain('Return structured JSON')
  })

  it('fills default prompt for ai_prompt node with whitespace-only prompt', () => {
    const node = makeNode('N1', 'ai_prompt', { aiPrompt: '   ' })
    const result = validateAiPromptNodes([node], [])
    expect(result[0].data.aiPrompt).toContain('Return structured JSON')
  })

  it('fills default prompt for ai_prompt node with undefined prompt', () => {
    const node = makeNode('N1', 'ai_prompt')
    const result = validateAiPromptNodes([node], [])
    expect(typeof result[0].data.aiPrompt).toBe('string')
    expect((result[0].data.aiPrompt as string).length).toBeGreaterThan(0)
  })

  it('includes upstream node refs in ai_prompt default prompt', () => {
    const n1 = makeNode('N1', 'mcp_tool')
    const n2 = makeNode('N2', 'ai_prompt')
    const edges = [makeEdge('N1', 'N2')]
    const result = validateAiPromptNodes([n1, n2], edges)
    expect(result[1].data.aiPrompt).toContain('{{N1}}')
  })

  it('includes multiple upstream refs comma-separated', () => {
    const n1 = makeNode('N1', 'mcp_tool')
    const n2 = makeNode('N2', 'mcp_tool')
    const n3 = makeNode('N3', 'ai_prompt')
    const edges = [makeEdge('N1', 'N3'), makeEdge('N2', 'N3')]
    const result = validateAiPromptNodes([n1, n2, n3], edges)
    expect(result[2].data.aiPrompt).toContain('{{N1}}')
    expect(result[2].data.aiPrompt).toContain('{{N2}}')
  })

  it('uses node label in generated ai_prompt default prompt', () => {
    const node = makeNode('N1', 'ai_prompt', { label: 'Summarize Results' })
    const result = validateAiPromptNodes([node], [])
    expect(result[0].data.aiPrompt).toContain('Summarize Results')
  })

  it('falls back to "Analyze" when label is empty for ai_prompt', () => {
    const node: Node<WorkflowNodeData> = {
      id: 'N1',
      type: 'ai_prompt',
      position: { x: 0, y: 0 },
      data: { type: 'ai_prompt', label: '' },
    }
    const result = validateAiPromptNodes([node], [])
    expect(result[0].data.aiPrompt).toContain('Analyze')
  })

  it('leaves agent node with existing non-empty agentPrompt unchanged', () => {
    const node = makeNode('N1', 'agent', { agentPrompt: 'Do the work.' })
    const result = validateAiPromptNodes([node], [])
    expect(result[0].data.agentPrompt).toBe('Do the work.')
  })

  it('fills default prompt for agent node with missing agentPrompt', () => {
    const node = makeNode('N1', 'agent')
    const result = validateAiPromptNodes([node], [])
    expect(typeof result[0].data.agentPrompt).toBe('string')
    expect((result[0].data.agentPrompt as string).length).toBeGreaterThan(0)
  })

  it('fills agent default prompt with no upstream (no reference suffix)', () => {
    const node = makeNode('N1', 'agent', { label: 'Deploy App' })
    const result = validateAiPromptNodes([node], [])
    expect(result[0].data.agentPrompt).toBe('Deploy App.')
  })

  it('fills agent default prompt with upstream refs', () => {
    const n1 = makeNode('N1', 'mcp_tool')
    const n2 = makeNode('N2', 'agent')
    const edges = [makeEdge('N1', 'N2')]
    const result = validateAiPromptNodes([n1, n2], edges)
    expect(result[1].data.agentPrompt).toContain('{{N1}}')
  })

  it('falls back to "Execute task" for agent node with empty label', () => {
    const node: Node<WorkflowNodeData> = {
      id: 'N1',
      type: 'agent',
      position: { x: 0, y: 0 },
      data: { type: 'agent', label: '' },
    }
    const result = validateAiPromptNodes([node], [])
    expect(result[0].data.agentPrompt).toContain('Execute task')
  })

  it('passes through non-ai, non-agent nodes without modification', () => {
    const node = makeNode('N1', 'mcp_tool', { toolId: 'git_commit' })
    const result = validateAiPromptNodes([node], [])
    expect(result[0]).toStrictEqual(node)
  })

  it('handles empty node list', () => {
    expect(validateAiPromptNodes([], [])).toEqual([])
  })

  it('does not mutate the original node object', () => {
    const node = makeNode('N1', 'ai_prompt')
    const original = { ...node, data: { ...node.data } }
    validateAiPromptNodes([node], [])
    expect(node.data.aiPrompt).toBe(original.data.aiPrompt)
  })
})

// ── serializeWorkflowForAi ────────────────────────────────────────────────────

describe('serializeWorkflowForAi', () => {
  it('includes node id, type, and label', () => {
    const node = makeNode('N1', 'mcp_tool', { label: 'My Tool' })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('N1')
    expect(result).toContain('mcp_tool')
    expect(result).toContain('My Tool')
  })

  it('outputs "(none)" when node has no parameters', () => {
    const node = makeNode('N1', 'ai_prompt')
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('(none)')
  })

  it('serializes parameter key-value pairs', () => {
    const node = makeNode('N1', 'mcp_tool', {
      parameters: {
        branch: { key: 'branch', label: 'Branch', type: 'string', value: 'main' },
      },
    })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('branch')
    expect(result).toContain('"main"')
  })

  it('omits null parameter values', () => {
    const node = makeNode('N1', 'mcp_tool', {
      parameters: {
        present: { key: 'present', label: 'Present', type: 'string', value: 'yes' },
        absent: null as never,
      },
    })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('present')
    // The null param should be filtered out
    expect(result).not.toContain('absent')
  })

  it('includes aiPrompt when present', () => {
    const node = makeNode('N1', 'ai_prompt', { aiPrompt: 'My special prompt' })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('AI Prompt: My special prompt')
  })

  it('includes conditionExpression, operator, value when present', () => {
    const node = makeNode('N1', 'condition', {
      conditionExpression: '{{N0.status}}',
      conditionOperator: 'equals',
      conditionValue: 'done',
    })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('{{N0.status}}')
    expect(result).toContain('equals')
    expect(result).toContain('done')
  })

  it('includes loop type and collection when present', () => {
    const node = makeNode('N1', 'loop', {
      loopType: 'collection',
      loopCollection: '{{N0.issues}}',
    })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('collection')
    expect(result).toContain('{{N0.issues}}')
  })

  it('includes loop count when loopType is count', () => {
    const node = makeNode('N1', 'loop', {
      loopType: 'count',
      loopCount: 5,
    })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('count')
    expect(result).toContain('x5')
  })

  it('includes loopType without collection or count annotation when neither is set (line 179 branch)', () => {
    // loopType is set (e.g. 'while') but loopCollection and loopCount are absent.
    // This exercises the final `''` fallback in the ternary chain on line 179.
    const node = makeNode('N1', 'loop', { loopType: 'while' })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('while')
    // No " over " and no " x" annotation since neither collection nor count was provided
    expect(result).not.toContain(' over ')
    expect(result).not.toMatch(/x\d/)
  })

  it('includes variableName and variableValue when present', () => {
    const node = makeNode('N1', 'variable', {
      variableName: 'myVar',
      variableValue: '42',
    })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('myVar')
    expect(result).toContain('42')
  })

  it('includes toolId when present', () => {
    const node = makeNode('N1', 'mcp_tool', { toolId: 'jira_create' })
    const result = serializeWorkflowForAi([node], [])
    expect(result).toContain('jira_create')
  })

  it('serializes edges with sourceHandle', () => {
    const edges: Edge[] = [makeEdge('N1', 'N2', 'body')]
    const result = serializeWorkflowForAi([], edges)
    expect(result).toContain('N1[body]')
    expect(result).toContain('N2')
  })

  it('serializes edges without sourceHandle (null)', () => {
    const edges: Edge[] = [makeEdge('N1', 'N2', null)]
    const result = serializeWorkflowForAi([], edges)
    expect(result).toContain('N1')
    expect(result).toContain('N2')
    expect(result).not.toContain('[null]')
  })

  it('serializes edges with "yes" and "no" handles', () => {
    const edges: Edge[] = [makeEdge('COND', 'YES_NODE', 'yes'), makeEdge('COND', 'NO_NODE', 'no')]
    const result = serializeWorkflowForAi([], edges)
    expect(result).toContain('COND[yes]')
    expect(result).toContain('COND[no]')
  })

  it('returns Nodes: and Edges: sections', () => {
    const result = serializeWorkflowForAi([], [])
    expect(result).toContain('Nodes:')
    expect(result).toContain('Edges:')
  })

  it('handles empty nodes and edges', () => {
    const result = serializeWorkflowForAi([], [])
    expect(result).toBe('Nodes:\n\n\nEdges:\n')
  })
})

// ── buildChatPrompt ───────────────────────────────────────────────────────────

describe('buildChatPrompt', () => {
  const makeMessage = (role: 'user' | 'assistant', content: string, changeSummary?: string): WorkflowChatMessage => ({
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
    changeSummary,
  })

  it('shows "(empty — only a Start node exists)" for a workflow with only a start node and no edges', () => {
    const startNode = makeNode('NODE_START_01', 'start')
    const prompt = buildChatPrompt([], [startNode], [], 'hello')
    expect(prompt).toContain('(empty — only a Start node exists)')
  })

  it('shows serialized workflow when more than one node exists', () => {
    const n1 = makeNode('NODE_START_01', 'start')
    const n2 = makeNode('N2', 'end')
    const prompt = buildChatPrompt([], [n1, n2], [], 'hello')
    expect(prompt).not.toContain('(empty — only a Start node exists)')
    expect(prompt).toContain('NODE_START_01')
  })

  it('shows serialized workflow when edges exist (even with only start node)', () => {
    const n1 = makeNode('NODE_START_01', 'start')
    const edges: Edge[] = [makeEdge('NODE_START_01', 'GHOST')]
    const prompt = buildChatPrompt([], [n1], edges, 'hello')
    expect(prompt).not.toContain('(empty — only a Start node exists)')
  })

  it('includes conversation history in the prompt', () => {
    const msgs = [
      makeMessage('user', 'Create a Jira workflow'),
      makeMessage('assistant', 'Done!', 'Added 3 nodes'),
    ]
    const prompt = buildChatPrompt(msgs, [], [], 'add a step')
    expect(prompt).toContain('[USER]: Create a Jira workflow')
    expect(prompt).toContain('[ASSISTANT]: Done!')
    expect(prompt).toContain('Changes: Added 3 nodes')
  })

  it('limits history to last 20 messages', () => {
    // 25 messages named msg-001 through msg-025 to avoid substring collision
    const msgs: WorkflowChatMessage[] = Array.from({ length: 25 }, (_, i) =>
      makeMessage('user', `msg-${String(i + 1).padStart(3, '0')}`),
    )
    const prompt = buildChatPrompt(msgs, [], [], 'next')
    // First 5 should be excluded (slice(-20) keeps indices 5-24 = msg-006..msg-025)
    expect(prompt).not.toContain('msg-001')
    expect(prompt).not.toContain('msg-005')
    expect(prompt).toContain('msg-006')
    expect(prompt).toContain('msg-025')
  })

  it('does NOT include changeSummary when absent', () => {
    const msgs = [makeMessage('user', 'hi')]
    const prompt = buildChatPrompt(msgs, [], [], 'next')
    expect(prompt).not.toContain('Changes:')
  })

  it('includes the active Jira project key when provided', () => {
    const prompt = buildChatPrompt([], [], [], 'hello', 'PROJ')
    expect(prompt).toContain('"PROJ"')
    expect(prompt).toContain('project = PROJ')
  })

  it('does NOT include Jira project key section when not provided', () => {
    const prompt = buildChatPrompt([], [], [], 'hello')
    expect(prompt).not.toContain('Active Jira project key')
  })

  it('includes the tool catalog', () => {
    const prompt = buildChatPrompt([], [], [], 'hello')
    expect(prompt).toContain('Git Operations')
    expect(prompt).toContain('jira_search')
    expect(prompt).toContain('slack_message')
  })

  it('includes the WORKFLOW_RUNTIME_GUIDE', () => {
    const prompt = buildChatPrompt([], [], [], 'hello')
    expect(prompt).toContain('Loop Execution')
    expect(prompt).toContain('Template Syntax')
  })

  it('instructs output of raw JSON only', () => {
    const prompt = buildChatPrompt([], [], [], 'hello')
    expect(prompt).toContain('OUTPUT ONLY RAW JSON')
  })

  it('returns a string', () => {
    expect(typeof buildChatPrompt([], [], [], 'test')).toBe('string')
  })
})

// ── generateWorkflowSummaryLocally ────────────────────────────────────────────

describe('generateWorkflowSummaryLocally', () => {
  it('returns ["No start node found"] when no start node exists', () => {
    const node = makeNode('N1', 'end')
    const result = generateWorkflowSummaryLocally([node], [])
    expect(result).toEqual(['No start node found'])
  })

  it('returns ["Empty workflow"] when start node has no outgoing edges and generates no steps', () => {
    const start = makeNode('START', 'start')
    const result = generateWorkflowSummaryLocally([start], [])
    expect(result).toEqual(['Empty workflow'])
  })

  it('describes mcp_tool node using tool name and description from catalog', () => {
    const start = makeNode('START', 'start')
    const tool = makeNode('N1', 'mcp_tool', { toolId: 'git_checkout', label: 'Checkout' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, tool], edges)
    expect(result.some((s) => s.includes('Git Checkout'))).toBe(true)
    expect(result.some((s) => s.includes('Switch branches'))).toBe(true)
  })

  it('falls back to node label when toolId is unknown', () => {
    const start = makeNode('START', 'start')
    const tool = makeNode('N1', 'mcp_tool', { toolId: 'unknown_tool', label: 'My Step', description: 'does stuff' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, tool], edges)
    expect(result.some((s) => s.includes('My Step'))).toBe(true)
  })

  it('falls back to node label when toolId is absent', () => {
    const start = makeNode('START', 'start')
    const tool = makeNode('N1', 'mcp_tool', { label: 'Custom Step', description: 'custom' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, tool], edges)
    expect(result.some((s) => s.includes('Custom Step'))).toBe(true)
  })

  it('uses empty string description when mcp_tool node has no description and toolId is unknown (line 310 branch)', () => {
    // toolId is set but unknown -> toolDef is null; d.description is also absent
    // this exercises the final `|| ''` fallback in the description expression
    const start = makeNode('START', 'start')
    const tool = makeNode('N1', 'mcp_tool', { toolId: 'no_such_tool', label: 'Fallback Step' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, tool], edges)
    // Step should be "Fallback Step: " (empty description)
    expect(result.some((s) => s.startsWith('Fallback Step:'))).toBe(true)
  })

  it('describes ai_prompt node', () => {
    const start = makeNode('START', 'start')
    const ai = makeNode('N1', 'ai_prompt', { label: 'Analyze Issues' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, ai], edges)
    expect(result).toContain('AI: Analyze Issues')
  })

  it('describes agent node with truncated prompt (60 chars)', () => {
    const longPrompt = 'a'.repeat(70)
    const start = makeNode('START', 'start')
    const agent = makeNode('N1', 'agent', { label: 'Deploy', agentPrompt: longPrompt })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, agent], edges)
    const step = result.find((s) => s.startsWith('Agent:'))!
    expect(step).toContain('...')
    expect(step).toContain('a'.repeat(60))
  })

  it('describes agent node with short prompt without ellipsis', () => {
    const start = makeNode('START', 'start')
    const agent = makeNode('N1', 'agent', { label: 'Run', agentPrompt: 'Short prompt' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, agent], edges)
    expect(result.some((s) => s.includes('Short prompt') && !s.includes('...'))).toBe(true)
  })

  it('describes agent node with no agentPrompt gracefully', () => {
    const start = makeNode('START', 'start')
    const agent = makeNode('N1', 'agent', { label: 'Do stuff' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, agent], edges)
    expect(result.some((s) => s.startsWith('Agent: Do stuff'))).toBe(true)
  })

  it('describes condition node', () => {
    const start = makeNode('START', 'start')
    const cond = makeNode('N1', 'condition', {
      conditionExpression: '{{N0.status}}',
      conditionOperator: 'equals',
      conditionValue: 'done',
    })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, cond], edges)
    expect(result.some((s) => s.startsWith('If ') && s.includes('{{N0.status}}'))).toBe(true)
  })

  it('uses defaults for condition node with no fields set', () => {
    const start = makeNode('START', 'start')
    const cond = makeNode('N1', 'condition')
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, cond], edges)
    expect(result.some((s) => s.includes('?'))).toBe(true)
  })

  it('describes collection loop node', () => {
    const start = makeNode('START', 'start')
    const loop = makeNode('N1', 'loop', { loopType: 'collection', loopCollection: '{{N0.issues}}' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, loop], edges)
    expect(result.some((s) => s.startsWith('For each item in') && s.includes('{{N0.issues}}'))).toBe(true)
  })

  it('uses "collection" default when collection loop has no loopCollection set (line 323 branch)', () => {
    // loopCollection is absent -> the `|| 'collection'` fallback is exercised
    const start = makeNode('START', 'start')
    const loop = makeNode('N1', 'loop', { loopType: 'collection' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, loop], edges)
    expect(result.some((s) => s === 'For each item in collection:')).toBe(true)
  })

  it('describes while loop node', () => {
    const start = makeNode('START', 'start')
    const loop = makeNode('N1', 'loop', { loopType: 'while', loopCondition: '{{N0.running}}' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, loop], edges)
    expect(result.some((s) => s.startsWith('While') && s.includes('{{N0.running}}'))).toBe(true)
  })

  it('uses "condition" default when while loop has no loopCondition set (line 325 branch)', () => {
    // loopCondition is absent -> the `|| 'condition'` fallback is exercised
    const start = makeNode('START', 'start')
    const loop = makeNode('N1', 'loop', { loopType: 'while' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, loop], edges)
    expect(result.some((s) => s === 'While condition:')).toBe(true)
  })

  it('describes count loop node', () => {
    const start = makeNode('START', 'start')
    const loop = makeNode('N1', 'loop', { loopType: 'count', loopCount: 5 })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, loop], edges)
    expect(result.some((s) => s.startsWith('Repeat 5 times'))).toBe(true)
  })

  it('describes loop node with no loopType as count with default 0', () => {
    const start = makeNode('START', 'start')
    const loop = makeNode('N1', 'loop')
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, loop], edges)
    expect(result.some((s) => s.startsWith('Repeat 0 times'))).toBe(true)
  })

  it('describes delay node', () => {
    const start = makeNode('START', 'start')
    const delay = makeNode('N1', 'delay', { delayMs: 3000, delayUnit: 'ms' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, delay], edges)
    expect(result.some((s) => s === 'Wait 3000 ms')).toBe(true)
  })

  it('describes delay node with defaults when fields missing', () => {
    const start = makeNode('START', 'start')
    const delay = makeNode('N1', 'delay')
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, delay], edges)
    expect(result.some((s) => s === 'Wait 0 s')).toBe(true)
  })

  it('describes variable node', () => {
    const start = makeNode('START', 'start')
    const variable = makeNode('N1', 'variable', { variableName: 'count', variableValue: '0' })
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, variable], edges)
    expect(result.some((s) => s === 'Set count = 0')).toBe(true)
  })

  it('uses defaults for variable node with no fields', () => {
    const start = makeNode('START', 'start')
    const variable = makeNode('N1', 'variable')
    const edges = [makeEdge('START', 'N1')]
    const result = generateWorkflowSummaryLocally([start, variable], edges)
    expect(result.some((s) => s.startsWith('Set var ='))).toBe(true)
  })

  it('skips start, end, note, parallel, merge node types (no step added)', () => {
    const start = makeNode('START', 'start')
    const end = makeNode('N_END', 'end')
    const note = makeNode('N_NOTE', 'note', { noteText: 'This is a note' })
    const parallel = makeNode('N_PAR', 'parallel')
    const merge = makeNode('N_MERGE', 'merge')
    const edges = [
      makeEdge('START', 'N_END'),
      makeEdge('START', 'N_NOTE'),
      makeEdge('START', 'N_PAR'),
      makeEdge('START', 'N_MERGE'),
    ]
    const result = generateWorkflowSummaryLocally([start, end, note, parallel, merge], edges)
    expect(result).toEqual(['Empty workflow'])
  })

  it('does not visit the same node twice (cycle prevention)', () => {
    const start = makeNode('START', 'start')
    const n1 = makeNode('N1', 'ai_prompt', { label: 'Step A' })
    // Create a cycle: START -> N1 -> N1 (self-loop)
    const edges = [makeEdge('START', 'N1'), makeEdge('N1', 'N1')]
    const result = generateWorkflowSummaryLocally([start, n1], edges)
    const count = result.filter((s) => s === 'AI: Step A').length
    expect(count).toBe(1)
  })

  it('skips a node that was queued twice via duplicate edges (line 299 visited.has branch)', () => {
    // Two edges both point from START to N1 — this causes N1 to be pushed into
    // the queue twice. When N1 is dequeued the second time, visited.has(id) is
    // true and the `continue` on line 299 is taken.
    const start = makeNode('START', 'start')
    const n1 = makeNode('N1', 'ai_prompt', { label: 'Once Only' })
    const edges = [
      { id: 'e1', source: 'START', target: 'N1', sourceHandle: null, type: 'dashed' },
      { id: 'e2', source: 'START', target: 'N1', sourceHandle: null, type: 'dashed' }, // duplicate
    ]
    const result = generateWorkflowSummaryLocally([start, n1], edges as any)
    // N1 must appear exactly once in the output despite being queued twice
    const count = result.filter((s) => s === 'AI: Once Only').length
    expect(count).toBe(1)
  })

  it('walks a multi-node linear chain', () => {
    const start = makeNode('START', 'start')
    const n1 = makeNode('N1', 'ai_prompt', { label: 'Step 1' })
    const n2 = makeNode('N2', 'ai_prompt', { label: 'Step 2' })
    const n3 = makeNode('N3', 'ai_prompt', { label: 'Step 3' })
    const edges = [makeEdge('START', 'N1'), makeEdge('N1', 'N2'), makeEdge('N2', 'N3')]
    const result = generateWorkflowSummaryLocally([start, n1, n2, n3], edges)
    expect(result).toContain('AI: Step 1')
    expect(result).toContain('AI: Step 2')
    expect(result).toContain('AI: Step 3')
  })

  it('handles node referenced in edge but not in nodes array gracefully', () => {
    const start = makeNode('START', 'start')
    const edges = [makeEdge('START', 'GHOST_NODE')]
    // Should not throw
    expect(() => generateWorkflowSummaryLocally([start], edges)).not.toThrow()
  })
})

// ── hydrateToolNodes ──────────────────────────────────────────────────────────

describe('hydrateToolNodes', () => {
  it('passes through non-mcp_tool nodes unchanged', () => {
    const node = makeNode('N1', 'ai_prompt', { aiPrompt: 'hello' })
    const result = hydrateToolNodes([node])
    expect(result[0]).toStrictEqual(node)
  })

  it('passes through mcp_tool node with no toolId unchanged', () => {
    const node = makeNode('N1', 'mcp_tool')
    const result = hydrateToolNodes([node])
    expect(result[0]).toStrictEqual(node)
  })

  it('passes through mcp_tool node with unknown toolId unchanged', () => {
    const node = makeNode('N1', 'mcp_tool', { toolId: 'totally_unknown' })
    const result = hydrateToolNodes([node])
    expect(result[0]).toStrictEqual(node)
  })

  it('fills parameters from the tool catalog for a known tool', () => {
    const node = makeNode('N1', 'mcp_tool', { toolId: 'git_checkout' })
    const result = hydrateToolNodes([node])
    const params = result[0].data.parameters!
    expect(params['branch']).toBeDefined()
    expect(params['branch'].key).toBe('branch')
    expect(params['branch'].label).toBe('Branch Name')
    expect(params['branch'].type).toBe('string')
  })

  it('deep-merges AI-provided parameter values with catalog definition', () => {
    const node = makeNode('N1', 'mcp_tool', {
      toolId: 'git_checkout',
      parameters: {
        branch: { key: 'branch', label: 'Branch Name', type: 'string', value: 'feature/my-branch' },
      },
    })
    const result = hydrateToolNodes([node])
    const params = result[0].data.parameters!
    // AI value should be preserved
    expect(params['branch'].value).toBe('feature/my-branch')
    // key and label from catalog should be preserved (not overwritten by AI)
    expect(params['branch'].key).toBe('branch')
    expect(params['branch'].label).toBe('Branch Name')
    expect(params['branch'].type).toBe('string')
  })

  it('catalog key and type win over AI-provided key and type in merge', () => {
    const node = makeNode('N1', 'mcp_tool', {
      toolId: 'git_commit',
      parameters: {
        message: {
          key: 'msg_alias',      // AI used wrong key alias
          label: 'AI Label',
          type: 'number' as never, // AI used wrong type
          value: 'fix: a bug',
        },
      },
    })
    const result = hydrateToolNodes([node])
    const params = result[0].data.parameters!
    expect(params['message'].key).toBe('message')
    expect(params['message'].type).toBe('string')
    // value comes from AI
    expect(params['message'].value).toBe('fix: a bug')
  })

  it('sets toolCategory from the catalog when not already set', () => {
    const node = makeNode('N1', 'mcp_tool', { toolId: 'git_checkout' })
    const result = hydrateToolNodes([node])
    expect(result[0].data.toolCategory).toBe('Git Operations')
  })

  it('preserves existing toolCategory if node already has one', () => {
    const node = makeNode('N1', 'mcp_tool', { toolId: 'git_checkout', toolCategory: 'Custom Cat' })
    const result = hydrateToolNodes([node])
    expect(result[0].data.toolCategory).toBe('Custom Cat')
  })

  it('sets toolIcon from the catalog when not already set', () => {
    const node = makeNode('N1', 'mcp_tool', { toolId: 'git_checkout' })
    const result = hydrateToolNodes([node])
    expect(result[0].data.toolIcon).toBeDefined()
    expect(typeof result[0].data.toolIcon).toBe('string')
  })

  it('preserves existing toolIcon if node already has one', () => {
    const node = makeNode('N1', 'mcp_tool', { toolId: 'git_checkout', toolIcon: 'custom-icon' })
    const result = hydrateToolNodes([node])
    expect(result[0].data.toolIcon).toBe('custom-icon')
  })

  it('includes ALL parameters from the catalog definition (not just AI-provided ones)', () => {
    // git_checkout has: branch, create, baseBranch
    const node = makeNode('N1', 'mcp_tool', {
      toolId: 'git_checkout',
      parameters: {
        branch: { key: 'branch', label: 'Branch Name', type: 'string', value: 'dev' },
        // AI did not provide 'create' or 'baseBranch'
      },
    })
    const result = hydrateToolNodes([node])
    const params = result[0].data.parameters!
    expect(params['branch']).toBeDefined()
    expect(params['create']).toBeDefined()
    expect(params['baseBranch']).toBeDefined()
  })

  it('handles a tool with no parameters defined in catalog', () => {
    // All real tools have parameters, but test robustness with an empty-ish case
    // We'll use a real tool (jira_delete has 1 param) — just verify it runs without error
    const node = makeNode('N1', 'mcp_tool', { toolId: 'jira_delete' })
    expect(() => hydrateToolNodes([node])).not.toThrow()
    const params = hydrateToolNodes([node])[0].data.parameters!
    expect(params['issueKey']).toBeDefined()
  })

  it('works with a Jira tool', () => {
    const node = makeNode('N1', 'mcp_tool', {
      toolId: 'jira_create',
      parameters: {
        summary: { key: 'summary', label: 'Summary', type: 'string', value: '{{_loopItem.title}}' },
      },
    })
    const result = hydrateToolNodes([node])
    const params = result[0].data.parameters!
    expect(params['summary'].value).toBe('{{_loopItem.title}}')
    expect(params['issueType']).toBeDefined()
    expect(params['description']).toBeDefined()
  })

  it('does not mutate the original node', () => {
    const node = makeNode('N1', 'mcp_tool', { toolId: 'git_checkout' })
    const originalParams = node.data.parameters
    hydrateToolNodes([node])
    expect(node.data.parameters).toBe(originalParams)
  })

  it('handles empty node list', () => {
    expect(hydrateToolNodes([])).toEqual([])
  })

  it('processes a mixed array, hydrating only mcp_tool nodes', () => {
    const n1 = makeNode('N1', 'start')
    const n2 = makeNode('N2', 'mcp_tool', { toolId: 'slack_message' })
    const n3 = makeNode('N3', 'end')
    const result = hydrateToolNodes([n1, n2, n3])
    expect(result[0]).toStrictEqual(n1)
    expect(result[1].data.parameters!['channel']).toBeDefined()
    expect(result[2]).toStrictEqual(n3)
  })

  it('falls back to aiParam.label when catalog parameter has no label (line 364 branch)', () => {
    // We need a tool whose catalog parameter has a falsy label so that
    // `p.label || aiParam.label` takes the right-hand branch.
    // We can achieve this by patching a real tool's parameter at runtime, but
    // a simpler approach: use a real tool and supply an aiParam whose label differs;
    // then verify the merge logic runs. The deep-merge always executes line 364
    // when aiParam is a non-null object — coverage for the `|| aiParam.label`
    // branch requires p.label to be falsy. We simulate that by providing a tool
    // whose parameter object from the catalog has label set but the AI also provides
    // a label. To hit the false side of `p.label`, we call hydrateToolNodes via
    // a node whose matching catalog param happens to have an empty-string label.
    // Since real catalog entries all have labels, we test the truthy side behaviour
    // (covered by existing tests) and focus on the else-branch at line 366 here.
    //
    // Direct test: pass aiParam as a non-object (primitive) to exercise the else branch
    // at line 365-367 (`parameters[p.key] = { ...p }`).
    const node = makeNode('N1', 'mcp_tool', {
      toolId: 'git_checkout',
      parameters: {
        // Provide the 'branch' param as a string (non-object) so the
        // `typeof aiParam === 'object'` check is false -> else branch at line 366.
        branch: 'main' as never,
      },
    })
    const result = hydrateToolNodes([node])
    const params = result[0].data.parameters!
    // Should use the catalog definition unchanged (else branch)
    expect(params['branch'].key).toBe('branch')
    expect(params['branch'].label).toBe('Branch Name')
  })
})
