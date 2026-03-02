import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowStepResult } from '../types/workflow'
import type { ExecutionContext, ExecutionCallbacks } from './workflow-executor'

// ── Mocks ──

vi.mock('../api', () => ({
  api: {
    jira: {
      getIssues: vi.fn().mockResolvedValue([]),
      getIssue: vi.fn().mockResolvedValue({}),
      createIssue: vi.fn().mockResolvedValue({ key: 'KAN-1', id: '1' }),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
      getTransitions: vi.fn().mockResolvedValue([]),
      getBoardConfig: vi.fn().mockResolvedValue(null),
      setActiveProject: vi.fn().mockResolvedValue(undefined),
      getProjects: vi.fn().mockResolvedValue([]),
    },
    claude: {
      onEvent: vi.fn().mockReturnValue(() => {}),
      startSession: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    },
    mcp: {
      writeConfig: vi.fn().mockResolvedValue({ configPath: '/tmp/mcp.json', warnings: [] }),
    },
  },
}))

vi.mock('../data/workflow-tools', () => ({
  WORKFLOW_TOOL_CATEGORIES: [
    {
      name: 'Jira Integration',
      icon: 'lucide:ticket',
      tools: [
        {
          id: 'jira_search',
          name: 'Search Issues',
          icon: 'lucide:search',
          description: 'Search Jira issues',
          category: 'Jira Integration',
          parameters: [{ key: 'jql', label: 'JQL', type: 'string', value: '', required: true }],
          direct: { handler: 'jira.getIssues', paramMap: { jql: 'jql' } },
        },
        {
          id: 'jira_create',
          name: 'Create Issue',
          icon: 'lucide:plus',
          description: 'Create Jira issue',
          category: 'Jira Integration',
          parameters: [
            { key: 'summary', label: 'Summary', type: 'string', value: '', required: true },
            { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
            { key: 'description', label: 'Description', type: 'string', value: '' },
          ],
          direct: { handler: 'jira.createIssue', paramMap: { summary: 'summary', issueType: 'issueType', description: 'description' } },
        },
        {
          id: 'jira_transition',
          name: 'Transition Issue',
          icon: 'lucide:arrow-right',
          description: 'Transition issue status',
          category: 'Jira Integration',
          parameters: [
            { key: 'issueKey', label: 'Issue Key', type: 'string', value: '', required: true },
            { key: 'status', label: 'Status', type: 'string', value: '' },
          ],
          direct: { handler: 'jira.transitionIssue', paramMap: { issueKey: 'issueKey', status: 'status' } },
        },
      ],
    },
  ],
}))

// Import after mocks are set up
const { api } = await import('../api')

import {
  resolvePath,
  resolveRef,
  resolveTemplates,
  delayToMs,
  evaluateCondition,
  buildAdjacency,
  buildReverseAdjacency,
  executeWorkflow,
} from './workflow-executor'

// ── Test Helpers ──

function makeNode(id: string, type: WorkflowNodeData['type'], overrides: Partial<WorkflowNodeData> = {}): Node<WorkflowNodeData> {
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { type, label: overrides.label || `${type}-${id}`, ...overrides },
  }
}

function makeEdge(source: string, target: string, sourceHandle?: string): Edge {
  return {
    id: `${source}-${target}${sourceHandle ? `-${sourceHandle}` : ''}`,
    source,
    target,
    sourceHandle: sourceHandle || null,
  } as Edge
}

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    variables: {},
    nodeOutputs: {},
    aborted: false,
    visitCounts: {},
    createdIssueSummaries: new Set(),
    ...overrides,
  }
}

function mockCallbacks() {
  const logs: string[] = []
  const completedNodes: string[] = []
  const failedNodes: string[] = []
  const startedNodes: string[] = []

  const callbacks: ExecutionCallbacks = {
    onNodeStart: vi.fn((id) => startedNodes.push(id)),
    onNodeComplete: vi.fn((id) => completedNodes.push(id)),
    onNodeFail: vi.fn((id) => failedNodes.push(id)),
    onLog: vi.fn((msg) => logs.push(msg)),
    onComplete: vi.fn(),
    onFail: vi.fn(),
    isAborted: vi.fn(() => false),
  }

  return { callbacks, logs, completedNodes, failedNodes, startedNodes }
}

// ── Unit Tests: Pure Functions ──

describe('resolvePath', () => {
  it('resolves simple dotted path', () => {
    expect(resolvePath({ a: { b: 1 } }, 'a.b')).toBe(1)
  })

  it('resolves nested path', () => {
    expect(resolvePath({ a: { b: { c: 'hello' } } }, 'a.b.c')).toBe('hello')
  })

  it('returns undefined for missing path', () => {
    expect(resolvePath({ a: 1 }, 'b')).toBeUndefined()
  })

  it('returns undefined for deep missing path', () => {
    expect(resolvePath({ a: { b: 1 } }, 'a.c.d')).toBeUndefined()
  })

  it('handles arrays by index', () => {
    expect(resolvePath({ items: [10, 20, 30] }, 'items.1')).toBe(20)
  })

  it('returns undefined on null input', () => {
    expect(resolvePath(null, 'a')).toBeUndefined()
  })

  it('returns undefined on primitive input', () => {
    expect(resolvePath(42, 'a')).toBeUndefined()
  })

  it('resolves single key (no dot)', () => {
    expect(resolvePath({ name: 'test' }, 'name')).toBe('test')
  })
})

describe('resolveRef', () => {
  it('resolves variable by simple key', () => {
    const ctx = makeCtx({ variables: { myVar: 'hello' } })
    expect(resolveRef('myVar', ctx)).toBe('hello')
  })

  it('resolves nodeOutput by dotted path', () => {
    const ctx = makeCtx({ nodeOutputs: { NODE_1: { status: 'success', count: 5 } } })
    expect(resolveRef('NODE_1.count', ctx)).toBe('5')
  })

  it('prefers variables over nodeOutputs for simple keys', () => {
    const ctx = makeCtx({
      variables: { key: 'from-var' },
      nodeOutputs: { key: 'from-output' },
    })
    expect(resolveRef('key', ctx)).toBe('from-var')
  })

  it('returns undefined for unknown ref', () => {
    const ctx = makeCtx()
    expect(resolveRef('unknown', ctx)).toBeUndefined()
  })

  it('resolves _loopItem.field from variables', () => {
    const ctx = makeCtx({
      variables: { _loopItem: { summary: 'Fix bug', priority: 'High' } },
    })
    expect(resolveRef('_loopItem.summary', ctx)).toBe('Fix bug')
  })

  it('resolves nodeOutput as object (serialized to JSON)', () => {
    const ctx = makeCtx({ nodeOutputs: { NODE_1: { a: 1, b: 2 } } })
    expect(resolveRef('NODE_1', ctx)).toBe('{"a":1,"b":2}')
  })

  it('resolves nodeOutput as string directly', () => {
    const ctx = makeCtx({ nodeOutputs: { NODE_1: 'plain text' } })
    expect(resolveRef('NODE_1', ctx)).toBe('plain text')
  })
})

describe('resolveTemplates', () => {
  it('replaces single {{ref}} in string', () => {
    const ctx = makeCtx({ variables: { name: 'World' } })
    expect(resolveTemplates('Hello {{name}}!', ctx)).toBe('Hello World!')
  })

  it('replaces multiple {{ref}} in string', () => {
    const ctx = makeCtx({ variables: { first: 'John', last: 'Doe' } })
    expect(resolveTemplates('{{first}} {{last}}', ctx)).toBe('John Doe')
  })

  it('leaves unresolved refs as empty string', () => {
    const ctx = makeCtx()
    expect(resolveTemplates('Hello {{unknown}}!', ctx)).toBe('Hello !')
  })

  it('handles {{_loopItem.field}} with nested object', () => {
    const ctx = makeCtx({
      variables: { _loopItem: { title: 'My Task', key: 'KAN-1' } },
    })
    expect(resolveTemplates('Issue: {{_loopItem.title}} ({{_loopItem.key}})', ctx))
      .toBe('Issue: My Task (KAN-1)')
  })

  it('handles {{nodeId.field}} from nodeOutputs', () => {
    const ctx = makeCtx({
      nodeOutputs: { AI_NODE: { result: 'generated text' } },
    })
    expect(resolveTemplates('Result: {{AI_NODE.result}}', ctx)).toBe('Result: generated text')
  })

  it('returns plain text unchanged', () => {
    const ctx = makeCtx()
    expect(resolveTemplates('no templates here', ctx)).toBe('no templates here')
  })
})

describe('evaluateCondition', () => {
  const makeCondNode = (expr: string, op: string, value: string) =>
    makeNode('cond1', 'condition', {
      conditionExpression: expr,
      conditionOperator: op as WorkflowNodeData['conditionOperator'],
      conditionValue: value,
    })

  it('equals operator — true', () => {
    const ctx = makeCtx({ variables: { status: 'done' } })
    expect(evaluateCondition(makeCondNode('{{status}}', 'equals', 'done'), ctx, [])).toBe(true)
  })

  it('equals operator — false', () => {
    const ctx = makeCtx({ variables: { status: 'pending' } })
    expect(evaluateCondition(makeCondNode('{{status}}', 'equals', 'done'), ctx, [])).toBe(false)
  })

  it('contains operator', () => {
    const ctx = makeCtx({ variables: { msg: 'hello world' } })
    expect(evaluateCondition(makeCondNode('{{msg}}', 'contains', 'world'), ctx, [])).toBe(true)
    expect(evaluateCondition(makeCondNode('{{msg}}', 'contains', 'xyz'), ctx, [])).toBe(false)
  })

  it('greater_than operator', () => {
    const ctx = makeCtx({ variables: { count: '10' } })
    expect(evaluateCondition(makeCondNode('{{count}}', 'greater_than', '5'), ctx, [])).toBe(true)
    expect(evaluateCondition(makeCondNode('{{count}}', 'greater_than', '15'), ctx, [])).toBe(false)
  })

  it('less_than operator', () => {
    const ctx = makeCtx({ variables: { count: '3' } })
    expect(evaluateCondition(makeCondNode('{{count}}', 'less_than', '5'), ctx, [])).toBe(true)
    expect(evaluateCondition(makeCondNode('{{count}}', 'less_than', '1'), ctx, [])).toBe(false)
  })

  it('regex operator', () => {
    const ctx = makeCtx({ variables: { code: 'ERR-404' } })
    expect(evaluateCondition(makeCondNode('{{code}}', 'regex', 'ERR-\\d+'), ctx, [])).toBe(true)
    expect(evaluateCondition(makeCondNode('{{code}}', 'regex', 'OK-\\d+'), ctx, [])).toBe(false)
  })
})

describe('delayToMs', () => {
  it('converts milliseconds', () => {
    expect(delayToMs(500, 'ms')).toBe(500)
  })

  it('converts seconds', () => {
    expect(delayToMs(2, 's')).toBe(2000)
  })

  it('converts minutes', () => {
    expect(delayToMs(3, 'min')).toBe(180_000)
  })

  it('converts hours', () => {
    expect(delayToMs(1, 'h')).toBe(3_600_000)
  })

  it('defaults to seconds for unknown unit', () => {
    expect(delayToMs(5, 'unknown')).toBe(5000)
  })
})

describe('buildAdjacency', () => {
  it('builds correct forward adjacency map', () => {
    const edges: Edge[] = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
      makeEdge('B', 'D'),
    ]
    const adj = buildAdjacency(edges)
    expect(adj.get('A')?.map((e) => e.target)).toEqual(['B', 'C'])
    expect(adj.get('B')?.map((e) => e.target)).toEqual(['D'])
    expect(adj.has('C')).toBe(false)
    expect(adj.has('D')).toBe(false)
  })

  it('handles empty edge list', () => {
    const adj = buildAdjacency([])
    expect(adj.size).toBe(0)
  })
})

describe('buildReverseAdjacency', () => {
  it('builds correct reverse adjacency map', () => {
    const edges: Edge[] = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
      makeEdge('B', 'C'),
    ]
    const rev = buildReverseAdjacency(edges)
    expect(rev.get('B')?.map((e) => e.source)).toEqual(['A'])
    expect(rev.get('C')?.map((e) => e.source)).toEqual(['A', 'B'])
    expect(rev.has('A')).toBe(false)
  })
})

// ── Integration Tests: Graph Execution ──

describe('executeWorkflow — linear flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('start → variable → end: sets variable and completes', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('v', 'variable', { variableName: 'x', variableValue: '42', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'v'), makeEdge('v', 'e')]
    const { callbacks, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks)

    expect(callbacks.onComplete).toHaveBeenCalled()
    expect(completedNodes).toContain('s')
    expect(completedNodes).toContain('v')
    expect(completedNodes).toContain('e')
  })

  it('calls onNodeStart and onNodeComplete in order', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('v', 'variable', { variableName: 'a', variableValue: '1', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'v'), makeEdge('v', 'e')]
    const { callbacks, startedNodes, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks)

    // All nodes should be started and completed
    expect(startedNodes).toEqual(['s', 'v', 'e'])
    expect(completedNodes).toEqual(['s', 'v', 'e'])
  })

  it('skips note nodes (annotations only)', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('n', 'note', { noteText: 'This is a comment' }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'n'), makeEdge('n', 'e')]
    const { callbacks, startedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks)

    // Note node should not be started (it's skipped)
    expect(startedNodes).not.toContain('n')
    expect(callbacks.onComplete).toHaveBeenCalled()
  })
})

describe('executeWorkflow — conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('follows YES branch when condition is true', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('v', 'variable', { variableName: 'flag', variableValue: 'yes', variableOperation: 'set' }),
      makeNode('c', 'condition', {
        conditionExpression: '{{flag}}',
        conditionOperator: 'equals',
        conditionValue: 'yes',
      }),
      makeNode('y', 'variable', { variableName: 'branch', variableValue: 'yes-taken', variableOperation: 'set' }),
      makeNode('n', 'variable', { variableName: 'branch', variableValue: 'no-taken', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'v'),
      makeEdge('v', 'c'),
      makeEdge('c', 'y', 'yes'),
      makeEdge('c', 'n', 'no'),
      makeEdge('y', 'e'),
      makeEdge('n', 'e'),
    ]
    const { callbacks, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks)

    expect(completedNodes).toContain('y')
    expect(completedNodes).not.toContain('n')
    expect(callbacks.onComplete).toHaveBeenCalled()
  })

  it('follows NO branch when condition is false', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('v', 'variable', { variableName: 'flag', variableValue: 'no', variableOperation: 'set' }),
      makeNode('c', 'condition', {
        conditionExpression: '{{flag}}',
        conditionOperator: 'equals',
        conditionValue: 'yes',
      }),
      makeNode('y', 'variable', { variableName: 'branch', variableValue: 'yes-taken', variableOperation: 'set' }),
      makeNode('n_node', 'variable', { variableName: 'branch', variableValue: 'no-taken', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'v'),
      makeEdge('v', 'c'),
      makeEdge('c', 'y', 'yes'),
      makeEdge('c', 'n_node', 'no'),
      makeEdge('y', 'e'),
      makeEdge('n_node', 'e'),
    ]
    const { callbacks, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks)

    expect(completedNodes).toContain('n_node')
    expect(completedNodes).not.toContain('y')
  })
})

describe('executeWorkflow — loops', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('count loop: executes body N times', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('loop', 'loop', { loopType: 'count', loopCount: 3 }),
      makeNode('body', 'variable', { variableName: 'counter', variableValue: '1', variableOperation: 'increment' }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'loop'),
      makeEdge('loop', 'body', 'body'),
      makeEdge('loop', 'e', 'done'),
    ]
    const { callbacks, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks)

    // Body should be completed 3 times (count loop)
    const bodyCompletions = completedNodes.filter((id) => id === 'body')
    expect(bodyCompletions.length).toBe(3)
    expect(callbacks.onComplete).toHaveBeenCalled()
  })

  it('collection loop: iterates over array from upstream node output', async () => {
    // In real workflows, data comes from upstream node outputs (search results, AI output).
    // Use a jira_search node whose output has a results array, then loop over it.
    vi.mocked(api.jira!.getIssues).mockResolvedValue([
      { id: '1', key: 'K-1', summary: 'Alice', status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Task', subtask: false }, created: '2024-01-01' } as any,
      { id: '2', key: 'K-2', summary: 'Bob', status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Task', subtask: false }, created: '2024-01-01' } as any,
      { id: '3', key: 'K-3', summary: 'Charlie', status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Task', subtask: false }, created: '2024-01-01' } as any,
    ])

    const nodes = [
      makeNode('s', 'start'),
      makeNode('search', 'mcp_tool', {
        toolId: 'jira_search',
        parameters: { jql: { key: 'jql', label: 'JQL', type: 'string', value: 'project = KAN' } },
      }),
      makeNode('loop', 'loop', { loopType: 'collection', loopCollection: '{{search.results}}' }),
      makeNode('body', 'variable', { variableName: 'last', variableValue: '{{_loopItem.summary}}', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'search'),
      makeEdge('search', 'loop'),
      makeEdge('loop', 'body', 'body'),
      makeEdge('loop', 'e', 'done'),
    ]
    const { callbacks, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    const bodyCompletions = completedNodes.filter((id) => id === 'body')
    expect(bodyCompletions.length).toBe(3)
    expect(callbacks.onComplete).toHaveBeenCalled()
  })

  it('collection loop: unwraps wrapper object to find array field', async () => {
    // When collection ref resolves to a wrapper object like {status, results: [...]},
    // the loop should unwrap the array field instead of looping once over the whole object.
    vi.mocked(api.jira!.getIssues).mockResolvedValue([
      { id: '1', key: 'K-1', summary: 'Alpha', status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Task', subtask: false }, created: '2024-01-01' } as any,
      { id: '2', key: 'K-2', summary: 'Beta', status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Task', subtask: false }, created: '2024-01-01' } as any,
    ])

    const nodes = [
      makeNode('s', 'start'),
      makeNode('search', 'mcp_tool', {
        toolId: 'jira_search',
        parameters: { jql: { key: 'jql', label: 'JQL', type: 'string', value: 'project = KAN' } },
      }),
      // Collection ref points to whole node output (not .results) — this is the bug scenario
      makeNode('loop', 'loop', { loopType: 'collection', loopCollection: '{{search}}' }),
      makeNode('body', 'variable', { variableName: 'last', variableValue: '{{_loopItem.summary}}', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'search'),
      makeEdge('search', 'loop'),
      makeEdge('loop', 'body', 'body'),
      makeEdge('loop', 'e', 'done'),
    ]
    const { callbacks, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    // Should iterate over the 2 issues (unwrapped from results), NOT once over the wrapper
    const bodyCompletions = completedNodes.filter((id) => id === 'body')
    expect(bodyCompletions.length).toBe(2)
    expect(callbacks.onComplete).toHaveBeenCalled()
  })

  it('follows done edge after loop completes', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('loop', 'loop', { loopType: 'count', loopCount: 1 }),
      makeNode('body', 'variable', { variableName: 'x', variableValue: '1', variableOperation: 'set' }),
      makeNode('after', 'variable', { variableName: 'done', variableValue: 'true', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'loop'),
      makeEdge('loop', 'body', 'body'),
      makeEdge('loop', 'after', 'done'),
      makeEdge('after', 'e'),
    ]
    const { callbacks, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks)

    expect(completedNodes).toContain('after')
    expect(completedNodes).toContain('e')
  })

  it('nested collection loops: inner loop resolves {{outerLoop.currentItem}}', async () => {
    // Simulates the real workflow: jira_search → outer loop → inner loop via currentItem
    // Each mock issue has a "subtasks" array to test nested iteration.
    vi.mocked(api.jira!.getIssues).mockResolvedValue([
      { id: '1', key: 'K-1', summary: 'Epic A', subtasks: ['t1', 't2'], status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Epic', subtask: false }, created: '2024-01-01' } as any,
      { id: '2', key: 'K-2', summary: 'Epic B', subtasks: ['t3'], status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Epic', subtask: false }, created: '2024-01-01' } as any,
    ])

    const nodes = [
      makeNode('s', 'start'),
      makeNode('search', 'mcp_tool', {
        toolId: 'jira_search',
        parameters: { jql: { key: 'jql', label: 'JQL', type: 'string', value: 'type = Epic' } },
      }),
      makeNode('outer', 'loop', { loopType: 'collection', loopCollection: '{{search.results}}' }),
      // Inner loop references parent loop's currentItem (the current epic object)
      // Smart unwrap finds the "subtasks" array field inside the epic
      makeNode('inner', 'loop', { loopType: 'collection', loopCollection: '{{outer.currentItem}}' }),
      makeNode('body', 'variable', { variableName: 'last', variableValue: '{{_loopItem}}', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'search'),
      makeEdge('search', 'outer'),
      makeEdge('outer', 'inner', 'body'),
      makeEdge('inner', 'body', 'body'),
      makeEdge('outer', 'e', 'done'),
    ]
    const { callbacks, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    // Epic A has 2 subtasks, Epic B has 1 → inner body should run 3 times total
    const bodyCompletions = completedNodes.filter((id) => id === 'body')
    expect(bodyCompletions.length).toBe(3)
    expect(callbacks.onComplete).toHaveBeenCalled()
  })
})

describe('executeWorkflow — direct tools (Jira)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.jira!.getIssues).mockResolvedValue([])
    vi.mocked(api.jira!.createIssue).mockResolvedValue({ key: 'KAN-99', id: '99' } as any)
  })

  it('jira.createIssue: calls API with resolved params', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: 'Test Issue' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: 'A test' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'create'), makeEdge('create', 'e')]
    const { callbacks } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    expect(api.jira!.createIssue).toHaveBeenCalledWith('KAN', 'Test Issue', 'A test', 'Task')
    expect(callbacks.onComplete).toHaveBeenCalled()
  })

  it('jira.createIssue: dedup layer 1 — skips duplicate within same run', async () => {
    // Loop that tries to create the same issue twice
    const nodes = [
      makeNode('s', 'start'),
      makeNode('loop', 'loop', { loopType: 'count', loopCount: 3 }),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: 'Same Summary' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: '' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'loop'),
      makeEdge('loop', 'create', 'body'),
      makeEdge('loop', 'e', 'done'),
    ]
    const { callbacks, logs } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    // Should only create once, skip the other 2
    expect(api.jira!.createIssue).toHaveBeenCalledTimes(1)
    const skipLogs = logs.filter((l) => l.includes('Skipped duplicate (same run)'))
    expect(skipLogs.length).toBe(2)
  })

  it('jira.createIssue: dedup layer 2 — skips when JQL finds existing issue', async () => {
    vi.mocked(api.jira!.getIssues).mockResolvedValue([
      { id: '50', key: 'KAN-50', summary: 'Existing Issue', status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Task', subtask: false }, created: '2024-01-01' } as any,
    ])

    const nodes = [
      makeNode('s', 'start'),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: 'Existing Issue' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: '' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'create'), makeEdge('create', 'e')]
    const { callbacks, logs } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    // Should NOT call createIssue — found via JQL
    expect(api.jira!.createIssue).not.toHaveBeenCalled()
    const skipLogs = logs.filter((l) => l.includes('already exists as KAN-50'))
    expect(skipLogs.length).toBe(1)
  })

  it('jira.createIssue: fails when summary is empty', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: '' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: '' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'create'), makeEdge('create', 'e')]
    const { callbacks, failedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    expect(failedNodes).toContain('create')
    expect(api.jira!.createIssue).not.toHaveBeenCalled()
  })

  it('jira.createIssue: fails when no project key', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: 'Test' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: '' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'create'), makeEdge('create', 'e')]
    const { callbacks, failedNodes } = mockCallbacks()

    // No jiraProjectKey override, and mock returns no projects
    vi.mocked(api.jira!.getBoardConfig).mockResolvedValue(null)
    vi.mocked(api.jira!.getProjects).mockResolvedValue([])

    await executeWorkflow(nodes, edges, callbacks)

    expect(failedNodes).toContain('create')
    expect(api.jira!.createIssue).not.toHaveBeenCalled()
  })

  it('jira.getIssues: calls API and returns results', async () => {
    vi.mocked(api.jira!.getIssues).mockResolvedValue([
      { id: '1', key: 'KAN-1', summary: 'Issue 1', status: { name: 'Done', categoryKey: 'done' }, issuetype: { name: 'Task', subtask: false }, created: '2024-01-01' } as any,
    ])

    const nodes = [
      makeNode('s', 'start'),
      makeNode('search', 'mcp_tool', {
        toolId: 'jira_search',
        parameters: {
          jql: { key: 'jql', label: 'JQL', type: 'string', value: 'project = KAN' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'search'), makeEdge('search', 'e')]
    const { callbacks } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    expect(api.jira!.getIssues).toHaveBeenCalledWith('project = KAN')
    expect(callbacks.onComplete).toHaveBeenCalled()
  })

  it('jira.createIssue inside collection loop: resolves _loopItem.summary', async () => {
    // Full integration: search → loop → createIssue with {{_loopItem.summary}}
    // First call returns search results; subsequent calls (dedup checks) return empty
    vi.mocked(api.jira!.getIssues)
      .mockResolvedValueOnce([
        { id: '1', key: 'K-1', summary: 'Fix login bug', status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Bug', subtask: false }, created: '2024-01-01' } as any,
        { id: '2', key: 'K-2', summary: 'Add dark mode', status: { name: 'To Do', categoryKey: 'new' }, issuetype: { name: 'Story', subtask: false }, created: '2024-01-01' } as any,
      ])
      .mockResolvedValue([])  // dedup JQL checks return no matches
    vi.mocked(api.jira!.createIssue).mockResolvedValue({ key: 'KAN-99', id: '99' } as any)

    const nodes = [
      makeNode('s', 'start'),
      makeNode('search', 'mcp_tool', {
        toolId: 'jira_search',
        parameters: { jql: { key: 'jql', label: 'JQL', type: 'string', value: 'project = SRC' } },
      }),
      makeNode('loop', 'loop', { loopType: 'collection', loopCollection: '{{search.results}}' }),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: '{{_loopItem.summary}}' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: 'Cloned from {{_loopItem.key}}' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'search'),
      makeEdge('search', 'loop'),
      makeEdge('loop', 'create', 'body'),
      makeEdge('loop', 'e', 'done'),
    ]
    const { callbacks } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    // Should create 2 issues with the correct resolved summaries
    expect(api.jira!.createIssue).toHaveBeenCalledTimes(2)
    expect(api.jira!.createIssue).toHaveBeenCalledWith('KAN', 'Fix login bug', 'Cloned from K-1', 'Task')
    expect(api.jira!.createIssue).toHaveBeenCalledWith('KAN', 'Add dark mode', 'Cloned from K-2', 'Task')
  })
})

describe('executeWorkflow — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.jira!.getIssues).mockResolvedValue([])
  })

  it('tool returning {status:"error"} is treated as failure', async () => {
    // Empty summary triggers error return
    const nodes = [
      makeNode('s', 'start'),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: '   ' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: '' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'create'), makeEdge('create', 'e')]
    const { callbacks, failedNodes, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    expect(failedNodes).toContain('create')
    // End node should NOT be reached since default error handling stops execution
    expect(completedNodes).not.toContain('e')
  })

  it('failureAction=skip: marks node as skipped, continues to next', async () => {
    const nodes = [
      makeNode('s', 'start'),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: '' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: '' },
        },
        errorHandling: { autoRetry: false, maxRetries: 0, failureAction: 'skip' as const },
      }),
      makeNode('after', 'variable', { variableName: 'reached', variableValue: 'yes', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'create'), makeEdge('create', 'after'), makeEdge('after', 'e')]
    const { callbacks, completedNodes } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    // After and end should be reached since error was skipped
    expect(completedNodes).toContain('after')
    expect(completedNodes).toContain('e')
    expect(callbacks.onComplete).toHaveBeenCalled()
  })
})

describe('executeWorkflow — abort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stops execution when isAborted returns true', async () => {
    let callCount = 0
    const nodes = [
      makeNode('s', 'start'),
      makeNode('v1', 'variable', { variableName: 'a', variableValue: '1', variableOperation: 'set' }),
      makeNode('v2', 'variable', { variableName: 'b', variableValue: '2', variableOperation: 'set' }),
      makeNode('e', 'end'),
    ]
    const edges = [makeEdge('s', 'v1'), makeEdge('v1', 'v2'), makeEdge('v2', 'e')]
    const { callbacks, completedNodes } = mockCallbacks()

    // Abort after first variable node
    vi.mocked(callbacks.isAborted).mockImplementation(() => {
      callCount++
      return callCount > 2 // Abort after start + v1
    })

    await executeWorkflow(nodes, edges, callbacks)

    expect(completedNodes).toContain('s')
    // v2 and e should not be reached
    expect(completedNodes).not.toContain('e')
  })
})

describe('executeWorkflow — cycle detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stops at max visits to prevent infinite loops', async () => {
    // Create a cycle: s → v → v (self-loop via edge)
    const nodes = [
      makeNode('s', 'start'),
      makeNode('v', 'variable', { variableName: 'x', variableValue: '1', variableOperation: 'increment' }),
    ]
    const edges = [
      makeEdge('s', 'v'),
      makeEdge('v', 'v'), // self-loop
    ]
    const { callbacks, logs } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks)

    // Should hit the visit limit and log a warning
    const limitLogs = logs.filter((l) => l.includes('visited') && l.includes('times'))
    expect(limitLogs.length).toBeGreaterThan(0)
    expect(callbacks.onComplete).toHaveBeenCalled()
  })
})

// ── Regression Tests ──

describe('regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.jira!.getIssues).mockResolvedValue([])
  })

  it('loop dedup: creating issues in a count loop with unique summaries creates all', async () => {
    let callNum = 0
    vi.mocked(api.jira!.createIssue).mockImplementation(async (_proj, summary) => {
      callNum++
      return { key: `KAN-${callNum}`, id: String(callNum), summary } as any
    })

    // Use a count loop with _loopIndex in the summary to produce unique summaries
    const nodes = [
      makeNode('s', 'start'),
      makeNode('loop', 'loop', { loopType: 'count', loopCount: 3 }),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: 'Task {{_loopIndex}}' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: '' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'loop'),
      makeEdge('loop', 'create', 'body'),
      makeEdge('loop', 'e', 'done'),
    ]
    const { callbacks } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    // All 3 unique summaries should be created
    expect(api.jira!.createIssue).toHaveBeenCalledTimes(3)
    expect(api.jira!.createIssue).toHaveBeenCalledWith('KAN', 'Task 0', '', 'Task')
    expect(api.jira!.createIssue).toHaveBeenCalledWith('KAN', 'Task 1', '', 'Task')
    expect(api.jira!.createIssue).toHaveBeenCalledWith('KAN', 'Task 2', '', 'Task')
  })

  it('loop dedup: identical summaries in count loop only create once', async () => {
    vi.mocked(api.jira!.createIssue).mockResolvedValue({ key: 'KAN-1', id: '1' } as any)

    // Same static summary in every iteration — dedup should catch it
    const nodes = [
      makeNode('s', 'start'),
      makeNode('loop', 'loop', { loopType: 'count', loopCount: 3 }),
      makeNode('create', 'mcp_tool', {
        toolId: 'jira_create',
        parameters: {
          summary: { key: 'summary', label: 'Summary', type: 'string', value: 'Same Task' },
          issueType: { key: 'issueType', label: 'Type', type: 'string', value: 'Task' },
          description: { key: 'description', label: 'Desc', type: 'string', value: '' },
        },
      }),
      makeNode('e', 'end'),
    ]
    const edges = [
      makeEdge('s', 'loop'),
      makeEdge('loop', 'create', 'body'),
      makeEdge('loop', 'e', 'done'),
    ]
    const { callbacks } = mockCallbacks()

    await executeWorkflow(nodes, edges, callbacks, undefined, 'KAN')

    // Only 1 actual create call
    expect(api.jira!.createIssue).toHaveBeenCalledTimes(1)
  })
})
