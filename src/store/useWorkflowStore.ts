import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react'
import type { OnNodesChange, OnEdgesChange, OnConnect, Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowExecution, WorkflowExecutionStatus, WorkflowStepResult } from '../types/workflow'
import { useTaskStore } from './useTaskStore'
import { executeWorkflow } from '../utils/workflow-executor'
import { useProjectStore } from './useProjectStore'

interface HistoryEntry {
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
}

const MAX_HISTORY = 50

const DEFAULT_START_NODE: Node<WorkflowNodeData> = {
  id: 'NODE_START_01',
  type: 'start',
  position: { x: 300, y: 80 },
  data: { type: 'start', label: 'Start Workflow' },
}

interface WorkflowStore {
  editingTaskId: string | null
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
  selectedNodeId: string | null

  // Undo/redo
  history: HistoryEntry[]
  historyIndex: number

  // Tool panel
  toolSearchQuery: string
  toolFilterTab: string

  // Execution
  execution: WorkflowExecution | null
  showLogs: boolean

  // Actions
  setEditingTaskId: (id: string | null) => void
  loadWorkflow: (taskId: string) => void
  onNodesChange: OnNodesChange<Node<WorkflowNodeData>>
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  selectNode: (id: string | null) => void
  addNode: (node: Node<WorkflowNodeData>) => void
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void
  removeNode: (nodeId: string) => void
  setToolSearchQuery: (query: string) => void
  setToolFilterTab: (tab: string) => void
  saveWorkflow: () => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Execution
  startExecution: () => void
  stopExecution: () => void
  advanceExecution: (nodeId: string, status: 'completed' | 'failed' | 'skipped') => void
  resetExecution: () => void
  setShowLogs: (show: boolean) => void
}

function stripRuntimeFields(nodes: Node<WorkflowNodeData>[]): Node<WorkflowNodeData>[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data, executionStatus: undefined },
  })) as Node<WorkflowNodeData>[]
}

function stripEdgeRuntime(edges: Edge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: e.type,
  }))
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  editingTaskId: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  history: [],
  historyIndex: -1,
  toolSearchQuery: '',
  toolFilterTab: 'all',
  execution: null,
  showLogs: false,

  setEditingTaskId: (id) => {
    if (id) {
      get().loadWorkflow(id)
    } else {
      set({ editingTaskId: null, nodes: [], edges: [], selectedNodeId: null, history: [], historyIndex: -1, execution: null })
    }
  },

  loadWorkflow: (taskId) => {
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    const workflow = task?.workflow
    const nodes = workflow?.nodes?.length ? workflow.nodes : [DEFAULT_START_NODE]
    const edges = workflow?.edges || []
    set({
      editingTaskId: taskId,
      nodes,
      edges,
      selectedNodeId: null,
      history: [{ nodes, edges }],
      historyIndex: 0,
      execution: null,
    })
  },

  onNodesChange: (changes) => {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }))
  },

  onEdgesChange: (changes) => {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }))
  },

  onConnect: (connection) => {
    get().pushHistory()
    set((s) => ({
      edges: addEdge({ ...connection, type: 'dashed' }, s.edges),
    }))
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  addNode: (node) => {
    get().pushHistory()
    set((s) => ({ nodes: [...s.nodes, node] }))
  },

  updateNodeData: (nodeId, data) => {
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
    }))
  },

  removeNode: (nodeId) => {
    if (nodeId === 'NODE_START_01') return // Don't delete start
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
    }))
  },

  setToolSearchQuery: (query) => set({ toolSearchQuery: query }),
  setToolFilterTab: (tab) => set({ toolFilterTab: tab }),

  saveWorkflow: () => {
    const { editingTaskId, nodes, edges } = get()
    if (!editingTaskId) return
    useTaskStore.getState().updateTask(editingTaskId, {
      workflow: {
        nodes: stripRuntimeFields(nodes),
        edges: stripEdgeRuntime(edges),
      },
    })
  },

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get()
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) })
    if (newHistory.length > MAX_HISTORY) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { historyIndex, history } = get()
    if (historyIndex <= 0) return
    const prev = history[historyIndex - 1]
    set({ nodes: prev.nodes, edges: prev.edges, historyIndex: historyIndex - 1 })
  },

  redo: () => {
    const { historyIndex, history } = get()
    if (historyIndex >= history.length - 1) return
    const next = history[historyIndex + 1]
    set({ nodes: next.nodes, edges: next.edges, historyIndex: historyIndex + 1 })
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  startExecution: () => {
    const { nodes, edges, editingTaskId } = get()
    if (!editingTaskId) return

    // Count executable nodes (exclude start, end, note)
    const executableCount = nodes.filter((n) =>
      n.data.type !== 'start' && n.data.type !== 'end' && n.data.type !== 'note'
    ).length

    const execution: WorkflowExecution = {
      id: crypto.randomUUID(),
      taskId: editingTaskId,
      status: 'running',
      currentNodeId: null,
      currentStep: 0,
      totalSteps: executableCount,
      stepResults: [],
      startedAt: new Date().toISOString(),
      logs: [],
    }

    // Mark all nodes as pending
    set((s) => ({
      execution,
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, executionStatus: 'pending' as const },
      })),
    }))

    const workingDirectory = useProjectStore.getState().activeProjectPath || undefined
    let completedSteps = 0

    // Run the real hybrid executor
    executeWorkflow(nodes, edges, {
      onNodeStart: (nodeId) => {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: 'running' as const } } : n
          ),
          execution: s.execution ? {
            ...s.execution,
            currentNodeId: nodeId,
            currentStep: completedSteps + 1,
          } : null,
        }))
      },

      onNodeComplete: (nodeId, result) => {
        completedSteps++
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: result.status === 'skipped' ? 'skipped' as const : 'completed' as const } } : n
          ),
          execution: s.execution ? {
            ...s.execution,
            stepResults: [...s.execution.stepResults, result],
            currentStep: completedSteps,
          } : null,
        }))
      },

      onNodeFail: (nodeId, result) => {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: 'failed' as const } } : n
          ),
          execution: s.execution ? {
            ...s.execution,
            stepResults: [...s.execution.stepResults, result],
          } : null,
        }))
      },

      onLog: (message) => {
        set((s) => ({
          execution: s.execution ? {
            ...s.execution,
            logs: [...s.execution.logs, message],
          } : null,
        }))
      },

      onComplete: () => {
        set((s) => ({
          execution: s.execution ? {
            ...s.execution,
            status: 'completed' as WorkflowExecutionStatus,
            completedAt: new Date().toISOString(),
          } : null,
        }))
      },

      onFail: (error) => {
        set((s) => ({
          execution: s.execution ? {
            ...s.execution,
            status: 'failed' as WorkflowExecutionStatus,
            completedAt: new Date().toISOString(),
            logs: [...(s.execution?.logs || []), `[ERROR] ${error}`],
          } : null,
        }))
      },

      isAborted: () => {
        const exec = get().execution
        return !exec || exec.status !== 'running'
      },
    }, workingDirectory)
  },

  stopExecution: () => {
    set((s) => ({
      execution: s.execution ? { ...s.execution, status: 'failed' as WorkflowExecutionStatus, logs: [...s.execution.logs, `[${new Date().toLocaleTimeString()}] [WARN] Execution stopped by user.`] } : null,
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, executionStatus: n.data.executionStatus === 'running' ? 'failed' : n.data.executionStatus },
      })),
    }))
  },

  advanceExecution: (nodeId, status) => {
    set((s) => ({
      nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: status } } : n),
    }))
  },

  resetExecution: () => {
    set((s) => ({
      execution: null,
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, executionStatus: undefined },
      })),
    }))
  },

  setShowLogs: (show) => set({ showLogs: show }),
}))
