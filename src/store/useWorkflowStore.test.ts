import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowExecution } from '../types/workflow'
import {
  useWorkflowStore,
  stripRuntimeFields,
  stripEdgeRuntime,
  normalizeNodeTypes,
  buildAiFixPrompt,
} from './useWorkflowStore'

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  api: {
    claude: {
      startSession: vi.fn().mockResolvedValue(null),
      abort: vi.fn().mockResolvedValue(null),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(null),
    },
    jira: {
      getBoardConfig: vi.fn().mockResolvedValue(null),
      setActiveProject: vi.fn().mockResolvedValue(null),
      getProjects: vi.fn().mockResolvedValue([]),
    },
  },
}))

const mockTaskStoreState = {
  tasks: [] as { id: string; runs: unknown[]; workflow?: unknown }[],
  currentProjectPath: '/test-project',
  activeExecutions: {} as Record<string, { status: string }>,
  updateTask: vi.fn(),
  addRunResult: vi.fn(),
  setActiveExecution: vi.fn(),
  stopTask: vi.fn(),
}

vi.mock('./useTaskStore', () => ({
  useTaskStore: {
    getState: vi.fn(() => mockTaskStoreState),
    setState: vi.fn(),
  },
}))

vi.mock('./useProjectStore', () => ({
  useProjectStore: {
    getState: vi.fn(() => ({
      activeProjectPath: '/test-project',
    })),
  },
}))

vi.mock('../utils/workflow-executor', () => ({
  executeWorkflow: vi.fn().mockResolvedValue(undefined),
  executeSingleNode: vi.fn().mockResolvedValue({ result: 'ok' }),
  resolveTemplates: vi.fn((text: string) => text),
}))

vi.mock('../utils/workflow-ai', () => ({
  extractJson: vi.fn((text: string) => text),
  hydrateToolNodes: vi.fn((nodes: unknown) => nodes),
  validateAiPromptNodes: vi.fn((nodes: unknown) => nodes),
  WORKFLOW_RUNTIME_GUIDE: '<!-- runtime guide -->',
  buildChatPrompt: vi.fn().mockReturnValue('mock-prompt'),
  generateWorkflowSummaryLocally: vi.fn().mockReturnValue(['Step 1', 'Step 2']),
}))

vi.mock('../utils/workflow-validation', () => ({
  validateWorkflow: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getApi() {
  const mod = await import('../api')
  return (mod as unknown as { api: Record<string, Record<string, Mock>> }).api
}

async function getTaskStore() {
  const mod = await import('./useTaskStore')
  return (mod as unknown as { useTaskStore: { getState: Mock } }).useTaskStore
}

async function getWorkflowExecutor() {
  const mod = await import('../utils/workflow-executor')
  return mod as unknown as { executeWorkflow: Mock; executeSingleNode: Mock }
}

async function getWorkflowValidation() {
  const mod = await import('../utils/workflow-validation')
  return mod as unknown as { validateWorkflow: Mock }
}

function makeNode(id: string, type: WorkflowNodeData['type'] = 'mcp_tool'): Node<WorkflowNodeData> {
  return {
    id,
    type,
    position: { x: 100, y: 100 },
    data: { type, label: `Node ${id}` },
  }
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target }
}

function makeExecution(taskId = 'task-1', status: WorkflowExecution['status'] = 'running'): WorkflowExecution {
  return {
    id: 'exec-1',
    taskId,
    status,
    currentNodeId: null,
    currentStep: 0,
    totalSteps: 2,
    stepResults: [],
    startedAt: new Date().toISOString(),
    logs: [],
  }
}

const initialState = useWorkflowStore.getState()

beforeEach(async () => {
  useWorkflowStore.setState(initialState, true)
  vi.clearAllMocks()
  // Reset shared task store state to known defaults
  const taskStore = await getTaskStore()
  taskStore.getState.mockReturnValue({ ...mockTaskStoreState })
})

// ── setEditingTaskId ──────────────────────────────────────────────────────────

describe('setEditingTaskId', () => {
  it('clears state when called with null', () => {
    useWorkflowStore.setState({ editingTaskId: 'task-1', nodes: [makeNode('n1')], edges: [] })
    useWorkflowStore.getState().setEditingTaskId(null)
    const { editingTaskId, nodes, edges, history, historyIndex } = useWorkflowStore.getState()
    expect(editingTaskId).toBeNull()
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
    expect(history).toEqual([])
    expect(historyIndex).toBe(-1)
  })

  it('calls loadWorkflow when called with an id', async () => {
    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({
      tasks: [{ id: 'task-42', workflow: { nodes: [], edges: [] } }],
      activeExecutions: {},
    })
    useWorkflowStore.getState().setEditingTaskId('task-42')
    expect(useWorkflowStore.getState().editingTaskId).toBe('task-42')
  })
})

// ── loadWorkflow ──────────────────────────────────────────────────────────────

describe('loadWorkflow', () => {
  it('sets nodes and edges from task workflow', async () => {
    const taskStore = await getTaskStore()
    const nodes = [makeNode('n1'), makeNode('n2')]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    taskStore.getState.mockReturnValue({
      tasks: [{ id: 'task-1', workflow: { nodes, edges } }],
      activeExecutions: {},
    })

    useWorkflowStore.getState().loadWorkflow('task-1')

    const state = useWorkflowStore.getState()
    expect(state.nodes).toEqual(nodes)
    expect(state.edges).toEqual(edges)
    expect(state.editingTaskId).toBe('task-1')
    expect(state.historyIndex).toBe(0)
    expect(state.history).toHaveLength(1)
  })

  it('sets DEFAULT_START_NODE when workflow has no nodes', async () => {
    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({
      tasks: [{ id: 'task-empty', workflow: { nodes: [], edges: [] } }],
      activeExecutions: {},
    })

    useWorkflowStore.getState().loadWorkflow('task-empty')

    const { nodes } = useWorkflowStore.getState()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('NODE_START_01')
    expect(nodes[0].type).toBe('start')
  })

  it('opens chat mode for empty workflow (only start node)', async () => {
    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({
      tasks: [{ id: 'task-empty', workflow: { nodes: [], edges: [] } }],
      activeExecutions: {},
    })

    useWorkflowStore.getState().loadWorkflow('task-empty')
    expect(useWorkflowStore.getState().chatMode).toBe(true)
  })

  it('does not open chat mode for non-empty workflow', async () => {
    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({
      tasks: [{ id: 'task-1', workflow: { nodes: [makeNode('n1'), makeNode('n2')], edges: [] } }],
      activeExecutions: {},
    })

    useWorkflowStore.getState().loadWorkflow('task-1')
    expect(useWorkflowStore.getState().chatMode).toBe(false)
  })

  it('restores execution state from activeExecutions when running', async () => {
    const taskStore = await getTaskStore()
    const activeExec = {
      status: 'running' as const,
      currentStep: 2,
      totalSteps: 5,
      currentNodeLabel: null,
      logs: [],
      stepResults: [],
      startedAt: new Date().toISOString(),
    }
    taskStore.getState.mockReturnValue({
      tasks: [{ id: 'task-1', workflow: { nodes: [makeNode('n1')], edges: [] } }],
      activeExecutions: { 'task-1': activeExec },
    })

    useWorkflowStore.getState().loadWorkflow('task-1')

    const { execution } = useWorkflowStore.getState()
    expect(execution).not.toBeNull()
    expect(execution?.status).toBe('running')
    expect(execution?.currentStep).toBe(2)
  })

  it('does not restore execution when task is idle', async () => {
    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({
      tasks: [{ id: 'task-1', workflow: { nodes: [makeNode('n1')], edges: [] } }],
      activeExecutions: { 'task-1': { status: 'idle' } },
    })

    useWorkflowStore.getState().loadWorkflow('task-1')
    expect(useWorkflowStore.getState().execution).toBeNull()
  })
})

// ── addNode ───────────────────────────────────────────────────────────────────

describe('addNode', () => {
  it('appends node to nodes array', () => {
    const node = makeNode('n1')
    useWorkflowStore.getState().addNode(node)
    expect(useWorkflowStore.getState().nodes).toContainEqual(node)
  })

  it('pushes history before adding', () => {
    useWorkflowStore.setState({ nodes: [], edges: [], history: [{ nodes: [], edges: [] }], historyIndex: 0 })
    useWorkflowStore.getState().addNode(makeNode('n1'))
    expect(useWorkflowStore.getState().history.length).toBeGreaterThan(1)
  })

  it('adds multiple nodes independently', () => {
    useWorkflowStore.getState().addNode(makeNode('n1'))
    useWorkflowStore.getState().addNode(makeNode('n2'))
    expect(useWorkflowStore.getState().nodes).toHaveLength(2)
  })
})

// ── removeNode ────────────────────────────────────────────────────────────────

describe('removeNode', () => {
  it('removes node and connected edges', () => {
    useWorkflowStore.setState({
      nodes: [makeNode('n1'), makeNode('n2')],
      edges: [makeEdge('e1', 'n1', 'n2')],
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().removeNode('n1')
    const state = useWorkflowStore.getState()
    expect(state.nodes.find((n) => n.id === 'n1')).toBeUndefined()
    expect(state.edges.find((e) => e.source === 'n1' || e.target === 'n1')).toBeUndefined()
  })

  it('clears selectedNodeId if the removed node was selected', () => {
    useWorkflowStore.setState({
      nodes: [makeNode('n1')],
      edges: [],
      selectedNodeId: 'n1',
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().removeNode('n1')
    expect(useWorkflowStore.getState().selectedNodeId).toBeNull()
  })

  it('preserves selectedNodeId when removing a different node', () => {
    useWorkflowStore.setState({
      nodes: [makeNode('n1'), makeNode('n2')],
      edges: [],
      selectedNodeId: 'n2',
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().removeNode('n1')
    expect(useWorkflowStore.getState().selectedNodeId).toBe('n2')
  })

  it('refuses to remove the start node (NODE_START_01)', () => {
    const startNode = makeNode('NODE_START_01', 'start')
    useWorkflowStore.setState({
      nodes: [startNode],
      edges: [],
      history: [{ nodes: [startNode], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().removeNode('NODE_START_01')
    expect(useWorkflowStore.getState().nodes).toHaveLength(1)
  })
})

// ── updateNodeData ────────────────────────────────────────────────────────────

describe('updateNodeData', () => {
  it('merges data into the matching node', () => {
    useWorkflowStore.setState({
      nodes: [makeNode('n1')],
      edges: [],
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().updateNodeData('n1', { label: 'Updated Label' })
    const node = useWorkflowStore.getState().nodes.find((n) => n.id === 'n1')
    expect(node?.data.label).toBe('Updated Label')
  })

  it('does not affect other nodes', () => {
    useWorkflowStore.setState({
      nodes: [makeNode('n1'), makeNode('n2')],
      edges: [],
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().updateNodeData('n1', { label: 'Changed' })
    const n2 = useWorkflowStore.getState().nodes.find((n) => n.id === 'n2')
    expect(n2?.data.label).toBe('Node n2')
  })
})

// ── selectNode ────────────────────────────────────────────────────────────────

describe('selectNode', () => {
  it('sets selectedNodeId', () => {
    useWorkflowStore.getState().selectNode('n1')
    expect(useWorkflowStore.getState().selectedNodeId).toBe('n1')
  })

  it('clears selectedNodeId with null', () => {
    useWorkflowStore.setState({ selectedNodeId: 'n1' })
    useWorkflowStore.getState().selectNode(null)
    expect(useWorkflowStore.getState().selectedNodeId).toBeNull()
  })
})

// ── onConnect ─────────────────────────────────────────────────────────────────

describe('onConnect', () => {
  it('adds an edge with type dashed', () => {
    useWorkflowStore.setState({
      nodes: [makeNode('n1'), makeNode('n2')],
      edges: [],
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().onConnect({ source: 'n1', target: 'n2', sourceHandle: null, targetHandle: null })
    const edges = useWorkflowStore.getState().edges
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe('n1')
    expect(edges[0].target).toBe('n2')
    expect(edges[0].type).toBe('dashed')
  })
})

// ── Undo / Redo / History ─────────────────────────────────────────────────────

describe('pushHistory', () => {
  it('appends current nodes and edges to history', () => {
    const node = makeNode('n1')
    useWorkflowStore.setState({
      nodes: [node],
      edges: [],
      history: [],
      historyIndex: -1,
    })
    useWorkflowStore.getState().pushHistory()
    const { history, historyIndex } = useWorkflowStore.getState()
    expect(history).toHaveLength(1)
    expect(historyIndex).toBe(0)
    expect(history[0].nodes[0].id).toBe('n1')
  })

  it('truncates future history when branching', () => {
    const h = [
      { nodes: [makeNode('a')], edges: [] },
      { nodes: [makeNode('b')], edges: [] },
      { nodes: [makeNode('c')], edges: [] },
    ]
    useWorkflowStore.setState({
      nodes: [makeNode('current')],
      edges: [],
      history: h,
      historyIndex: 1, // at index 1, c is "future"
    })
    useWorkflowStore.getState().pushHistory()
    const { history } = useWorkflowStore.getState()
    // Only entries up to old historyIndex + 1 should remain (a, b + new)
    expect(history).toHaveLength(3)
    expect(history[2].nodes[0].id).toBe('current')
  })
})

describe('undo', () => {
  it('moves back one history step', () => {
    const h = [
      { nodes: [makeNode('original')], edges: [] },
      { nodes: [makeNode('modified')], edges: [] },
    ]
    useWorkflowStore.setState({ nodes: [makeNode('modified')], edges: [], history: h, historyIndex: 1 })
    useWorkflowStore.getState().undo()
    const state = useWorkflowStore.getState()
    expect(state.historyIndex).toBe(0)
    expect(state.nodes[0].id).toBe('original')
  })

  it('does nothing at the beginning of history', () => {
    const h = [{ nodes: [makeNode('only')], edges: [] }]
    useWorkflowStore.setState({ nodes: [makeNode('only')], edges: [], history: h, historyIndex: 0 })
    useWorkflowStore.getState().undo()
    expect(useWorkflowStore.getState().historyIndex).toBe(0)
  })
})

describe('redo', () => {
  it('moves forward one history step', () => {
    const h = [
      { nodes: [makeNode('original')], edges: [] },
      { nodes: [makeNode('modified')], edges: [] },
    ]
    useWorkflowStore.setState({ nodes: [makeNode('original')], edges: [], history: h, historyIndex: 0 })
    useWorkflowStore.getState().redo()
    const state = useWorkflowStore.getState()
    expect(state.historyIndex).toBe(1)
    expect(state.nodes[0].id).toBe('modified')
  })

  it('does nothing at the end of history', () => {
    const h = [{ nodes: [makeNode('only')], edges: [] }]
    useWorkflowStore.setState({ nodes: [makeNode('only')], edges: [], history: h, historyIndex: 0 })
    useWorkflowStore.getState().redo()
    expect(useWorkflowStore.getState().historyIndex).toBe(0)
  })
})

describe('canUndo / canRedo', () => {
  it('canUndo is false at start of history', () => {
    useWorkflowStore.setState({ history: [{ nodes: [], edges: [] }], historyIndex: 0 })
    expect(useWorkflowStore.getState().canUndo()).toBe(false)
  })

  it('canUndo is true when historyIndex > 0', () => {
    const h = [{ nodes: [], edges: [] }, { nodes: [], edges: [] }]
    useWorkflowStore.setState({ history: h, historyIndex: 1 })
    expect(useWorkflowStore.getState().canUndo()).toBe(true)
  })

  it('canRedo is false at end of history', () => {
    const h = [{ nodes: [], edges: [] }]
    useWorkflowStore.setState({ history: h, historyIndex: 0 })
    expect(useWorkflowStore.getState().canRedo()).toBe(false)
  })

  it('canRedo is true when not at last history entry', () => {
    const h = [{ nodes: [], edges: [] }, { nodes: [], edges: [] }]
    useWorkflowStore.setState({ history: h, historyIndex: 0 })
    expect(useWorkflowStore.getState().canRedo()).toBe(true)
  })
})

// ── saveWorkflow ──────────────────────────────────────────────────────────────

describe('saveWorkflow', () => {
  it('calls taskStore.updateTask with stripped workflow', async () => {
    const taskStore = await getTaskStore()
    const updateTaskFn = vi.fn()
    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      updateTask: updateTaskFn,
    })

    const node = makeNode('n1')
    const nodeWithRuntime: Node<WorkflowNodeData> = {
      ...node,
      data: { ...node.data, executionStatus: 'running', executionError: 'oops' },
    }
    const edge = makeEdge('e1', 'n1', 'n2')

    useWorkflowStore.setState({ editingTaskId: 'task-1', nodes: [nodeWithRuntime], edges: [edge] })
    useWorkflowStore.getState().saveWorkflow()

    expect(updateTaskFn).toHaveBeenCalledOnce()
    const [, updates] = updateTaskFn.mock.calls[0]
    expect(updates.workflow.nodes[0].data.executionStatus).toBeUndefined()
    expect(updates.workflow.nodes[0].data.executionError).toBeUndefined()
    expect(updates.workflow.edges[0]).not.toHaveProperty('animated')
  })

  it('does nothing when editingTaskId is null', async () => {
    const taskStore = await getTaskStore()
    const updateTaskFn = vi.fn()
    taskStore.getState.mockReturnValue({ ...mockTaskStoreState, updateTask: updateTaskFn })
    useWorkflowStore.setState({ editingTaskId: null })
    useWorkflowStore.getState().saveWorkflow()
    expect(updateTaskFn).not.toHaveBeenCalled()
  })
})

// ── Tool panel helpers ────────────────────────────────────────────────────────

describe('tool panel helpers', () => {
  it('setToolSearchQuery updates query', () => {
    useWorkflowStore.getState().setToolSearchQuery('jira')
    expect(useWorkflowStore.getState().toolSearchQuery).toBe('jira')
  })

  it('setToolFilterTab updates tab', () => {
    useWorkflowStore.getState().setToolFilterTab('jira')
    expect(useWorkflowStore.getState().toolFilterTab).toBe('jira')
  })

  it('setShowGenerateModal updates flag', () => {
    useWorkflowStore.getState().setShowGenerateModal(true)
    expect(useWorkflowStore.getState().showGenerateModal).toBe(true)
    useWorkflowStore.getState().setShowGenerateModal(false)
    expect(useWorkflowStore.getState().showGenerateModal).toBe(false)
  })

  it('setShowLogs updates showLogs', () => {
    useWorkflowStore.getState().setShowLogs(true)
    expect(useWorkflowStore.getState().showLogs).toBe(true)
  })

  it('clearValidation sets validationResult to null', () => {
    useWorkflowStore.setState({ validationResult: { valid: false, errors: ['Missing end'] } })
    useWorkflowStore.getState().clearValidation()
    expect(useWorkflowStore.getState().validationResult).toBeNull()
  })
})

// ── Execution ─────────────────────────────────────────────────────────────────

describe('startExecution', () => {
  it('does nothing if editingTaskId is null', async () => {
    const executor = await getWorkflowExecutor()
    useWorkflowStore.setState({ editingTaskId: null })
    useWorkflowStore.getState().startExecution()
    expect(executor.executeWorkflow).not.toHaveBeenCalled()
  })

  it('stops if validation fails', async () => {
    const executor = await getWorkflowExecutor()
    const validation = await getWorkflowValidation()
    validation.validateWorkflow.mockReturnValueOnce({ valid: false, errors: ['No end node'] })

    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({ ...mockTaskStoreState, activeExecutions: {} })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('n1'), makeNode('n2')],
      edges: [],
    })

    useWorkflowStore.getState().startExecution()

    expect(executor.executeWorkflow).not.toHaveBeenCalled()
    expect(useWorkflowStore.getState().validationResult?.valid).toBe(false)
  })

  it('sets execution with status running and calls executeWorkflow', async () => {
    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    const nodes = [
      makeNode('NODE_START_01', 'start'),
      makeNode('n1', 'mcp_tool'),
      makeNode('n2', 'end'),
    ]
    useWorkflowStore.setState({ editingTaskId: 'task-1', nodes, edges: [], history: [], historyIndex: -1 })

    const executor = await getWorkflowExecutor()
    useWorkflowStore.getState().startExecution()

    expect(executor.executeWorkflow).toHaveBeenCalledOnce()

    const { execution } = useWorkflowStore.getState()
    expect(execution?.status).toBe('running')
    expect(execution?.taskId).toBe('task-1')
  })

  it('does not double-start if task is already running', async () => {
    const executor = await getWorkflowExecutor()
    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      activeExecutions: { 'task-1': { status: 'running' } },
    })

    useWorkflowStore.setState({ editingTaskId: 'task-1', nodes: [makeNode('n1')], edges: [] })
    useWorkflowStore.getState().startExecution()
    expect(executor.executeWorkflow).not.toHaveBeenCalled()
  })

  it('marks non-display nodes as pending on start', async () => {
    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    const nodes = [makeNode('n1', 'mcp_tool'), makeNode('n2', 'note')]
    useWorkflowStore.setState({ editingTaskId: 'task-1', nodes, edges: [], history: [], historyIndex: -1 })
    useWorkflowStore.getState().startExecution()

    const statNodes = useWorkflowStore.getState().nodes
    expect(statNodes.find((n) => n.id === 'n1')?.data.executionStatus).toBe('pending')
    expect(statNodes.find((n) => n.id === 'n2')?.data.executionStatus).toBe('pending')
  })
})

describe('stopExecution', () => {
  it('sets execution status to failed', () => {
    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      execution: makeExecution('task-1', 'running'),
      debugPaused: false,
      debugResolve: null,
    })
    useWorkflowStore.getState().stopExecution()
    expect(useWorkflowStore.getState().execution?.status).toBe('failed')
  })

  it('resolves debugResolve promise if paused', () => {
    const resolveFn = vi.fn()
    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      execution: makeExecution('task-1', 'paused'),
      debugPaused: true,
      debugResolve: resolveFn,
    })
    useWorkflowStore.getState().stopExecution()
    expect(resolveFn).toHaveBeenCalledWith('continue')
    expect(useWorkflowStore.getState().debugPaused).toBe(false)
    expect(useWorkflowStore.getState().debugResolve).toBeNull()
  })

  it('marks running nodes as failed on stop', () => {
    const runningNode = {
      ...makeNode('n1'),
      data: { ...makeNode('n1').data, executionStatus: 'running' as const },
    }
    const pendingNode = {
      ...makeNode('n2'),
      data: { ...makeNode('n2').data, executionStatus: 'pending' as const },
    }
    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [runningNode, pendingNode],
      execution: makeExecution('task-1', 'running'),
      debugPaused: false,
      debugResolve: null,
    })
    useWorkflowStore.getState().stopExecution()
    const nodes = useWorkflowStore.getState().nodes
    expect(nodes.find((n) => n.id === 'n1')?.data.executionStatus).toBe('failed')
    expect(nodes.find((n) => n.id === 'n2')?.data.executionStatus).toBe('pending')
  })
})

describe('advanceExecution', () => {
  it('updates node execution status', () => {
    useWorkflowStore.setState({ nodes: [makeNode('n1')], edges: [] })
    useWorkflowStore.getState().advanceExecution('n1', 'completed')
    const node = useWorkflowStore.getState().nodes.find((n) => n.id === 'n1')
    expect(node?.data.executionStatus).toBe('completed')
  })
})

describe('resetExecution', () => {
  it('clears execution and strips executionStatus from nodes', () => {
    const nodeWithStatus = {
      ...makeNode('n1'),
      data: { ...makeNode('n1').data, executionStatus: 'completed' as const },
    }
    useWorkflowStore.setState({
      execution: makeExecution(),
      nodes: [nodeWithStatus],
      resultsCanvasOpen: true,
    })
    useWorkflowStore.getState().resetExecution()

    const state = useWorkflowStore.getState()
    expect(state.execution).toBeNull()
    expect(state.resultsCanvasOpen).toBe(false)
    expect(state.nodes.find((n) => n.id === 'n1')?.data.executionStatus).toBeUndefined()
  })
})

// ── Debug mode ────────────────────────────────────────────────────────────────

describe('debugStep', () => {
  it('calls debugResolve with step and clears debug state', () => {
    const resolveFn = vi.fn()
    useWorkflowStore.setState({
      debugPaused: true,
      debugResolve: resolveFn,
      execution: makeExecution('task-1', 'paused'),
    })
    useWorkflowStore.getState().debugStep()
    expect(resolveFn).toHaveBeenCalledWith('step')
    expect(useWorkflowStore.getState().debugPaused).toBe(false)
    expect(useWorkflowStore.getState().debugResolve).toBeNull()
    expect(useWorkflowStore.getState().execution?.status).toBe('running')
  })

  it('does nothing if no debugResolve', () => {
    useWorkflowStore.setState({ debugPaused: false, debugResolve: null })
    expect(() => useWorkflowStore.getState().debugStep()).not.toThrow()
  })
})

describe('debugContinue', () => {
  it('calls debugResolve with continue and clears debug state', () => {
    const resolveFn = vi.fn()
    useWorkflowStore.setState({
      debugPaused: true,
      debugResolve: resolveFn,
      execution: makeExecution('task-1', 'paused'),
    })
    useWorkflowStore.getState().debugContinue()
    expect(resolveFn).toHaveBeenCalledWith('continue')
    expect(useWorkflowStore.getState().debugPaused).toBe(false)
    expect(useWorkflowStore.getState().execution?.status).toBe('running')
  })
})

// ── AI Fix ────────────────────────────────────────────────────────────────────

describe('clearAiFix', () => {
  it('clears aiFixResult', () => {
    useWorkflowStore.setState({ aiFixResult: { suggestions: [], summary: 'done' } })
    useWorkflowStore.getState().clearAiFix()
    expect(useWorkflowStore.getState().aiFixResult).toBeNull()
  })
})

describe('aiFixWorkflow', () => {
  it('does nothing if execution is null', async () => {
    const api = await getApi()
    useWorkflowStore.setState({ execution: null })
    await useWorkflowStore.getState().aiFixWorkflow()
    expect(api.claude.startSession).not.toHaveBeenCalled()
    expect(useWorkflowStore.getState().isFixing).toBe(false)
  })

  it('sets isFixing true then resolves to aiFixResult', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      // Fire result event after event listener is registered
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          capturedCallback({
            sessionId: capturedSessionId,
            type: 'result',
            result: JSON.stringify({ nodes: null, summary: 'Fixed!' }),
          })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({
      execution: makeExecution('task-1', 'failed'),
      nodes: [makeNode('n1')],
      edges: [],
      jiraProjectKey: null,
    })

    await useWorkflowStore.getState().aiFixWorkflow()
    expect(useWorkflowStore.getState().isFixing).toBe(false)
    expect(useWorkflowStore.getState().aiFixResult).not.toBeNull()
  })

  it('accumulates streaming text via content_block_delta in aiFixWorkflow', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          // First fire delta events that accumulate resultText
          capturedCallback({ sessionId: capturedSessionId, type: 'content_block_delta', delta: { type: 'text_delta', text: '{"nodes":null,' } })
          capturedCallback({ sessionId: capturedSessionId, type: 'content_block_delta', delta: { type: 'text_delta', text: '"summary":"Streamed fix."}' } })
          // Fire result with no result string — stays with accumulated resultText
          capturedCallback({ sessionId: capturedSessionId, type: 'result' })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({
      execution: makeExecution('task-1', 'failed'),
      nodes: [makeNode('n1')],
      edges: [],
    })

    await useWorkflowStore.getState().aiFixWorkflow()

    const state = useWorkflowStore.getState()
    expect(state.isFixing).toBe(false)
    expect(state.aiFixResult?.summary).toBe('Streamed fix.')
  })

  it('extracts text from content blocks in aiFixWorkflow result', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          capturedCallback({
            sessionId: capturedSessionId,
            type: 'result',
            result: {
              content: [
                { type: 'text', text: '{"nodes":null,"summary":"Block extracted fix."}' },
              ],
            },
          })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({
      execution: makeExecution('task-1', 'failed'),
      nodes: [makeNode('n1')],
      edges: [],
    })

    await useWorkflowStore.getState().aiFixWorkflow()

    const state = useWorkflowStore.getState()
    expect(state.aiFixResult?.summary).toBe('Block extracted fix.')
  })

  it('resolves gracefully when aiFixWorkflow response is not valid JSON', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          capturedCallback({
            sessionId: capturedSessionId,
            type: 'result',
            result: 'This is plain text, not JSON at all.',
          })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({
      execution: makeExecution('task-1', 'failed'),
      nodes: [makeNode('n1')],
      edges: [],
    })

    await useWorkflowStore.getState().aiFixWorkflow()

    const state = useWorkflowStore.getState()
    expect(state.isFixing).toBe(false)
    // Should still produce an aiFixResult with the raw text as summary
    expect(state.aiFixResult).not.toBeNull()
    expect(state.aiFixResult?.summary).toContain('plain text')
  })

  it('sets aiFixResult with error message on session failure', async () => {
    const api = await getApi()
    api.claude.onEvent.mockReturnValue(() => {})
    api.claude.startSession.mockRejectedValue(new Error('Connection refused'))

    useWorkflowStore.setState({
      execution: makeExecution('task-1', 'failed'),
      nodes: [],
      edges: [],
    })

    await useWorkflowStore.getState().aiFixWorkflow()

    const { aiFixResult, isFixing } = useWorkflowStore.getState()
    expect(isFixing).toBe(false)
    expect(aiFixResult?.summary).toContain('Fix failed')
  })

  it('applies node and edge replacement when result contains both', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          capturedCallback({
            sessionId: capturedSessionId,
            type: 'result',
            result: JSON.stringify({
              nodes: [
                { id: 'fixed-n1', type: 'mcp_tool', position: { x: 0, y: 0 }, data: { type: 'mcp_tool', label: 'Fixed' } },
                { id: 'fixed-n2', type: 'end', position: { x: 0, y: 100 }, data: { type: 'end', label: 'End' } },
              ],
              edges: [{ id: 'fixed-e1', source: 'fixed-n1', target: 'fixed-n2' }],
              summary: 'Fixed with edges.',
            }),
          })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({
      execution: makeExecution('task-1', 'failed'),
      nodes: [makeNode('broken-n1')],
      edges: [],
    })

    await useWorkflowStore.getState().aiFixWorkflow()

    const state = useWorkflowStore.getState()
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0].id).toBe('fixed-e1')
    // Edge should have default type set
    expect(state.edges[0].type).toBe('dashed')
  })

  it('applies node replacement when result contains nodes', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          capturedCallback({
            sessionId: capturedSessionId,
            type: 'result',
            result: JSON.stringify({
              nodes: [{ id: 'fixed-n1', type: 'mcp_tool', position: { x: 0, y: 0 }, data: { type: 'mcp_tool', label: 'Fixed Node' } }],
              edges: [],
              summary: 'Fixed the workflow.',
            }),
          })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({
      execution: makeExecution('task-1', 'failed'),
      nodes: [makeNode('broken-n1')],
      edges: [],
    })

    await useWorkflowStore.getState().aiFixWorkflow()

    const state = useWorkflowStore.getState()
    expect(state.isFixing).toBe(false)
    // Nodes should have been replaced with the fixed version
    expect(state.nodes.some((n) => n.id === 'fixed-n1')).toBe(true)
    expect(state.nodes.some((n) => n.id === 'broken-n1')).toBe(false)
    expect(state.aiFixResult?.summary).toBe('Fixed the workflow.')
    // appliedAt should be set
    expect((state.aiFixResult as { appliedAt?: string })?.appliedAt).toBeTruthy()
  })
})

// ── retryNode ─────────────────────────────────────────────────────────────────

describe('retryNode', () => {
  it('does nothing if execution is null', async () => {
    const executor = await getWorkflowExecutor()
    useWorkflowStore.setState({ execution: null, nodes: [makeNode('n1')] })
    await useWorkflowStore.getState().retryNode('n1')
    expect(executor.executeSingleNode).not.toHaveBeenCalled()
  })

  it('does nothing if node does not exist', async () => {
    const executor = await getWorkflowExecutor()
    useWorkflowStore.setState({ execution: makeExecution(), nodes: [] })
    await useWorkflowStore.getState().retryNode('missing')
    expect(executor.executeSingleNode).not.toHaveBeenCalled()
  })

  it('marks node as running then completed on success', async () => {
    const executor = await getWorkflowExecutor()
    executor.executeSingleNode.mockResolvedValue({ result: 'ok' })

    const failedNode = {
      ...makeNode('n1'),
      data: { ...makeNode('n1').data, executionStatus: 'failed' as const, executionError: 'old error' },
    }
    const exec = makeExecution('task-1', 'completed')
    exec.stepResults = [{
      nodeId: 'n1',
      status: 'failed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 100,
      error: 'old error',
    }]

    useWorkflowStore.setState({ nodes: [failedNode], execution: exec })
    await useWorkflowStore.getState().retryNode('n1')

    const node = useWorkflowStore.getState().nodes.find((n) => n.id === 'n1')
    expect(node?.data.executionStatus).toBe('completed')
    expect(node?.data.executionError).toBeUndefined()

    // Old failed result should be replaced with success
    const stepResults = useWorkflowStore.getState().execution?.stepResults ?? []
    const result = stepResults.find((r) => r.nodeId === 'n1')
    expect(result?.status).toBe('completed')
  })

  it('marks node as failed when executeSingleNode throws', async () => {
    const executor = await getWorkflowExecutor()
    executor.executeSingleNode.mockRejectedValue(new Error('Tool error'))

    const node = makeNode('n1')
    useWorkflowStore.setState({ nodes: [node], execution: makeExecution() })
    await useWorkflowStore.getState().retryNode('n1')

    const updated = useWorkflowStore.getState().nodes.find((n) => n.id === 'n1')
    expect(updated?.data.executionStatus).toBe('failed')
    expect(updated?.data.executionError).toContain('Tool error')
  })
})

// ── Clipboard ─────────────────────────────────────────────────────────────────

describe('copyNode', () => {
  it('stores a deep copy of the node in clipboard', () => {
    const node = makeNode('n1')
    useWorkflowStore.setState({ nodes: [node], clipboard: null })
    useWorkflowStore.getState().copyNode('n1')
    const { clipboard } = useWorkflowStore.getState()
    expect(clipboard).not.toBeNull()
    expect(clipboard?.id).toBe('n1')
    // Verify it is a copy, not the same reference
    expect(clipboard).not.toBe(node)
  })

  it('does nothing when node does not exist', () => {
    useWorkflowStore.setState({ nodes: [], clipboard: null })
    useWorkflowStore.getState().copyNode('missing')
    expect(useWorkflowStore.getState().clipboard).toBeNull()
  })
})

describe('pasteNode', () => {
  it('does nothing when clipboard is empty', () => {
    useWorkflowStore.setState({ clipboard: null, nodes: [] })
    useWorkflowStore.getState().pasteNode()
    expect(useWorkflowStore.getState().nodes).toHaveLength(0)
  })

  it('adds a new node offset from the clipboard node', () => {
    const original = makeNode('n1')
    useWorkflowStore.setState({
      clipboard: original,
      nodes: [],
      edges: [],
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().pasteNode()
    const { nodes } = useWorkflowStore.getState()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).not.toBe('n1')
    expect(nodes[0].position.x).toBe(original.position.x + 40)
    expect(nodes[0].position.y).toBe(original.position.y + 40)
    expect(nodes[0].data.executionStatus).toBeUndefined()
  })

  it('sets pasted node as selected', () => {
    const original = makeNode('n1')
    useWorkflowStore.setState({
      clipboard: original,
      nodes: [],
      edges: [],
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().pasteNode()
    const { nodes, selectedNodeId } = useWorkflowStore.getState()
    expect(selectedNodeId).toBe(nodes[0].id)
  })
})

describe('duplicateNode', () => {
  it('does nothing when node does not exist', () => {
    useWorkflowStore.setState({ nodes: [], edges: [], history: [{ nodes: [], edges: [] }], historyIndex: 0 })
    useWorkflowStore.getState().duplicateNode('missing')
    expect(useWorkflowStore.getState().nodes).toHaveLength(0)
  })

  it('adds a duplicate node with offset position', () => {
    const node = makeNode('n1')
    useWorkflowStore.setState({
      nodes: [node],
      edges: [],
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    })
    useWorkflowStore.getState().duplicateNode('n1')
    const { nodes } = useWorkflowStore.getState()
    expect(nodes).toHaveLength(2)
    const dup = nodes.find((n) => n.id !== 'n1')!
    expect(dup.position.x).toBe(node.position.x + 40)
    expect(dup.position.y).toBe(node.position.y + 40)
  })
})

// ── Jira ──────────────────────────────────────────────────────────────────────

describe('setJiraProjectKey', () => {
  it('stores the jira project key', () => {
    useWorkflowStore.getState().setJiraProjectKey('PROJ')
    expect(useWorkflowStore.getState().jiraProjectKey).toBe('PROJ')
  })

  it('clears the jira project key with null', () => {
    useWorkflowStore.setState({ jiraProjectKey: 'PROJ' })
    useWorkflowStore.getState().setJiraProjectKey(null)
    expect(useWorkflowStore.getState().jiraProjectKey).toBeNull()
  })
})

describe('loadJiraProjects', () => {
  it('does nothing if no activeProjectPath', async () => {
    const { useProjectStore } = await import('./useProjectStore') as unknown as { useProjectStore: { getState: Mock } }
    useProjectStore.getState.mockReturnValue({ activeProjectPath: null })

    await useWorkflowStore.getState().loadJiraProjects()
    expect(useWorkflowStore.getState().jiraProjects).toEqual([])
  })

  it('sets jiraProjects from api response', async () => {
    const api = await getApi()
    api.jira.getProjects.mockResolvedValue([
      { key: 'PROJ', name: 'My Project' },
      { key: 'OTHER', name: 'Other Project' },
    ])
    api.jira.getBoardConfig.mockResolvedValue({ projectKey: 'PROJ' })
    api.jira.setActiveProject.mockResolvedValue(null)

    const { useProjectStore } = await import('./useProjectStore') as unknown as { useProjectStore: { getState: Mock } }
    useProjectStore.getState.mockReturnValue({ activeProjectPath: '/test-project' })

    await useWorkflowStore.getState().loadJiraProjects()

    const { jiraProjects, jiraProjectKey } = useWorkflowStore.getState()
    expect(jiraProjects).toHaveLength(2)
    expect(jiraProjectKey).toBe('PROJ')
  })

  it('silently handles jira api errors', async () => {
    const api = await getApi()
    api.jira.getBoardConfig.mockRejectedValue(new Error('Not connected'))

    await expect(useWorkflowStore.getState().loadJiraProjects()).resolves.not.toThrow()
  })
})

// ── Results canvas ────────────────────────────────────────────────────────────

describe('setResultsCanvasOpen', () => {
  it('opens and closes the results canvas', () => {
    useWorkflowStore.getState().setResultsCanvasOpen(true)
    expect(useWorkflowStore.getState().resultsCanvasOpen).toBe(true)
    useWorkflowStore.getState().setResultsCanvasOpen(false)
    expect(useWorkflowStore.getState().resultsCanvasOpen).toBe(false)
  })
})

// ── Chat Builder ──────────────────────────────────────────────────────────────

describe('toggleChatMode', () => {
  it('flips chatMode on each call', () => {
    useWorkflowStore.setState({ chatMode: false })
    useWorkflowStore.getState().toggleChatMode()
    expect(useWorkflowStore.getState().chatMode).toBe(true)
    useWorkflowStore.getState().toggleChatMode()
    expect(useWorkflowStore.getState().chatMode).toBe(false)
  })
})

describe('clearChat', () => {
  it('clears chat messages and streaming text', () => {
    useWorkflowStore.setState({
      chatMessages: [{ id: '1', role: 'user', content: 'hello', timestamp: 0 }],
      chatStreamingText: 'streaming...',
      workflowSummary: ['step 1'],
    })
    useWorkflowStore.getState().clearChat()
    const state = useWorkflowStore.getState()
    expect(state.chatMessages).toHaveLength(0)
    expect(state.chatStreamingText).toBe('')
    expect(state.workflowSummary).toBeNull()
  })
})

describe('setSummary', () => {
  it('sets workflowSummary lines', () => {
    useWorkflowStore.getState().setSummary(['Step 1', 'Step 2'])
    expect(useWorkflowStore.getState().workflowSummary).toEqual(['Step 1', 'Step 2'])
  })

  it('clears summary with null', () => {
    useWorkflowStore.setState({ workflowSummary: ['Step 1'] })
    useWorkflowStore.getState().setSummary(null)
    expect(useWorkflowStore.getState().workflowSummary).toBeNull()
  })
})

describe('abortChat', () => {
  it('calls claude.abort with current session id', async () => {
    const api = await getApi()
    useWorkflowStore.setState({ chatSessionId: 'wf-chat-123', chatIsGenerating: true })
    useWorkflowStore.getState().abortChat()
    expect(api.claude.abort).toHaveBeenCalledWith('wf-chat-123')
    const state = useWorkflowStore.getState()
    expect(state.chatIsGenerating).toBe(false)
    expect(state.chatSessionId).toBeNull()
    expect(state.chatStreamingText).toBe('')
  })

  it('does not call abort when no session is active', async () => {
    const api = await getApi()
    useWorkflowStore.setState({ chatSessionId: null })
    useWorkflowStore.getState().abortChat()
    expect(api.claude.abort).not.toHaveBeenCalled()
  })
})

describe('retryLastMessage', () => {
  it('does nothing when no user messages exist', () => {
    useWorkflowStore.setState({ chatMessages: [] })
    expect(() => useWorkflowStore.getState().retryLastMessage()).not.toThrow()
  })

  it('removes error messages and re-sends last user message', async () => {
    const api = await getApi()
    api.claude.onEvent.mockReturnValue(() => {})
    // startSession should not resolve (so we don't need full flow)
    api.claude.startSession.mockReturnValue(new Promise(() => {}))

    useWorkflowStore.setState({
      chatMessages: [
        { id: '1', role: 'user', content: 'hello', timestamp: 1 },
        { id: '2', role: 'assistant', content: '__ERROR__:Timeout', timestamp: 2 },
      ],
      nodes: [],
      edges: [],
      chatIsGenerating: false,
    })

    useWorkflowStore.getState().retryLastMessage()

    const state = useWorkflowStore.getState()
    // Error message should be stripped before re-send
    expect(state.chatMessages.every((m) => !m.content.startsWith('__ERROR__:'))).toBe(true)
    expect(state.chatIsGenerating).toBe(true)
  })
})

describe('sendChatMessage', () => {
  it('adds user message immediately and sets chatIsGenerating', async () => {
    const api = await getApi()
    api.claude.onEvent.mockReturnValue(() => {})
    api.claude.startSession.mockReturnValue(new Promise(() => {})) // never resolves

    useWorkflowStore.setState({ nodes: [], edges: [], chatMessages: [] })
    useWorkflowStore.getState().sendChatMessage('build a workflow')

    const state = useWorkflowStore.getState()
    expect(state.chatMessages).toHaveLength(1)
    expect(state.chatMessages[0].role).toBe('user')
    expect(state.chatMessages[0].content).toBe('build a workflow')
    expect(state.chatIsGenerating).toBe(true)
  })

  it('adds error assistant message on session failure', async () => {
    const api = await getApi()
    api.claude.onEvent.mockReturnValue(() => {})
    api.claude.startSession.mockRejectedValue(new Error('Session failed'))

    useWorkflowStore.setState({ nodes: [], edges: [], chatMessages: [] })
    await useWorkflowStore.getState().sendChatMessage('test')

    const { chatMessages, chatIsGenerating } = useWorkflowStore.getState()
    expect(chatIsGenerating).toBe(false)
    const errMsg = chatMessages.find((m) => m.role === 'assistant')
    expect(errMsg?.content).toMatch(/^__ERROR__:/)
  })
})

// ── Exported pure functions ───────────────────────────────────────────────────

describe('stripRuntimeFields', () => {
  it('removes executionStatus, executionError, displayData from node data', () => {
    const nodes: Node<WorkflowNodeData>[] = [
      {
        id: 'n1',
        type: 'mcp_tool',
        position: { x: 0, y: 0 },
        data: {
          type: 'mcp_tool',
          label: 'Tool',
          executionStatus: 'completed',
          executionError: 'err',
          displayData: { foo: 'bar' },
        },
      },
    ]
    const result = stripRuntimeFields(nodes)
    expect(result[0].data.executionStatus).toBeUndefined()
    expect(result[0].data.executionError).toBeUndefined()
    expect(result[0].data.displayData).toBeUndefined()
  })

  it('preserves node id, type, position, and other data fields', () => {
    const nodes: Node<WorkflowNodeData>[] = [
      { id: 'n1', type: 'start', position: { x: 10, y: 20 }, data: { type: 'start', label: 'Begin' } },
    ]
    const result = stripRuntimeFields(nodes)
    expect(result[0].id).toBe('n1')
    expect(result[0].type).toBe('start')
    expect(result[0].position).toEqual({ x: 10, y: 20 })
    expect(result[0].data.label).toBe('Begin')
  })
})

describe('stripEdgeRuntime', () => {
  it('returns only id, source, target, sourceHandle, targetHandle, type', () => {
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'yes', targetHandle: null, type: 'dashed', animated: true, selected: true },
    ] as Edge[]
    const result = stripEdgeRuntime(edges)
    expect(result[0]).not.toHaveProperty('animated')
    expect(result[0]).not.toHaveProperty('selected')
    expect(result[0].id).toBe('e1')
    expect(result[0].source).toBe('n1')
    expect(result[0].target).toBe('n2')
    expect(result[0].sourceHandle).toBe('yes')
  })
})

describe('normalizeNodeTypes', () => {
  it('preserves valid node type', () => {
    const nodes = [{ id: 'n1', type: 'ai_prompt', position: { x: 0, y: 0 }, data: { type: 'ai_prompt', label: 'AI' } }]
    const result = normalizeNodeTypes(nodes)
    expect(result[0].type).toBe('ai_prompt')
    expect(result[0].data.type).toBe('ai_prompt')
  })

  it('falls back to data.type when node.type is invalid', () => {
    const nodes = [{ id: 'n1', type: 'unknown_type', position: { x: 0, y: 0 }, data: { type: 'condition', label: 'Cond' } }]
    const result = normalizeNodeTypes(nodes)
    expect(result[0].type).toBe('condition')
  })

  it('falls back to mcp_tool when both types are invalid', () => {
    const nodes = [{ id: 'n1', type: 'garbage', position: { x: 0, y: 0 }, data: { type: 'also_garbage', label: 'Bad' } }]
    const result = normalizeNodeTypes(nodes)
    expect(result[0].type).toBe('mcp_tool')
  })

  it('uses data.type when node.type is missing', () => {
    const nodes = [{ id: 'n1', position: { x: 0, y: 0 }, data: { type: 'delay', label: 'Wait' } }]
    const result = normalizeNodeTypes(nodes)
    expect(result[0].type).toBe('delay')
  })
})

describe('buildAiFixPrompt', () => {
  it('includes node and edge descriptions in the prompt', () => {
    const nodes: Node<WorkflowNodeData>[] = [
      { id: 'n1', type: 'mcp_tool', position: { x: 300, y: 200 }, data: { type: 'mcp_tool', label: 'Search Jira' } },
    ]
    const edges: Edge[] = [{ id: 'e1', source: 'NODE_START_01', target: 'n1' }]
    const exec = makeExecution('task-1', 'failed')
    exec.stepResults = [{
      nodeId: 'n1',
      status: 'failed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 100,
      error: 'JQL syntax error',
    }]

    const prompt = buildAiFixPrompt(nodes, edges, exec)
    expect(prompt).toContain('Search Jira')
    expect(prompt).toContain('JQL syntax error')
    expect(prompt).toContain('NODE_START_01')
  })

  it('includes jiraProjectKey in prompt when provided', () => {
    const nodes: Node<WorkflowNodeData>[] = [
      { id: 'n1', type: 'start', position: { x: 0, y: 0 }, data: { type: 'start', label: 'Start' } },
    ]
    const exec = makeExecution('task-1', 'failed')
    const prompt = buildAiFixPrompt(nodes, [], exec, undefined, 'MYPROJ')
    expect(prompt).toContain('MYPROJ')
  })

  it('includes targetNodeId focus note when provided', () => {
    const nodes: Node<WorkflowNodeData>[] = [
      { id: 'n1', type: 'mcp_tool', position: { x: 0, y: 0 }, data: { type: 'mcp_tool', label: 'Tool' } },
    ]
    const exec = makeExecution('task-1', 'failed')
    const prompt = buildAiFixPrompt(nodes, [], exec, 'n1')
    expect(prompt).toContain('FOCUS')
    expect(prompt).toContain('n1')
  })
})

// ── sendChatMessage ────────────────────────────────────────────────────────────

describe('sendChatMessage', () => {
  it('adds user message immediately and sets chatIsGenerating', async () => {
    const api = await getApi()
    // Never resolve the promise so we can inspect mid-flight state
    api.claude.onEvent.mockReturnValue(() => {})
    api.claude.startSession.mockReturnValue(new Promise(() => {}))

    useWorkflowStore.setState({ nodes: [], edges: [], chatMessages: [] })
    const promise = useWorkflowStore.getState().sendChatMessage('build me a workflow')

    const state = useWorkflowStore.getState()
    expect(state.chatIsGenerating).toBe(true)
    expect(state.chatMessages).toHaveLength(1)
    expect(state.chatMessages[0].role).toBe('user')
    expect(state.chatMessages[0].content).toBe('build me a workflow')

    // Clean up dangling promise
    promise.catch(() => {})
  })

  it('resolves with explain action — appends assistant message without modifying nodes', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          capturedCallback({
            sessionId: capturedSessionId,
            type: 'result',
            result: JSON.stringify({ action: 'explain', message: 'Here is an explanation.' }),
          })
        }
      })
      return Promise.resolve(null)
    })

    const initialNodes = [makeNode('n1')]
    useWorkflowStore.setState({ nodes: initialNodes, edges: [], chatMessages: [] })

    await useWorkflowStore.getState().sendChatMessage('explain the workflow')

    const state = useWorkflowStore.getState()
    expect(state.chatIsGenerating).toBe(false)
    expect(state.chatSessionId).toBeNull()
    // nodes must remain unchanged for a non-replace action
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0].id).toBe('n1')
    // assistant message appended
    const assistantMsgs = state.chatMessages.filter((m) => m.role === 'assistant')
    expect(assistantMsgs).toHaveLength(1)
    expect(assistantMsgs[0].content).toBe('Here is an explanation.')
  })

  it('resolves with replace action — replaces nodes and edges and appends summary', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          capturedCallback({
            sessionId: capturedSessionId,
            type: 'result',
            result: JSON.stringify({
              action: 'replace',
              nodes: [{ id: 'new-n1', type: 'mcp_tool', position: { x: 0, y: 0 }, data: { type: 'mcp_tool', label: 'New Node' } }],
              edges: [{ id: 'new-e1', source: 'new-n1', target: 'end', type: 'dashed' }],
              message: 'Workflow updated.',
              summary: 'Added one step.',
            }),
          })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({ nodes: [makeNode('old-n1')], edges: [], chatMessages: [] })

    await useWorkflowStore.getState().sendChatMessage('replace the workflow')

    const state = useWorkflowStore.getState()
    expect(state.chatIsGenerating).toBe(false)
    // nodes must have been replaced
    expect(state.nodes.some((n) => n.id === 'new-n1')).toBe(true)
    expect(state.nodes.some((n) => n.id === 'old-n1')).toBe(false)
    // assistant message should carry changeSummary
    const assistantMsg = state.chatMessages.find((m) => m.role === 'assistant')
    expect(assistantMsg?.content).toBe('Workflow updated.')
    expect((assistantMsg as { changeSummary?: string })?.changeSummary).toBe('Added one step.')
    // workflowSummary lines generated
    expect(state.workflowSummary).not.toBeNull()
  })

  it('extracts text from result object content blocks', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          // Pass result as an object with content blocks (not a plain string)
          capturedCallback({
            sessionId: capturedSessionId,
            type: 'result',
            result: {
              content: [
                { type: 'text', text: '{"action":"explain","message":"Extracted from blocks."}' },
                { type: 'image' }, // non-text block — should be ignored
              ],
            },
          })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({ nodes: [], edges: [], chatMessages: [] })

    await useWorkflowStore.getState().sendChatMessage('use content blocks')

    const state = useWorkflowStore.getState()
    const assistantMsg = state.chatMessages.find((m) => m.role === 'assistant')
    expect(assistantMsg?.content).toBe('Extracted from blocks.')
  })

  it('times out after 5 minutes and appends __ERROR__ message', async () => {
    vi.useFakeTimers()
    const api = await getApi()
    api.claude.onEvent.mockReturnValue(() => {})
    // startSession never fires a result — let the timeout fire
    api.claude.startSession.mockReturnValue(new Promise(() => {}))

    useWorkflowStore.setState({ nodes: [], edges: [], chatMessages: [] })

    const promise = useWorkflowStore.getState().sendChatMessage('timeout test')

    // Advance past the 5-minute timeout
    await vi.advanceTimersByTimeAsync(300_001)
    await promise

    const state = useWorkflowStore.getState()
    expect(state.chatIsGenerating).toBe(false)
    const errorMsg = state.chatMessages.find((m) => m.role === 'assistant')
    expect(errorMsg?.content).toContain('__ERROR__')
    expect(errorMsg?.content).toContain('took too long')

    vi.useRealTimers()
  })

  it('rejects on invalid JSON response — appends __ERROR__ assistant message', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          capturedCallback({
            sessionId: capturedSessionId,
            type: 'result',
            result: 'this is definitely not json {{{',
          })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({ nodes: [], edges: [], chatMessages: [] })

    await useWorkflowStore.getState().sendChatMessage('break things')

    const state = useWorkflowStore.getState()
    expect(state.chatIsGenerating).toBe(false)
    const errorMsg = state.chatMessages.find((m) => m.role === 'assistant')
    expect(errorMsg?.content).toContain('__ERROR__')
    expect(errorMsg?.content).toContain('not valid JSON')
  })

  it('rejects on session start failure — appends __ERROR__ assistant message', async () => {
    const api = await getApi()
    api.claude.onEvent.mockReturnValue(() => {})
    api.claude.startSession.mockRejectedValue(new Error('Connection refused'))

    useWorkflowStore.setState({ nodes: [], edges: [], chatMessages: [] })

    await useWorkflowStore.getState().sendChatMessage('fail the session')

    const state = useWorkflowStore.getState()
    expect(state.chatIsGenerating).toBe(false)
    const errorMsg = state.chatMessages.find((m) => m.role === 'assistant')
    expect(errorMsg?.content).toContain('__ERROR__')
    expect(errorMsg?.content).toContain('Connection refused')
  })

  it('accumulates streaming text via content_block_delta events', async () => {
    const api = await getApi()
    let capturedCallback: ((event: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    api.claude.onEvent.mockImplementation((cb: (event: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    api.claude.startSession.mockImplementation((sid: string) => {
      capturedSessionId = sid
      Promise.resolve().then(() => {
        if (capturedCallback && capturedSessionId) {
          // Fire delta events first
          capturedCallback({ sessionId: capturedSessionId, type: 'content_block_delta', delta: { type: 'text_delta', text: '{"action":' } })
          capturedCallback({ sessionId: capturedSessionId, type: 'content_block_delta', delta: { type: 'text_delta', text: '"explain","message":"ok"}' } })
          // Then fire result with accumulated text
          capturedCallback({ sessionId: capturedSessionId, type: 'result', result: '{"action":"explain","message":"ok"}' })
        }
      })
      return Promise.resolve(null)
    })

    useWorkflowStore.setState({ nodes: [], edges: [], chatMessages: [] })

    await useWorkflowStore.getState().sendChatMessage('stream me')

    // After resolution chatStreamingText should be cleared
    expect(useWorkflowStore.getState().chatStreamingText).toBe('')
    // Assistant message should be present
    expect(useWorkflowStore.getState().chatMessages.some((m) => m.role === 'assistant')).toBe(true)
  })
})

// ── buildAiFixPrompt (exported pure function) ─────────────────────────────────

describe('buildAiFixPrompt', () => {
  const baseExecution: WorkflowExecution = {
    id: 'exec-1',
    taskId: 'task-1',
    status: 'failed',
    currentNodeId: null,
    currentStep: 1,
    totalSteps: 2,
    stepResults: [
      {
        nodeId: 'n1',
        status: 'failed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 100,
        error: 'Tool not found',
      },
    ],
    startedAt: new Date().toISOString(),
    logs: [],
  }

  it('returns a string containing node and edge descriptions', () => {
    const node = makeNode('n1')
    const edge = { id: 'e1', source: 'n1', target: 'n2', type: 'dashed' } as import('@xyflow/react').Edge
    const result = buildAiFixPrompt([node], [edge], baseExecution)
    expect(result).toContain('n1')
    expect(result).toContain('n1 --> n2')
    expect(result).toContain('Tool not found')
    expect(result).toContain('FAILED NODES')
  })

  it('includes jiraProjectKey when provided', () => {
    const result = buildAiFixPrompt([], [], baseExecution, undefined, 'MYPROJECT')
    expect(result).toContain('MYPROJECT')
  })

  it('includes FOCUS scope note when targetNodeId is provided', () => {
    const result = buildAiFixPrompt([], [], baseExecution, 'n1')
    expect(result).toContain('FOCUS')
    expect(result).toContain('"n1"')
  })

  it('omits FOCUS scope note when targetNodeId is not provided', () => {
    const result = buildAiFixPrompt([], [], baseExecution)
    expect(result).not.toContain('FOCUS')
  })

  it('includes edge sourceHandle in description when present', () => {
    const edge = { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'true', type: 'dashed' } as import('@xyflow/react').Edge
    const result = buildAiFixPrompt([], [edge], baseExecution)
    expect(result).toContain('[true]')
  })

  it('includes output in step result description when present', () => {
    const execWithOutput: WorkflowExecution = {
      ...baseExecution,
      stepResults: [{
        nodeId: 'n1',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 50,
        output: { result: 'some output' },
      }],
    }
    const result = buildAiFixPrompt([makeNode('n1')], [], execWithOutput)
    expect(result).toContain('some output')
  })

  it('includes node aiPrompt, aiModel, and conditionExpression when set', () => {
    const node: Node<WorkflowNodeData> = {
      ...makeNode('n1'),
      data: {
        ...makeNode('n1').data,
        aiPrompt: 'my prompt',
        aiModel: 'opus',
        conditionExpression: 'x',
        conditionOperator: 'equals',
        conditionValue: '5',
      },
    }
    const result = buildAiFixPrompt([node], [], baseExecution)
    expect(result).toContain('my prompt')
    expect(result).toContain('opus')
    expect(result).toContain('equals')
  })
})

// ── normalizeNodeTypes with invalid types ─────────────────────────────────────

describe('normalizeNodeTypes', () => {
  it('keeps valid node types unchanged', () => {
    const nodes = [{ id: 'n1', type: 'mcp_tool', position: { x: 0, y: 0 }, data: { type: 'mcp_tool', label: 'Test' } }]
    const result = normalizeNodeTypes(nodes)
    expect(result[0].type).toBe('mcp_tool')
    expect(result[0].data.type).toBe('mcp_tool')
  })

  it('falls back to mcp_tool for completely unknown types', () => {
    const nodes = [{ id: 'n1', type: 'unknown_type', position: { x: 0, y: 0 }, data: { type: 'also_unknown', label: 'X' } }]
    const result = normalizeNodeTypes(nodes)
    expect(result[0].type).toBe('mcp_tool')
    expect(result[0].data.type).toBe('mcp_tool')
  })

  it('uses data.type as fallback when node.type is invalid but data.type is valid', () => {
    const nodes = [{ id: 'n1', type: 'bad_type', position: { x: 0, y: 0 }, data: { type: 'condition', label: 'X' } }]
    const result = normalizeNodeTypes(nodes)
    expect(result[0].type).toBe('condition')
  })

  it('handles missing node.type by using data.type', () => {
    const nodes = [{ id: 'n1', position: { x: 0, y: 0 }, data: { type: 'start', label: 'Start' } }]
    const result = normalizeNodeTypes(nodes as never)
    expect(result[0].type).toBe('start')
  })
})

// ── setEditingTaskId(null) clears editor state ────────────────────────────────

describe('setEditingTaskId', () => {
  it('clears all editor state when called with null', () => {
    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('n1')],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' } as import('@xyflow/react').Edge],
      selectedNodeId: 'n1',
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
      execution: {
        id: 'exec-1',
        taskId: 'task-1',
        status: 'running',
        currentNodeId: null,
        currentStep: 0,
        totalSteps: 1,
        stepResults: [],
        startedAt: new Date().toISOString(),
        logs: [],
      },
    })

    useWorkflowStore.getState().setEditingTaskId(null)

    const state = useWorkflowStore.getState()
    expect(state.editingTaskId).toBeNull()
    expect(state.nodes).toHaveLength(0)
    expect(state.edges).toHaveLength(0)
    expect(state.selectedNodeId).toBeNull()
    expect(state.history).toHaveLength(0)
    expect(state.execution).toBeNull()
  })

  it('calls loadWorkflow when called with a non-null id', async () => {
    const taskStore = await getTaskStore()
    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{
        id: 'task-1',
        workflow: {
          nodes: [makeNode('n1')],
          edges: [],
        },
      }],
    })

    useWorkflowStore.getState().setEditingTaskId('task-1')

    expect(useWorkflowStore.getState().editingTaskId).toBe('task-1')
    expect(useWorkflowStore.getState().nodes).toHaveLength(1)
  })
})

// ── stripEdgeRuntime (exported pure function) ─────────────────────────────────

describe('stripEdgeRuntime', () => {
  it('removes extra fields and keeps id, source, target, type, handles', () => {
    const edges = [{
      id: 'e1',
      source: 'n1',
      target: 'n2',
      sourceHandle: 'true',
      targetHandle: null,
      type: 'dashed',
      extraField: 'should be removed',
    }] as unknown as import('@xyflow/react').Edge[]

    const result = stripEdgeRuntime(edges)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('e1')
    expect(result[0].source).toBe('n1')
    expect(result[0].target).toBe('n2')
    expect(result[0].type).toBe('dashed')
    expect((result[0] as Record<string, unknown>).extraField).toBeUndefined()
  })
})

// ── aiFixWorkflow timeout path ────────────────────────────────────────────────

describe('aiFixWorkflow timeout', () => {
  it('rejects with timeout error after 180s', async () => {
    vi.useFakeTimers()
    const api = await getApi()
    // onEvent captures callback but startSession never fires result event
    api.claude.onEvent.mockReturnValue(() => {})
    api.claude.startSession.mockReturnValue(new Promise(() => {})) // never resolves

    useWorkflowStore.setState({
      execution: {
        id: 'exec-timeout',
        taskId: 'task-1',
        status: 'failed',
        currentNodeId: null,
        currentStep: 1,
        totalSteps: 1,
        stepResults: [],
        startedAt: new Date().toISOString(),
        logs: [],
      },
      nodes: [],
      edges: [],
    })

    const fixPromise = useWorkflowStore.getState().aiFixWorkflow()

    // Advance past the 180s timeout
    await vi.advanceTimersByTimeAsync(180_001)

    await fixPromise

    const { aiFixResult, isFixing } = useWorkflowStore.getState()
    expect(isFixing).toBe(false)
    expect(aiFixResult?.summary).toContain('Fix failed')

    vi.useRealTimers()
  })
})

// ── retryNode with completed step result output (line 799) ────────────────────

describe('retryNode — nodeOutputs hydration from completed steps', () => {
  it('populates ctx.nodeOutputs from completed step results before running', async () => {
    const executor = await getWorkflowExecutor()
    let capturedCtx: { nodeOutputs?: Record<string, unknown> } | null = null

    executor.executeSingleNode.mockImplementation(async (node: unknown, ctx: { nodeOutputs?: Record<string, unknown> }) => {
      capturedCtx = ctx
      return { result: 'ok' }
    })

    const exec = makeExecution('task-1', 'running')
    exec.stepResults = [
      {
        nodeId: 'n0',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 50,
        output: { data: 'from-n0' },
      },
    ]

    useWorkflowStore.setState({
      nodes: [makeNode('n1')],
      execution: exec,
      editingTaskId: 'task-1',
    })

    await useWorkflowStore.getState().retryNode('n1')

    // The ctx passed to executeSingleNode should have n0's output hydrated
    expect(capturedCtx?.nodeOutputs?.['n0']).toEqual({ data: 'from-n0' })
  })

  it('calls the onLog callback when executeSingleNode calls it', async () => {
    const executor = await getWorkflowExecutor()

    executor.executeSingleNode.mockImplementation(async (
      _node: unknown,
      _ctx: unknown,
      callbacks: { onLog: (msg: string) => void }
    ) => {
      callbacks.onLog('[INFO] Executing step')
      return { result: 'ok' }
    })

    useWorkflowStore.setState({
      nodes: [makeNode('n1')],
      execution: makeExecution('task-1'),
      editingTaskId: 'task-1',
    })

    await useWorkflowStore.getState().retryNode('n1')

    const logs = useWorkflowStore.getState().execution?.logs ?? []
    expect(logs.some((l) => l.includes('Executing step'))).toBe(true)
  })
})

// ── startExecution debugMode — onDebugPause callback (lines 730-737) ──────────

describe('startExecution — debugMode onDebugPause callback', () => {
  it('pauses execution when executeWorkflow calls onDebugPause with debugMode:true', async () => {
    const taskStore = await getTaskStore()
    const executor = await getWorkflowExecutor()

    let capturedCallbacks: Record<string, (...args: unknown[]) => unknown> | null = null
    let resolveExec!: () => void
    executor.executeWorkflow.mockImplementation(async (
      _nodes: unknown,
      _edges: unknown,
      callbacks: Record<string, (...args: unknown[]) => unknown>
    ) => {
      capturedCallbacks = callbacks
      return new Promise<void>((r) => { resolveExec = r })
    })

    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('NODE_START_01', 'start'), makeNode('n1', 'mcp_tool')],
      edges: [],
      execution: null,
    })

    // Start with debugMode: true — this enables the onDebugPause callback
    useWorkflowStore.getState().startExecution({ debugMode: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(capturedCallbacks).not.toBeNull()
    expect(typeof capturedCallbacks!.onDebugPause).toBe('function')

    // Call onDebugPause — it should set debugPaused=true and status=paused
    const pausePromise = (capturedCallbacks!.onDebugPause as (nodeId: string) => Promise<string>)('n1')

    const state = useWorkflowStore.getState()
    expect(state.debugPaused).toBe(true)
    expect(state.execution?.status).toBe('paused')

    // Resolve by calling debugContinue
    useWorkflowStore.getState().debugContinue()
    const result = await pausePromise
    expect(result).toBe('continue')

    resolveExec()
  })

  it('onDebugPause is undefined when debugMode is false', async () => {
    const taskStore = await getTaskStore()
    const executor = await getWorkflowExecutor()

    let capturedCallbacks: Record<string, (...args: unknown[]) => unknown> | null = null
    let resolveExec!: () => void
    executor.executeWorkflow.mockImplementation(async (
      _nodes: unknown,
      _edges: unknown,
      callbacks: Record<string, (...args: unknown[]) => unknown>
    ) => {
      capturedCallbacks = callbacks
      return new Promise<void>((r) => { resolveExec = r })
    })

    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('NODE_START_01', 'start'), makeNode('n1', 'mcp_tool')],
      edges: [],
      execution: null,
    })

    useWorkflowStore.getState().startExecution({ debugMode: false })
    await Promise.resolve()
    await Promise.resolve()

    expect(capturedCallbacks!.onDebugPause).toBeUndefined()
    resolveExec()
  })
})

// ── retryNode isAborted callback (line 829) ────────────────────────────────────

describe('retryNode — isAborted callback is always false', () => {
  it('passes isAborted: () => false to executeSingleNode', async () => {
    const executor = await getWorkflowExecutor()

    let capturedIsAborted: (() => boolean) | null = null
    executor.executeSingleNode.mockImplementation(async (
      _node: unknown,
      _ctx: unknown,
      callbacks: { isAborted: () => boolean }
    ) => {
      capturedIsAborted = callbacks.isAborted
      return { result: 'ok' }
    })

    useWorkflowStore.setState({
      nodes: [makeNode('n1')],
      execution: makeExecution('task-1'),
      editingTaskId: 'task-1',
    })

    await useWorkflowStore.getState().retryNode('n1')

    expect(capturedIsAborted).not.toBeNull()
    expect(capturedIsAborted!()).toBe(false)
  })
})

// ── startExecution onComplete with editingTaskId (line 686) ───────────────────
// Captures the onComplete callback and verifies addRunResult is called with the
// correct data. The line-686 setTimeout is exercised as a side effect.

describe('startExecution — onComplete callback with editingTaskId', () => {
  it('calls addRunResult and marks execution completed when onComplete fires', async () => {
    const taskStore = await getTaskStore()
    const executor = await getWorkflowExecutor()

    let capturedCallbacks: Record<string, (...args: unknown[]) => unknown> | null = null
    executor.executeWorkflow.mockImplementation(async (
      _nodes: unknown,
      _edges: unknown,
      callbacks: Record<string, (...args: unknown[]) => unknown>
    ) => {
      capturedCallbacks = callbacks
      // Resolve immediately so the promise chain completes
    })

    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('NODE_START_01', 'start'), makeNode('n1', 'mcp_tool'), makeNode('n2', 'end')],
      edges: [],
      execution: null,
    })

    useWorkflowStore.getState().startExecution()
    // Flush microtasks so executeWorkflow starts and captures callbacks
    await Promise.resolve()
    await Promise.resolve()

    expect(capturedCallbacks).not.toBeNull()
    capturedCallbacks!.onComplete()

    expect(useWorkflowStore.getState().execution?.status).toBe('completed')
    expect(mockTaskStoreState.addRunResult).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: expect.stringMatching(/success|partial/) })
    )
  })
})

// ── startExecution — executeWorkflow .catch() handler (lines 743-776) ─────────

describe('startExecution — executeWorkflow throws (catch handler)', () => {
  it('marks execution as failed when executeWorkflow promise rejects', async () => {
    const taskStore = await getTaskStore()
    const executor = await getWorkflowExecutor()

    // Reject after a single microtask so .catch() fires synchronously
    executor.executeWorkflow.mockImplementation(async () => {
      throw new Error('Unexpected crash')
    })

    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('NODE_START_01', 'start'), makeNode('n1', 'mcp_tool'), makeNode('n2', 'end')],
      edges: [],
      execution: null,
    })

    useWorkflowStore.getState().startExecution()

    // Flush all promise microtasks so the async throw propagates into .catch()
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(useWorkflowStore.getState().execution?.status).toBe('failed')
    const logs = useWorkflowStore.getState().execution?.logs ?? []
    expect(logs.some((l) => l.includes('Unexpected crash'))).toBe(true)
    expect(mockTaskStoreState.addRunResult).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        status: 'failed',
        summary: expect.stringContaining('Unexpected crash'),
      })
    )
  })

  it('uses "Unknown execution error" message when rejection value is not an Error', async () => {
    const taskStore = await getTaskStore()
    const executor = await getWorkflowExecutor()

    executor.executeWorkflow.mockImplementation(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string rejection'
    })

    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('NODE_START_01', 'start'), makeNode('n1', 'mcp_tool')],
      edges: [],
      execution: null,
    })

    useWorkflowStore.getState().startExecution()
    for (let i = 0; i < 5; i++) await Promise.resolve()

    const logs = useWorkflowStore.getState().execution?.logs ?? []
    expect(logs.some((l) => l.includes('Unknown execution error'))).toBe(true)
  })

  it('records that addRunResult is called with failed status on catch', async () => {
    const taskStore = await getTaskStore()
    const executor = await getWorkflowExecutor()

    executor.executeWorkflow.mockImplementation(async () => {
      throw new Error('Crash')
    })

    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('NODE_START_01', 'start'), makeNode('n1', 'mcp_tool')],
      edges: [],
      execution: null,
    })

    useWorkflowStore.getState().startExecution()
    // Drain microtasks so the throw propagates through .catch()
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(mockTaskStoreState.addRunResult).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: 'failed', summary: expect.stringContaining('Crash') })
    )
  })
})

// ── startExecution — isAborted callback (lines 724-726) ───────────────────────

describe('startExecution — isAborted callback', () => {
  it('isAborted returns false while running, true after stop', async () => {
    const taskStore = await getTaskStore()
    const executor = await getWorkflowExecutor()

    let capturedCallbacks: Record<string, (...args: unknown[]) => unknown> | null = null
    let resolveExec!: () => void
    executor.executeWorkflow.mockImplementation(async (
      _nodes: unknown,
      _edges: unknown,
      callbacks: Record<string, (...args: unknown[]) => unknown>
    ) => {
      capturedCallbacks = callbacks
      return new Promise<void>((r) => { resolveExec = r })
    })

    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('NODE_START_01', 'start'), makeNode('n1', 'mcp_tool')],
      edges: [],
      execution: null,
    })

    useWorkflowStore.getState().startExecution()
    await Promise.resolve()
    await Promise.resolve()

    expect(capturedCallbacks).not.toBeNull()
    // Running status → isAborted returns false
    expect(capturedCallbacks!.isAborted()).toBe(false)

    // Stop execution → isAborted returns true
    useWorkflowStore.getState().stopExecution()
    expect(capturedCallbacks!.isAborted()).toBe(true)

    resolveExec()
  })

  it('isAborted returns true when execution is null', async () => {
    const taskStore = await getTaskStore()
    const executor = await getWorkflowExecutor()

    let capturedCallbacks: Record<string, (...args: unknown[]) => unknown> | null = null
    let resolveExec!: () => void
    executor.executeWorkflow.mockImplementation(async (
      _nodes: unknown,
      _edges: unknown,
      callbacks: Record<string, (...args: unknown[]) => unknown>
    ) => {
      capturedCallbacks = callbacks
      return new Promise<void>((r) => { resolveExec = r })
    })

    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('NODE_START_01', 'start'), makeNode('n1', 'mcp_tool')],
      edges: [],
      execution: null,
    })

    useWorkflowStore.getState().startExecution()
    await Promise.resolve()
    await Promise.resolve()

    useWorkflowStore.setState({ execution: null })
    expect(capturedCallbacks!.isAborted()).toBe(true)

    resolveExec()
  })
})

// ── startExecution onFail callback (line 774 addRunResult path) ───────────────

describe('startExecution — onFail callback persists failed run result', () => {
  it('marks execution as failed when workflow calls the onFail callback', async () => {
    const taskStore = await getTaskStore()
    const executor = await getWorkflowExecutor()

    // Capture the callbacks object passed to executeWorkflow
    let capturedCallbacks: Record<string, (...args: unknown[]) => unknown> | null = null
    executor.executeWorkflow.mockImplementation(async (
      _nodes: unknown,
      _edges: unknown,
      callbacks: Record<string, (...args: unknown[]) => unknown>
    ) => {
      capturedCallbacks = callbacks
      // Don't call onFail yet — we'll call it manually after the promise resolves
    })

    taskStore.getState.mockReturnValue({
      ...mockTaskStoreState,
      tasks: [{ id: 'task-1', runs: [] }],
      activeExecutions: {},
    })

    useWorkflowStore.setState({
      editingTaskId: 'task-1',
      nodes: [makeNode('NODE_START_01', 'start'), makeNode('n1', 'mcp_tool'), makeNode('n2', 'end')],
      edges: [],
      execution: null,
    })

    useWorkflowStore.getState().startExecution()

    // Wait for executeWorkflow to be called and callbacks captured
    await new Promise((r) => setTimeout(r, 50))

    // Debug: check if executeWorkflow was called at all
    const { executeWorkflow } = await getWorkflowExecutor()
    expect(executeWorkflow).toHaveBeenCalled()
    expect(capturedCallbacks).not.toBeNull()
    expect(typeof capturedCallbacks?.onFail).toBe('function')

    // Now call onFail directly to simulate workflow failure
    capturedCallbacks!.onFail('Tool timed out')

    await new Promise((r) => setTimeout(r, 0))

    // Execution should be marked failed
    expect(useWorkflowStore.getState().execution?.status).toBe('failed')
    // addRunResult should have been called
    expect(mockTaskStoreState.addRunResult).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ status: 'failed', summary: expect.stringContaining('Tool timed out') })
    )
  })
})
