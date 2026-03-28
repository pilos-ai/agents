import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData } from '../types/workflow'
import { validateWorkflow } from './workflow-validation'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  type: WorkflowNodeData['type'],
  overrides: Partial<WorkflowNodeData> = {},
): Node<WorkflowNodeData> {
  return {
    id,
    type: 'workflowNode',
    position: { x: 0, y: 0 },
    data: { type, label: `Node ${id}`, ...overrides },
  }
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
): Edge {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) }
}

// ── Structural: start / end nodes ────────────────────────────────────────────

describe('validateWorkflow — structural checks', () => {
  it('returns an error when there are no start nodes', () => {
    const result = validateWorkflow([], [])
    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual({
      type: 'error',
      message: 'Workflow must have a Start node',
    })
  })

  it('returns a warning (not an error) when there is no end node', () => {
    const start = makeNode('s1', 'start')
    const end = makeNode('e1', 'end')
    const edge = makeEdge('e1', 's1', 'e1')
    // Workflow with start + end is valid — confirm no "no end node" warning
    const withEnd = validateWorkflow([start, end], [edge])
    const noEndWarning = withEnd.issues.find((i) => i.message === 'Workflow has no End node')
    expect(noEndWarning).toBeUndefined()

    // Workflow with start but no end should warn
    const withoutEnd = validateWorkflow([start], [edge])
    expect(withoutEnd.issues).toContainEqual({
      type: 'warning',
      message: 'Workflow has no End node',
    })
    // A missing end node is only a warning, so valid may still be true if no errors exist
    // (start node has outgoing edge → no errors here)
    expect(withoutEnd.valid).toBe(true)
  })

  it('is invalid when both start and end nodes are missing', () => {
    const result = validateWorkflow([], [])
    expect(result.valid).toBe(false)
    const types = result.issues.map((i) => i.type)
    expect(types).toContain('error')
  })
})

// ── Start node connectivity ───────────────────────────────────────────────────

describe('validateWorkflow — start node connectivity', () => {
  it('errors when a start node has no outgoing edge', () => {
    const start = makeNode('s1', 'start')
    const result = validateWorkflow([start], [])
    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 's1',
      message: 'Start node has no outgoing connection',
    })
  })

  it('passes when a start node has at least one outgoing edge', () => {
    const start = makeNode('s1', 'start')
    const end = makeNode('e1', 'end')
    const edge = makeEdge('edge1', 's1', 'e1')
    const result = validateWorkflow([start, end], [edge])
    const startErrors = result.issues.filter(
      (i) => i.nodeId === 's1' && i.message.includes('outgoing'),
    )
    expect(startErrors).toHaveLength(0)
  })

  it('errors independently for each disconnected start node', () => {
    const s1 = makeNode('s1', 'start')
    const s2 = makeNode('s2', 'start')
    const end = makeNode('e1', 'end')
    const edge = makeEdge('edge1', 's1', 'e1')
    const result = validateWorkflow([s1, s2, end], [edge])
    const startErrors = result.issues.filter(
      (i) => i.type === 'error' && i.message.includes('outgoing'),
    )
    expect(startErrors).toHaveLength(1)
    expect(startErrors[0].nodeId).toBe('s2')
  })
})

// ── End node connectivity ─────────────────────────────────────────────────────

describe('validateWorkflow — end node connectivity', () => {
  it('warns when an end node has no incoming edge', () => {
    const start = makeNode('s1', 'start')
    const end = makeNode('e1', 'end')
    const outEdge = makeEdge('edge1', 's1', 'somewhere')
    const result = validateWorkflow([start, end], [outEdge])
    expect(result.issues).toContainEqual({
      type: 'warning',
      nodeId: 'e1',
      message: 'End node has no incoming connection',
    })
  })

  it('does not warn when an end node has an incoming edge', () => {
    const start = makeNode('s1', 'start')
    const end = makeNode('e1', 'end')
    const edge = makeEdge('edge1', 's1', 'e1')
    const result = validateWorkflow([start, end], [edge])
    const warn = result.issues.find(
      (i) => i.nodeId === 'e1' && i.message.includes('incoming'),
    )
    expect(warn).toBeUndefined()
  })
})

// ── Orphan / reachability detection ──────────────────────────────────────────

describe('validateWorkflow — orphan detection', () => {
  it('warns about nodes not reachable from start', () => {
    const start = makeNode('s1', 'start')
    const middle = makeNode('m1', 'mcp_tool')
    const orphan = makeNode('o1', 'mcp_tool')
    const end = makeNode('e1', 'end')
    const edges = [
      makeEdge('e1', 's1', 'm1'),
      makeEdge('e2', 'm1', 'e1'),
    ]
    const result = validateWorkflow([start, middle, orphan, end], edges)
    expect(result.issues).toContainEqual({
      type: 'warning',
      nodeId: 'o1',
      message: `"Node o1" is not reachable from Start`,
    })
  })

  it('does not warn about unreachable note nodes', () => {
    const start = makeNode('s1', 'start')
    const end = makeNode('e1', 'end')
    const note = makeNode('n1', 'note')
    const edge = makeEdge('e1', 's1', 'e1')
    const result = validateWorkflow([start, end, note], [edge])
    const noteWarning = result.issues.find((i) => i.nodeId === 'n1')
    expect(noteWarning).toBeUndefined()
  })

  it('skips orphan detection entirely when there is no start node', () => {
    const orphan = makeNode('o1', 'mcp_tool')
    const result = validateWorkflow([orphan], [])
    // No orphan warning — BFS is skipped without a start node
    const orphanWarnings = result.issues.filter(
      (i) => i.message && i.message.includes('not reachable'),
    )
    expect(orphanWarnings).toHaveLength(0)
  })

  it('considers all nodes reachable in a linear chain', () => {
    const start = makeNode('s1', 'start')
    const mid = makeNode('m1', 'mcp_tool')
    const end = makeNode('e1', 'end')
    const edges = [makeEdge('e1', 's1', 'm1'), makeEdge('e2', 'm1', 'e1')]
    const result = validateWorkflow([start, mid, end], edges)
    const reachabilityWarnings = result.issues.filter((i) =>
      i.message && i.message.includes('not reachable'),
    )
    expect(reachabilityWarnings).toHaveLength(0)
  })

  it('BFS does not revisit already-visited nodes (cycles do not loop forever)', () => {
    // A → B → A (cycle) — should terminate cleanly
    const start = makeNode('s1', 'start')
    const a = makeNode('a1', 'mcp_tool')
    const b = makeNode('b1', 'mcp_tool')
    const edges = [
      makeEdge('e1', 's1', 'a1'),
      makeEdge('e2', 'a1', 'b1'),
      makeEdge('e3', 'b1', 'a1'), // back-edge (cycle)
    ]
    expect(() => validateWorkflow([start, a, b], edges)).not.toThrow()
  })

  it('skips a node that was queued twice via duplicate edges (line 60 reachable.has branch)', () => {
    // Two separate edges both point to the same target node 'mid'.
    // The BFS pushes 'mid' twice (once from each source edge that isn't
    // guarded by the edge-level `!reachable.has(edge.target)` check, which only
    // runs as each node is being processed). When 'mid' is dequeued the second
    // time, reachable.has('mid') is true and the `continue` on line 60 fires.
    const start = makeNode('s1', 'start')
    const mid = makeNode('m1', 'mcp_tool')
    const end = makeNode('e1', 'end')
    // Two edges from start to mid — mid ends up in the BFS queue twice
    const edges = [
      makeEdge('dup1', 's1', 'm1'),
      makeEdge('dup2', 's1', 'm1'), // duplicate — causes double enqueue
      makeEdge('e_end', 'm1', 'e1'),
    ]
    // Should not throw and should consider all nodes reachable (no orphan warnings)
    const result = validateWorkflow([start, mid, end], edges)
    const reachabilityWarnings = result.issues.filter(
      (i) => i.message && i.message.includes('not reachable'),
    )
    expect(reachabilityWarnings).toHaveLength(0)
  })
})

// ── Loop node checks ──────────────────────────────────────────────────────────

describe('validateWorkflow — loop nodes', () => {
  function makeMinimalWorkflow(loopNode: Node<WorkflowNodeData>, extraEdges: Edge[] = []) {
    const start = makeNode('s1', 'start')
    const end = makeNode('e1', 'end')
    const edges: Edge[] = [
      makeEdge('e_start', 's1', loopNode.id),
      makeEdge('e_end', loopNode.id, 'e1'),
      ...extraEdges,
    ]
    return validateWorkflow([start, loopNode, end], edges)
  }

  it('errors when a loop node is missing its "body" connection', () => {
    const loop = makeNode('loop1', 'loop', { label: 'My Loop', loopType: 'count' })
    const doneEdge = makeEdge('done', 'loop1', 'somewhere', 'done')
    const result = makeMinimalWorkflow(loop, [doneEdge])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'loop1',
      message: 'Loop "My Loop" is missing a "body" connection',
    })
  })

  it('errors when a loop node is missing its "done" connection', () => {
    const loop = makeNode('loop1', 'loop', { label: 'My Loop', loopType: 'count' })
    const bodyEdge = makeEdge('body', 'loop1', 'somewhere', 'body')
    const result = makeMinimalWorkflow(loop, [bodyEdge])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'loop1',
      message: 'Loop "My Loop" is missing a "done" connection',
    })
  })

  it('does not error when a loop node has both "body" and "done" connections', () => {
    const loop = makeNode('loop1', 'loop', { label: 'My Loop', loopType: 'count' })
    const bodyEdge = makeEdge('body', 'loop1', 'body-target', 'body')
    const doneEdge = makeEdge('done', 'loop1', 'done-target', 'done')
    const result = makeMinimalWorkflow(loop, [bodyEdge, doneEdge])
    const loopErrors = result.issues.filter((i) => i.nodeId === 'loop1' && i.type === 'error')
    expect(loopErrors).toHaveLength(0)
  })

  it('errors on collection loop without loopCollection', () => {
    const loop = makeNode('loop1', 'loop', {
      label: 'Each Item',
      loopType: 'collection',
      loopCollection: undefined,
    })
    const bodyEdge = makeEdge('body', 'loop1', 'body-target', 'body')
    const doneEdge = makeEdge('done', 'loop1', 'done-target', 'done')
    const result = makeMinimalWorkflow(loop, [bodyEdge, doneEdge])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'loop1',
      message: 'Loop "Each Item" has no collection reference',
    })
  })

  it('does not error on collection loop that has loopCollection set', () => {
    const loop = makeNode('loop1', 'loop', {
      label: 'Each Item',
      loopType: 'collection',
      loopCollection: '{{output.items}}',
    })
    const bodyEdge = makeEdge('body', 'loop1', 'body-target', 'body')
    const doneEdge = makeEdge('done', 'loop1', 'done-target', 'done')
    const result = makeMinimalWorkflow(loop, [bodyEdge, doneEdge])
    const collectionErrors = result.issues.filter(
      (i) => i.nodeId === 'loop1' && i.message.includes('collection reference'),
    )
    expect(collectionErrors).toHaveLength(0)
  })

  it('does not check loopCollection for non-collection loop types', () => {
    const loop = makeNode('loop1', 'loop', {
      label: 'Count Loop',
      loopType: 'count',
      loopCollection: undefined,
    })
    const bodyEdge = makeEdge('body', 'loop1', 'body-target', 'body')
    const doneEdge = makeEdge('done', 'loop1', 'done-target', 'done')
    const result = makeMinimalWorkflow(loop, [bodyEdge, doneEdge])
    const collectionErrors = result.issues.filter(
      (i) => i.nodeId === 'loop1' && i.message.includes('collection reference'),
    )
    expect(collectionErrors).toHaveLength(0)
  })
})

// ── Condition node checks ─────────────────────────────────────────────────────

describe('validateWorkflow — condition nodes', () => {
  function makeConditionWorkflow(condNode: Node<WorkflowNodeData>, extraEdges: Edge[] = []) {
    const start = makeNode('s1', 'start')
    const end = makeNode('e1', 'end')
    const edges: Edge[] = [
      makeEdge('e_start', 's1', condNode.id),
      makeEdge('e_end', condNode.id, 'e1'),
      ...extraEdges,
    ]
    return validateWorkflow([start, condNode, end], edges)
  }

  it('warns when a condition node has no "yes" branch', () => {
    const cond = makeNode('c1', 'condition', {
      label: 'Is Active?',
      conditionExpression: 'x > 0',
    })
    const noEdge = makeEdge('no', 'c1', 'no-target', 'no')
    const result = makeConditionWorkflow(cond, [noEdge])
    expect(result.issues).toContainEqual({
      type: 'warning',
      nodeId: 'c1',
      message: 'Condition "Is Active?" has no "yes" branch',
    })
  })

  it('warns when a condition node has no "no" branch', () => {
    const cond = makeNode('c1', 'condition', {
      label: 'Is Active?',
      conditionExpression: 'x > 0',
    })
    const yesEdge = makeEdge('yes', 'c1', 'yes-target', 'yes')
    const result = makeConditionWorkflow(cond, [yesEdge])
    expect(result.issues).toContainEqual({
      type: 'warning',
      nodeId: 'c1',
      message: 'Condition "Is Active?" has no "no" branch',
    })
  })

  it('errors when a condition node has no expression', () => {
    const cond = makeNode('c1', 'condition', {
      label: 'Check',
      conditionExpression: undefined,
    })
    const result = makeConditionWorkflow(cond, [])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'c1',
      message: 'Condition "Check" has no expression',
    })
  })

  it('emits no condition issues when expression and both branches are present', () => {
    const cond = makeNode('c1', 'condition', {
      label: 'Check',
      conditionExpression: 'score >= 50',
    })
    const yesEdge = makeEdge('yes', 'c1', 'yes-target', 'yes')
    const noEdge = makeEdge('no', 'c1', 'no-target', 'no')
    const result = makeConditionWorkflow(cond, [yesEdge, noEdge])
    const condIssues = result.issues.filter((i) => i.nodeId === 'c1')
    expect(condIssues).toHaveLength(0)
  })

  it('condition warnings alone do not make the result invalid', () => {
    const cond = makeNode('c1', 'condition', {
      label: 'Check',
      conditionExpression: 'x > 0',
    })
    // no yes/no edges — two warnings
    const result = makeConditionWorkflow(cond, [])
    // only the missing expression is an error; if expression is present, warnings don't block
    const errors = result.issues.filter((i) => i.type === 'error' && i.nodeId === 'c1')
    expect(errors).toHaveLength(0)
  })
})

// ── AI prompt checks ──────────────────────────────────────────────────────────

describe('validateWorkflow — AI prompt nodes', () => {
  it('errors on an AI prompt node with an empty aiPrompt', () => {
    const ai = makeNode('ai1', 'ai_prompt', { label: 'Summarize', aiPrompt: '' })
    const result = validateWorkflow([ai], [])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'ai1',
      message: 'AI Prompt "Summarize" has an empty prompt',
    })
  })

  it('errors on an AI prompt node with a whitespace-only aiPrompt', () => {
    const ai = makeNode('ai1', 'ai_prompt', { label: 'Summarize', aiPrompt: '   ' })
    const result = validateWorkflow([ai], [])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'ai1',
      message: 'AI Prompt "Summarize" has an empty prompt',
    })
  })

  it('errors on an AI prompt node with undefined aiPrompt', () => {
    const ai = makeNode('ai1', 'ai_prompt', { label: 'Summarize', aiPrompt: undefined })
    const result = validateWorkflow([ai], [])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'ai1',
      message: 'AI Prompt "Summarize" has an empty prompt',
    })
  })

  it('does not error on an AI prompt node with a real prompt', () => {
    const ai = makeNode('ai1', 'ai_prompt', { label: 'Summarize', aiPrompt: 'Summarize this text.' })
    const result = validateWorkflow([ai], [])
    const aiErrors = result.issues.filter((i) => i.nodeId === 'ai1')
    expect(aiErrors).toHaveLength(0)
  })
})

// ── Agent checks ──────────────────────────────────────────────────────────────

describe('validateWorkflow — agent nodes', () => {
  it('errors on an agent node with an empty agentPrompt', () => {
    const agent = makeNode('ag1', 'agent', { label: 'Code Agent', agentPrompt: '' })
    const result = validateWorkflow([agent], [])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'ag1',
      message: 'Agent "Code Agent" has an empty prompt',
    })
  })

  it('errors on an agent node with a whitespace-only agentPrompt', () => {
    const agent = makeNode('ag1', 'agent', { label: 'Code Agent', agentPrompt: '\t\n' })
    const result = validateWorkflow([agent], [])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'ag1',
      message: 'Agent "Code Agent" has an empty prompt',
    })
  })

  it('errors on an agent node with undefined agentPrompt', () => {
    const agent = makeNode('ag1', 'agent', { label: 'Code Agent', agentPrompt: undefined })
    const result = validateWorkflow([agent], [])
    expect(result.issues).toContainEqual({
      type: 'error',
      nodeId: 'ag1',
      message: 'Agent "Code Agent" has an empty prompt',
    })
  })

  it('does not error on an agent node with a real prompt', () => {
    const agent = makeNode('ag1', 'agent', {
      label: 'Code Agent',
      agentPrompt: 'Fix the bug in the code.',
    })
    const result = validateWorkflow([agent], [])
    const agentErrors = result.issues.filter((i) => i.nodeId === 'ag1')
    expect(agentErrors).toHaveLength(0)
  })
})

// ── MCP tool parameter checks ─────────────────────────────────────────────────

describe('validateWorkflow — mcp_tool required parameter checks', () => {
  function makeToolNode(
    id: string,
    params: Record<string, {
      key: string
      label: string
      type: 'string'
      value: unknown
      required?: boolean
    }>,
  ): Node<WorkflowNodeData> {
    return makeNode(id, 'mcp_tool', { label: 'My Tool', parameters: params as any })
  }

  it('warns when a required parameter has an empty-string value', () => {
    const tool = makeToolNode('t1', {
      jql: { key: 'jql', label: 'JQL Query', type: 'string', value: '', required: true },
    })
    const result = validateWorkflow([tool], [])
    expect(result.issues).toContainEqual({
      type: 'warning',
      nodeId: 't1',
      message: '"My Tool" has empty required parameter: JQL Query',
    })
  })

  it('warns when a required parameter has an undefined value', () => {
    const tool = makeToolNode('t1', {
      jql: { key: 'jql', label: 'JQL Query', type: 'string', value: undefined, required: true },
    })
    const result = validateWorkflow([tool], [])
    expect(result.issues).toContainEqual({
      type: 'warning',
      nodeId: 't1',
      message: '"My Tool" has empty required parameter: JQL Query',
    })
  })

  it('warns when a required parameter has a null value', () => {
    const tool = makeToolNode('t1', {
      jql: { key: 'jql', label: 'JQL Query', type: 'string', value: null, required: true },
    })
    const result = validateWorkflow([tool], [])
    expect(result.issues).toContainEqual({
      type: 'warning',
      nodeId: 't1',
      message: '"My Tool" has empty required parameter: JQL Query',
    })
  })

  it('does not warn when a required parameter contains a template reference', () => {
    const tool = makeToolNode('t1', {
      jql: {
        key: 'jql',
        label: 'JQL Query',
        type: 'string',
        value: '{{previousNode.output}}',
        required: true,
      },
    })
    const result = validateWorkflow([tool], [])
    const paramWarnings = result.issues.filter((i) => i.nodeId === 't1')
    expect(paramWarnings).toHaveLength(0)
  })

  it('does not warn when an optional parameter is empty', () => {
    const tool = makeToolNode('t1', {
      desc: { key: 'desc', label: 'Description', type: 'string', value: '', required: false },
    })
    const result = validateWorkflow([tool], [])
    const paramWarnings = result.issues.filter(
      (i) => i.nodeId === 't1' && i.message.includes('Description'),
    )
    expect(paramWarnings).toHaveLength(0)
  })

  it('does not warn when a required parameter has a non-empty value', () => {
    const tool = makeToolNode('t1', {
      jql: {
        key: 'jql',
        label: 'JQL Query',
        type: 'string',
        value: 'project = DEMO',
        required: true,
      },
    })
    const result = validateWorkflow([tool], [])
    const paramWarnings = result.issues.filter((i) => i.nodeId === 't1')
    expect(paramWarnings).toHaveLength(0)
  })

  it('skips mcp_tool nodes that have no parameters field', () => {
    const tool = makeNode('t1', 'mcp_tool', { label: 'No Params' })
    // parameters is undefined — should not throw or emit issues
    expect(() => validateWorkflow([tool], [])).not.toThrow()
    const toolIssues = validateWorkflow([tool], []).issues.filter(
      (i) => i.message && i.message.includes('No Params'),
    )
    expect(toolIssues).toHaveLength(0)
  })

  it('ignores null entries in the parameters record', () => {
    const tool = makeNode('t1', 'mcp_tool', {
      label: 'My Tool',
      parameters: { nullParam: null } as any,
    })
    expect(() => validateWorkflow([tool], [])).not.toThrow()
  })

  it('does not trigger for node types other than mcp_tool', () => {
    // An ai_prompt node with a parameters field should not be treated as a tool
    const ai = makeNode('ai1', 'ai_prompt', {
      label: 'AI',
      aiPrompt: 'Hello',
      parameters: {
        p: { key: 'p', label: 'Param', type: 'string', value: '', required: true },
      } as any,
    })
    const result = validateWorkflow([ai], [])
    const paramWarnings = result.issues.filter(
      (i) => i.message && i.message.includes('empty required parameter'),
    )
    expect(paramWarnings).toHaveLength(0)
  })
})

// ── valid flag semantics ──────────────────────────────────────────────────────

describe('validateWorkflow — valid flag', () => {
  it('is true when the only issues are warnings', () => {
    const start = makeNode('s1', 'start')
    const end = makeNode('e1', 'end')
    const cond = makeNode('c1', 'condition', {
      label: 'Check',
      conditionExpression: 'x > 0',
    })
    const edges = [
      makeEdge('e1', 's1', 'c1'),
      makeEdge('e2', 'c1', 'e1'),
    ]
    const result = validateWorkflow([start, cond, end], edges)
    const errors = result.issues.filter((i) => i.type === 'error')
    expect(errors).toHaveLength(0)
    expect(result.valid).toBe(true)
  })

  it('is false when any error-level issue exists', () => {
    const start = makeNode('s1', 'start')
    const ai = makeNode('ai1', 'ai_prompt', { label: 'AI', aiPrompt: '' })
    const edge = makeEdge('e1', 's1', 'ai1')
    const result = validateWorkflow([start, ai], [edge])
    expect(result.valid).toBe(false)
  })

  it('returns valid:true and no issues for a minimal complete workflow', () => {
    const start = makeNode('s1', 'start')
    const end = makeNode('e1', 'end')
    const edge = makeEdge('e1', 's1', 'e1')
    const result = validateWorkflow([start, end], [edge])
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })
})

// ── Edge cases / empty inputs ─────────────────────────────────────────────────

describe('validateWorkflow — edge cases', () => {
  it('handles an empty nodes array without throwing', () => {
    expect(() => validateWorkflow([], [])).not.toThrow()
  })

  it('handles nodes with no edges without throwing', () => {
    const start = makeNode('s1', 'start')
    expect(() => validateWorkflow([start], [])).not.toThrow()
  })

  it('accumulates issues from multiple node types in a single call', () => {
    const start = makeNode('s1', 'start')
    const ai = makeNode('ai1', 'ai_prompt', { label: 'AI', aiPrompt: '' })
    const agent = makeNode('ag1', 'agent', { label: 'Agent', agentPrompt: undefined })
    const cond = makeNode('c1', 'condition', { label: 'Check', conditionExpression: undefined })
    const edge = makeEdge('e1', 's1', 'ai1')
    const result = validateWorkflow([start, ai, agent, cond], [edge])
    // AI error + agent error + condition expression error
    const errorMessages = result.issues.filter((i) => i.type === 'error').map((i) => i.message)
    expect(errorMessages).toContain('AI Prompt "AI" has an empty prompt')
    expect(errorMessages).toContain('Agent "Agent" has an empty prompt')
    expect(errorMessages).toContain('Condition "Check" has no expression')
    expect(result.valid).toBe(false)
  })
})
