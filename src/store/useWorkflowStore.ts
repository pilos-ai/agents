import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react'
import type { OnNodesChange, OnEdgesChange, OnConnect, Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowExecution, WorkflowExecutionStatus, WorkflowStepResult, WorkflowParameter, AiFixResult, WorkflowChatMessage } from '../types/workflow'
import type { ClaudeEvent } from '../types'
import { useTaskStore } from './useTaskStore'
import { executeWorkflow, executeSingleNode, resolveTemplates } from '../utils/workflow-executor'
import type { ExecutionContext } from '../utils/workflow-executor'
import { useProjectStore } from './useProjectStore'
import { api } from '../api'
import { extractJson, hydrateToolNodes, validateAiPromptNodes, WORKFLOW_RUNTIME_GUIDE, buildChatPrompt, generateWorkflowSummaryLocally } from '../utils/workflow-ai'
import { validateWorkflow } from '../utils/workflow-validation'
import type { ValidationResult } from '../utils/workflow-validation'

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
  showGenerateModal: boolean

  // Execution
  execution: WorkflowExecution | null
  showLogs: boolean

  // Jira project
  jiraProjects: { key: string; name: string }[]
  jiraProjectKey: string | null

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
  setShowGenerateModal: (show: boolean) => void
  saveWorkflow: () => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Execution
  startExecution: (options?: { dryRun?: boolean; debugMode?: boolean }) => void
  stopExecution: () => void
  advanceExecution: (nodeId: string, status: 'completed' | 'failed' | 'skipped') => void
  resetExecution: () => void
  setShowLogs: (show: boolean) => void

  // Debug mode
  debugPaused: boolean
  debugResolve: ((action: 'step' | 'continue') => void) | null
  debugStep: () => void
  debugContinue: () => void

  // AI Fix
  isFixing: boolean
  aiFixResult: AiFixResult | null
  aiFixWorkflow: (targetNodeId?: string) => Promise<void>
  clearAiFix: () => void

  // Validation
  validationResult: ValidationResult | null
  clearValidation: () => void

  // Retry
  retryNode: (nodeId: string) => Promise<void>

  // Clipboard
  clipboard: Node<WorkflowNodeData> | null
  copyNode: (nodeId: string) => void
  pasteNode: () => void
  duplicateNode: (nodeId: string) => void

  // Jira
  loadJiraProjects: () => Promise<void>
  setJiraProjectKey: (key: string | null) => void

  // Results canvas
  resultsCanvasOpen: boolean
  setResultsCanvasOpen: (open: boolean) => void

  // Chat builder
  chatMessages: WorkflowChatMessage[]
  chatMode: boolean
  chatIsGenerating: boolean
  chatSessionId: string | null
  chatStreamingText: string
  chatStartedAt: number | null
  workflowSummary: string[] | null
  toggleChatMode: () => void
  sendChatMessage: (text: string) => Promise<void>
  retryLastMessage: () => void
  abortChat: () => void
  clearChat: () => void
  setSummary: (lines: string[] | null) => void
}

export function stripRuntimeFields(nodes: Node<WorkflowNodeData>[]): Node<WorkflowNodeData>[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data, executionStatus: undefined, executionError: undefined, displayData: undefined },
  })) as Node<WorkflowNodeData>[]
}

export function stripEdgeRuntime(edges: Edge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: e.type,
  }))
}

/** Valid React Flow node types — must match the nodeTypes map in WorkflowCanvas */
const VALID_NODE_TYPES = new Set([
  'start', 'end', 'mcp_tool', 'condition', 'loop', 'delay',
  'parallel', 'merge', 'variable', 'note', 'ai_prompt', 'agent', 'results_display',
])

/** Ensure every node has a valid React Flow `type` AND `data.type` */
export function normalizeNodeTypes(nodes: Array<Record<string, unknown>>): Node<WorkflowNodeData>[] {
  return nodes.map((n) => {
    const data = (n.data || {}) as Record<string, unknown>
    // Try node.type, then data.type, then fallback
    let type = (n.type as string) || (data.type as string) || 'mcp_tool'
    // Validate against known types
    if (!VALID_NODE_TYPES.has(type)) {
      // Second chance: try the other source
      const alt = (data.type as string) || (n.type as string)
      type = alt && VALID_NODE_TYPES.has(alt) ? alt : 'mcp_tool'
    }
    return {
      ...n,
      type,
      data: { ...data, type },
    } as Node<WorkflowNodeData>
  })
}

export function buildAiFixPrompt(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  execution: WorkflowExecution,
  targetNodeId?: string,
  jiraProjectKey?: string,
): string {
  const nodeDescriptions = nodes.map((n) => {
    const params = n.data.parameters
      ? Object.entries(n.data.parameters)
          .filter(([, p]) => p != null)
          .map(([k, p]) => `    ${k}: ${JSON.stringify((p as WorkflowParameter).value)}`)
          .join('\n')
      : '    (none)'
    return `  Node ${n.id} (${n.data.type}) at (${Math.round(n.position.x)},${Math.round(n.position.y)}): "${n.data.label}"\n    Parameters:\n${params}${
      n.data.aiPrompt ? `\n    AI Prompt: ${n.data.aiPrompt}` : ''
    }${n.data.aiModel ? `\n    AI Model: ${n.data.aiModel}` : ''
    }${n.data.conditionExpression ? `\n    Condition: ${n.data.conditionExpression} ${n.data.conditionOperator} ${n.data.conditionValue}` : ''
    }${n.data.loopType ? `\n    Loop Type: ${n.data.loopType}` : ''
    }${n.data.loopCollection ? `\n    Loop Collection: ${n.data.loopCollection}` : ''
    }${n.data.loopCount ? `\n    Loop Count: ${n.data.loopCount}` : ''
    }${n.data.variableName ? `\n    Variable: ${n.data.variableName} (${n.data.variableOperation}) = ${n.data.variableValue}` : ''
    }${n.data.toolId ? `\n    Tool ID: ${n.data.toolId}` : ''
    }${n.data.toolCategory ? `\n    Tool Category: ${n.data.toolCategory}` : ''}`
  }).join('\n\n')

  const edgeDescriptions = edges
    .map((e) => `  ${e.source}${e.sourceHandle ? `[${e.sourceHandle}]` : ''} --> ${e.target}`)
    .join('\n')

  const resultDescriptions = execution.stepResults.map((r) => {
    const nodeLabel = nodes.find((n) => n.id === r.nodeId)?.data.label || r.nodeId
    return `  ${r.nodeId} ("${nodeLabel}"): ${r.status}${r.error ? ` — ERROR: ${r.error}` : ''}${
      r.output ? ` — Output: ${JSON.stringify(r.output).slice(0, 500)}` : ''
    } (${r.duration}ms)`
  }).join('\n')

  const failedSummary = execution.stepResults
    .filter((r) => r.status === 'failed')
    .map((r) => `  - ${r.nodeId}: ${r.error || 'Unknown error'}`)
    .join('\n')

  const scopeNote = targetNodeId
    ? `\nFOCUS: Prioritize fixes around node "${targetNodeId}", but you may modify other nodes if needed.`
    : ''

  return `You are a workflow debugging assistant. Analyze this failed workflow and return a fixed version of the ENTIRE workflow.

CURRENT WORKFLOW:
Nodes:
${nodeDescriptions}

Edges:
${edgeDescriptions}

EXECUTION RESULTS:
${resultDescriptions}

FAILED NODES:
${failedSummary}
${scopeNote}

INTEGRATION CONTEXT (important):
- Jira, Slack, and GitHub are ALREADY connected and authenticated — no credentials, domains, or API tokens needed
- ALWAYS use the available toolIds for integrated services — NEVER use run_script or run_command for operations that have dedicated tools${jiraProjectKey ? `\n- Active Jira project key: "${jiraProjectKey}" — use this in JQL queries (e.g. "project = ${jiraProjectKey} ORDER BY created DESC")` : ''}

INSTRUCTIONS:
- Return the complete fixed workflow as a JSON object with "nodes", "edges", and "summary"
- Preserve all working nodes and their IDs — only modify, add, or remove what's needed to fix failures
- You CAN: change parameter values, change node types, add new nodes, remove broken nodes, rewire edges
- CRITICAL: Every mcp_tool node MUST have "parameters" with actual values filled in — use {{}} template syntax for dynamic data. NEVER leave required parameters empty or with placeholder text
- For jira_search: always provide a valid JQL query (e.g. "project = KEY ORDER BY created DESC"), never leave jql empty
- For jira_delete / jira_transition inside loops: use {{_loopItem.key}} for issueKey
- Fix structural issues: add missing nodes, rewire edges, change loop types or collections
- For nested loops referencing a parent loop's current item, use {{PARENT_LOOP_ID.currentItem}} as the collection
- For template references inside node parameters, use {{NODE_ID.field}} or {{_loopItem.field}} syntax

Node schema rules:
- Valid node types: start, end, mcp_tool, ai_prompt, condition, loop, delay, parallel, merge, variable, note, results_display
- Always include start and end nodes
- Top-to-bottom layout: start y:50, increment y by ~150
- Parallel branches: spread x (100 vs 400), single column: center at x:300
- condition edges: sourceHandle "yes"/"no"
- loop edges: sourceHandle "body"/"done"
- parallel/merge edges: sourceHandle "branch_1"/"branch_2"
- collection loops MUST set loopCollection to reference upstream output, e.g. "{{NODE_ID.arrayField}}"
- Use mcp_tool for direct API operations (Jira, Slack, GitHub) — these run directly, no AI needed
- Use ai_prompt ONLY when reasoning/analysis/summarization is needed. ai_prompt nodes MUST have a non-empty "aiPrompt" with a detailed prompt referencing upstream data via {{NODE_ID.field}}
- Valid toolId values: read_files, create_pr, git_commit, git_diff, transform_json, filter_data, aggregate, jira_search, jira_get_issue, jira_create, jira_delete, jira_transition, jira_get_transitions, slack_message, slack_thread, run_command, run_script, web_search, email_alert, webhook
- mcp_tool parameter format: "parameters": { "paramKey": { "key": "paramKey", "label": "Param Label", "type": "string", "value": "actual value or {{template}}", "required": true } }

${WORKFLOW_RUNTIME_GUIDE}

OUTPUT ONLY THE RAW JSON OBJECT. No markdown code fences. No explanation. Start with { and end with }.

{
  "nodes": [{"id":"NODE_START_01","type":"start","position":{"x":300,"y":50},"data":{"type":"start","label":"Start"}},{"id":"NODE_SEARCH","type":"mcp_tool","position":{"x":300,"y":200},"data":{"type":"mcp_tool","label":"Search Issues","toolId":"jira_search","parameters":{"jql":{"key":"jql","label":"JQL Query","type":"string","value":"project = KEY ORDER BY created DESC","required":true},"maxResults":{"key":"maxResults","label":"Max Results","type":"number","value":"50"}}}}],
  "edges": [{"id":"e1","source":"NODE_START_01","target":"NODE_SEARCH","sourceHandle":null,"type":"dashed"}],
  "summary": "one-line description of what was changed"
}`
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
  showGenerateModal: false,
  execution: null,
  showLogs: false,
  isFixing: false,
  aiFixResult: null,
  validationResult: null,
  clipboard: null,
  debugPaused: false,
  debugResolve: null,
  jiraProjects: [],
  jiraProjectKey: null,

  setEditingTaskId: (id) => {
    if (id) {
      get().loadWorkflow(id)
    } else {
      set({ editingTaskId: null, nodes: [], edges: [], selectedNodeId: null, history: [], historyIndex: -1, execution: null, resultsCanvasOpen: false })
    }
  },

  loadWorkflow: (taskId) => {
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
    const workflow = task?.workflow
    const nodes = workflow?.nodes?.length ? workflow.nodes : [DEFAULT_START_NODE]
    const edges = workflow?.edges || []
    // Auto-open AI chat for empty workflows (only start node)
    const isEmptyWorkflow = nodes.length <= 1

    // Restore execution state if the task is currently running (e.g. from scheduler)
    const activeExec = useTaskStore.getState().activeExecutions[taskId]
    let execution: WorkflowExecution | null = null
    if (activeExec && (activeExec.status === 'running' || activeExec.status === 'completed' || activeExec.status === 'failed')) {
      execution = {
        id: `sched-${taskId}`,
        taskId,
        status: activeExec.status as WorkflowExecutionStatus,
        currentNodeId: null,
        currentStep: activeExec.currentStep,
        totalSteps: activeExec.totalSteps,
        stepResults: activeExec.stepResults || [],
        startedAt: activeExec.startedAt,
        logs: activeExec.logs || [],
      }
    }

    set({
      editingTaskId: taskId,
      nodes,
      edges,
      selectedNodeId: null,
      history: [{ nodes, edges }],
      historyIndex: 0,
      execution,
      resultsCanvasOpen: false,
      chatMode: isEmptyWorkflow,
      chatMessages: [],
      chatStreamingText: '',
      chatStartedAt: null,
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

  copyNode: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (node) set({ clipboard: JSON.parse(JSON.stringify(node)) })
  },

  pasteNode: () => {
    const { clipboard } = get()
    if (!clipboard) return
    get().pushHistory()
    const suffix = `_${String(Date.now()).slice(-4)}`
    const newNode: Node<WorkflowNodeData> = {
      ...clipboard,
      id: `${clipboard.id}${suffix}`,
      position: { x: clipboard.position.x + 40, y: clipboard.position.y + 40 },
      data: { ...clipboard.data, executionStatus: undefined, executionError: undefined },
      selected: false,
    }
    set((s) => ({ nodes: [...s.nodes, newNode], selectedNodeId: newNode.id }))
  },

  duplicateNode: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return
    get().pushHistory()
    const suffix = `_${String(Date.now()).slice(-4)}`
    const newNode: Node<WorkflowNodeData> = {
      ...JSON.parse(JSON.stringify(node)),
      id: `${node.id}${suffix}`,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data, executionStatus: undefined, executionError: undefined },
      selected: false,
    }
    set((s) => ({ nodes: [...s.nodes, newNode], selectedNodeId: newNode.id }))
  },

  clearValidation: () => set({ validationResult: null }),

  setToolSearchQuery: (query) => set({ toolSearchQuery: query }),
  setToolFilterTab: (tab) => set({ toolFilterTab: tab }),
  setShowGenerateModal: (show) => set({ showGenerateModal: show }),

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

  startExecution: (options) => {
    const { nodes, edges, editingTaskId } = get()
    if (!editingTaskId) {
      console.warn('[Workflow] Cannot start execution: no task is being edited')
      return
    }

    // Prevent double execution if already running (e.g. from scheduler)
    const activeExec = useTaskStore.getState().activeExecutions[editingTaskId]
    if (activeExec?.status === 'running') {
      console.warn('[Workflow] Task is already running (scheduler execution in progress)')
      return
    }
    const dryRun = options?.dryRun || false
    const debugMode = options?.debugMode || false

    // Validate before running
    const validation = validateWorkflow(nodes, edges)
    if (!validation.valid) {
      set({ validationResult: validation })
      return
    }
    set({ validationResult: null })

    // Count executable nodes (exclude start, end, note, results_display)
    const executableCount = nodes.filter((n) =>
      n.data.type !== 'start' && n.data.type !== 'end' && n.data.type !== 'note' && n.data.type !== 'results_display'
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
        data: { ...n.data, executionStatus: 'pending' as const, executionError: undefined },
      })),
    }))

    // Sync with task store: create initial TaskRun entry and set task status to running
    const taskStore = useTaskStore.getState()
    const initialRun = {
      id: execution.id,
      taskId: editingTaskId,
      startedAt: execution.startedAt,
      completedAt: null,
      duration: null,
      status: 'success' as const,
      trigger: 'manual' as const,
      actions: [],
      summary: 'Workflow running...',
      logs: [] as string[],
    }
    const currentTasks = taskStore.tasks.map((t) => {
      if (t.id !== editingTaskId) return t
      const runs = [initialRun, ...t.runs].slice(0, 100)
      return { ...t, status: 'running' as const, progress: 0, runs, updatedAt: execution.startedAt }
    })
    useTaskStore.setState({ tasks: currentTasks })
    const projectPath = taskStore.currentProjectPath
    if (projectPath) {
      api.settings.set(`v2_tasks:${projectPath}`, currentTasks)
    }

    const workingDirectory = useProjectStore.getState().activeProjectPath || undefined
    let completedSteps = 0

    // Throttled broadcast — fire at most once per 500ms during execution
    let lastBroadcast = 0
    const BROADCAST_INTERVAL = 500
    const broadcastExecution = (force?: boolean) => {
      const now = Date.now()
      if (!force && now - lastBroadcast < BROADCAST_INTERVAL) return
      lastBroadcast = now
      const exec = get().execution
      if (!exec || !editingTaskId) return
      const nodeLabel = exec.currentNodeId
        ? get().nodes.find((n) => n.id === exec.currentNodeId)?.data.label || null
        : null
      useTaskStore.getState().setActiveExecution(editingTaskId, {
        status: exec.status === 'running' ? 'running' : exec.status === 'completed' ? 'completed' : 'failed',
        currentStep: exec.currentStep,
        totalSteps: exec.totalSteps,
        currentNodeLabel: nodeLabel,
        logs: exec.logs.slice(-5),
        stepResults: exec.stepResults,
        startedAt: exec.startedAt,
      })
    }

    // Batch logs — accumulate in memory, flush on node boundaries
    let pendingLogs: string[] = []
    const flushLogs = () => {
      if (pendingLogs.length === 0) return
      const batch = pendingLogs
      pendingLogs = []
      set((s) => ({
        execution: s.execution ? {
          ...s.execution,
          logs: [...s.execution.logs, ...batch],
        } : null,
      }))
    }

    // Initial broadcast
    broadcastExecution(true)

    // Run the real hybrid executor
    executeWorkflow(nodes, edges, {
      onNodeStart: (nodeId) => {
        set((s) => {
          const nextStep = completedSteps + 1
          // Dynamically grow totalSteps when loop iterations push us past the initial count
          const newTotal = s.execution && nextStep > s.execution.totalSteps
            ? nextStep
            : s.execution?.totalSteps ?? executableCount
          return {
            nodes: s.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: 'running' as const } } : n
            ),
            execution: s.execution ? {
              ...s.execution,
              currentNodeId: nodeId,
              currentStep: nextStep,
              totalSteps: newTotal,
            } : null,
          }
        })
        broadcastExecution()
      },

      onNodeComplete: (nodeId, result) => {
        completedSteps++
        flushLogs()
        set((s) => {
          // Dynamically grow totalSteps when loop iterations push us past the initial count
          const newTotal = s.execution && completedSteps > s.execution.totalSteps
            ? completedSteps
            : s.execution?.totalSteps ?? executableCount
          return {
            nodes: s.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: {
                ...n.data,
                executionStatus: result.status === 'skipped' ? 'skipped' as const : 'completed' as const,
                ...(n.data.type === 'results_display' && result.output != null ? { displayData: result.output } : {}),
              } } : n
            ),
            execution: s.execution ? {
              ...s.execution,
              stepResults: [...s.execution.stepResults, result],
              currentStep: completedSteps,
              totalSteps: newTotal,
            } : null,
          }
        })
        broadcastExecution()
      },

      onNodeFail: (nodeId, result) => {
        flushLogs()
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: 'failed' as const, executionError: result.error } } : n
          ),
          execution: s.execution ? {
            ...s.execution,
            stepResults: [...s.execution.stepResults, result],
          } : null,
        }))
        broadcastExecution()
      },

      onLog: (message) => {
        pendingLogs.push(message)
      },

      onComplete: () => {
        flushLogs()
        set((s) => ({
          execution: s.execution ? {
            ...s.execution,
            status: 'completed' as WorkflowExecutionStatus,
            completedAt: new Date().toISOString(),
          } : null,
          resultsCanvasOpen: true,
        }))
        broadcastExecution(true)
        // Persist step results on the task run
        const exec = get().execution
        if (exec && editingTaskId) {
          const now = new Date().toISOString()
          const duration = exec.startedAt ? Date.now() - new Date(exec.startedAt).getTime() : null
          const hasFailed = exec.stepResults.some((r) => r.status === 'failed')
          useTaskStore.getState().addRunResult(editingTaskId, {
            id: exec.id,
            taskId: editingTaskId,
            startedAt: exec.startedAt,
            completedAt: now,
            duration,
            status: hasFailed ? 'partial' : 'success',
            trigger: 'manual',
            actions: exec.stepResults.map((r) => ({
              type: r.status === 'failed' ? 'error' as const : 'notification_sent' as const,
              description: `${get().nodes.find((n) => n.id === r.nodeId)?.data.label || r.nodeId}: ${r.status}`,
              metadata: { nodeId: r.nodeId, duration: r.duration },
            })),
            summary: `Workflow completed: ${exec.stepResults.filter((r) => r.status === 'completed').length}/${exec.totalSteps} steps succeeded`,
            logs: exec.logs,
            stepResults: exec.stepResults,
          })
          // Clear active execution after brief delay so UI shows completion state
          setTimeout(() => useTaskStore.getState().setActiveExecution(editingTaskId, null), 5_000)
        }
      },

      onFail: (error) => {
        flushLogs()
        set((s) => ({
          execution: s.execution ? {
            ...s.execution,
            status: 'failed' as WorkflowExecutionStatus,
            completedAt: new Date().toISOString(),
            logs: [...(s.execution?.logs || []), `[ERROR] ${error}`],
          } : null,
        }))
        broadcastExecution(true)
        // Persist failed run
        const exec = get().execution
        if (exec && editingTaskId) {
          const now = new Date().toISOString()
          useTaskStore.getState().addRunResult(editingTaskId, {
            id: exec.id,
            taskId: editingTaskId,
            startedAt: exec.startedAt,
            completedAt: now,
            duration: exec.startedAt ? Date.now() - new Date(exec.startedAt).getTime() : null,
            status: 'failed',
            trigger: 'manual',
            actions: [{ type: 'error', description: error }],
            summary: `Workflow failed: ${error}`,
            logs: exec.logs,
            stepResults: exec.stepResults,
          })
          // Clear active execution after brief delay so UI shows failure state
          setTimeout(() => useTaskStore.getState().setActiveExecution(editingTaskId, null), 5_000)
        }
      },

      isAborted: () => {
        const exec = get().execution
        return !exec || (exec.status !== 'running' && exec.status !== 'paused')
      },
      dryRun,
      debugMode,
      onDebugPause: debugMode ? (nodeId: string) => {
        return new Promise<'step' | 'continue'>((resolve) => {
          set({
            debugPaused: true,
            debugResolve: resolve,
            execution: get().execution ? {
              ...get().execution!,
              status: 'paused' as WorkflowExecutionStatus,
              logs: [...(get().execution?.logs || []), `[INFO] Debug: paused after ${get().nodes.find((n) => n.id === nodeId)?.data.label || nodeId}`],
            } : null,
          })
        })
      } : undefined,
    }, workingDirectory, get().jiraProjectKey || undefined)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown execution error'
        console.error('[Workflow] Unhandled execution error:', msg)
        // Flush any pending logs and mark execution as failed
        flushLogs()
        set((s) => ({
          execution: s.execution ? {
            ...s.execution,
            status: 'failed' as WorkflowExecutionStatus,
            completedAt: new Date().toISOString(),
            logs: [...(s.execution?.logs || []), `[ERROR] ${msg}`],
          } : null,
        }))
        broadcastExecution(true)
        // Persist failed run
        const exec = get().execution
        if (exec && editingTaskId) {
          const now = new Date().toISOString()
          useTaskStore.getState().addRunResult(editingTaskId, {
            id: exec.id,
            taskId: editingTaskId,
            startedAt: exec.startedAt,
            completedAt: now,
            duration: exec.startedAt ? Date.now() - new Date(exec.startedAt).getTime() : null,
            status: 'failed',
            trigger: 'manual',
            actions: [{ type: 'error', description: msg }],
            summary: `Workflow failed: ${msg}`,
            logs: exec.logs,
            stepResults: exec.stepResults,
          })
          setTimeout(() => useTaskStore.getState().setActiveExecution(editingTaskId, null), 5_000)
        }
      })
  },

  retryNode: async (nodeId) => {
    const { nodes, execution } = get()
    if (!execution) return
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return

    // Rebuild execution context from previous step results
    const ctx: ExecutionContext = {
      variables: {},
      nodeOutputs: {},
      workingDirectory: useProjectStore.getState().activeProjectPath || undefined,
      aborted: false,
      visitCounts: {},
      createdIssueSummaries: new Set(),
      jiraProjectKey: get().jiraProjectKey || undefined,
    }

    // Populate nodeOutputs from completed step results
    for (const r of execution.stepResults) {
      if (r.status === 'completed' && r.output) {
        ctx.nodeOutputs[r.nodeId] = r.output
      }
    }

    // Mark node as running
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: 'running' as const, executionError: undefined } } : n
      ),
      execution: s.execution ? {
        ...s.execution,
        status: 'running' as WorkflowExecutionStatus,
        currentNodeId: nodeId,
        logs: [...s.execution.logs, `[INFO] Retrying: ${node.data.label}`],
      } : null,
    }))

    try {
      const startTime = Date.now()
      const callbacks: import('../utils/workflow-executor').ExecutionCallbacks = {
        onNodeStart: () => {},
        onNodeComplete: () => {},
        onNodeFail: () => {},
        onLog: (msg) => {
          set((s) => ({
            execution: s.execution ? { ...s.execution, logs: [...s.execution.logs, msg] } : null,
          }))
        },
        onComplete: () => {},
        onFail: () => {},
        isAborted: () => false,
      }

      const output = await executeSingleNode(node, ctx, callbacks)
      const result: WorkflowStepResult = {
        nodeId,
        status: 'completed',
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        output,
        duration: Date.now() - startTime,
      }

      // Remove the old failed result and add the new one
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: 'completed' as const, executionError: undefined } } : n
        ),
        execution: s.execution ? {
          ...s.execution,
          status: 'completed' as WorkflowExecutionStatus,
          currentNodeId: null,
          stepResults: [
            ...s.execution.stepResults.filter((r) => r.nodeId !== nodeId),
            result,
          ],
          logs: [...s.execution.logs, `[INFO] Retry succeeded: ${node.data.label}`],
        } : null,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: 'failed' as const, executionError: errorMsg } } : n
        ),
        execution: s.execution ? {
          ...s.execution,
          status: 'completed' as WorkflowExecutionStatus,
          currentNodeId: null,
          logs: [...s.execution.logs, `[ERROR] Retry failed: ${node.data.label} — ${errorMsg}`],
        } : null,
      }))
    }
  },

  stopExecution: () => {
    const { debugResolve } = get()
    // If paused in debug mode, resolve the promise so the executor unblocks and sees the abort
    if (debugResolve) {
      debugResolve('continue')
    }
    set((s) => ({
      execution: s.execution ? { ...s.execution, status: 'failed' as WorkflowExecutionStatus, logs: [...s.execution.logs, `[${new Date().toLocaleTimeString()}] [WARN] Execution stopped by user.`] } : null,
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, executionStatus: n.data.executionStatus === 'running' ? 'failed' : n.data.executionStatus },
      })),
      debugPaused: false,
      debugResolve: null,
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
      resultsCanvasOpen: false,
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, executionStatus: undefined },
      })),
    }))
  },

  setShowLogs: (show) => set({ showLogs: show }),

  debugStep: () => {
    const { debugResolve } = get()
    if (debugResolve) {
      set((s) => ({
        debugPaused: false,
        debugResolve: null,
        execution: s.execution ? { ...s.execution, status: 'running' as WorkflowExecutionStatus } : null,
      }))
      debugResolve('step')
    }
  },

  debugContinue: () => {
    const { debugResolve } = get()
    if (debugResolve) {
      set((s) => ({
        debugPaused: false,
        debugResolve: null,
        execution: s.execution ? { ...s.execution, status: 'running' as WorkflowExecutionStatus } : null,
      }))
      debugResolve('continue')
    }
  },

  clearAiFix: () => set({ aiFixResult: null }),

  aiFixWorkflow: async (targetNodeId?: string) => {
    const { nodes, edges, execution, jiraProjectKey } = get()
    if (!execution) return

    set({ isFixing: true, aiFixResult: null })

    try {
      const workingDirectory = useProjectStore.getState().activeProjectPath || undefined
      const prompt = buildAiFixPrompt(nodes, edges, execution, targetNodeId, jiraProjectKey || undefined)
      const sessionId = `wf-aifix-${Date.now()}`

      const result = await new Promise<AiFixResult>((resolve, reject) => {
        let resultText = ''

        const unsub = api.claude.onEvent((event: ClaudeEvent) => {
          if (event.sessionId !== sessionId) return

          if (event.type === 'content_block_delta') {
            const delta = event.delta as { type: string; text?: string }
            if (delta?.type === 'text_delta' && delta.text) {
              resultText += delta.text
            }
          }

          if (event.type === 'result') {
            unsub()

            let finalText = resultText
            const rawResult = event.result
            if (typeof rawResult === 'string') {
              finalText = rawResult
            } else if (rawResult && typeof rawResult === 'object') {
              const resultObj = rawResult as { content?: Array<{ type: string; text?: string }> }
              if (resultObj.content) {
                const extracted = resultObj.content
                  .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                  .map((b) => b.text)
                  .join('')
                if (extracted) finalText = extracted
              }
            }

            try {
              const cleaned = extractJson(finalText)
              const parsed = JSON.parse(cleaned) as {
                nodes?: Node<WorkflowNodeData>[]
                edges?: Edge[]
                summary?: string
              }

              if (parsed.nodes && Array.isArray(parsed.nodes)) {
                // Full workflow replacement
                resolve({
                  suggestions: [],
                  nodes: parsed.nodes,
                  edges: parsed.edges || [],
                  summary: String(parsed.summary || 'Workflow restructured'),
                })
              } else {
                resolve({
                  suggestions: [],
                  summary: String(parsed.summary || finalText.slice(0, 500)),
                })
              }
            } catch {
              resolve({
                suggestions: [],
                summary: finalText.slice(0, 500),
              })
            }
          }
        })

        api.claude.startSession(sessionId, {
          prompt,
          resume: false,
          workingDirectory,
          model: 'sonnet',
          permissionMode: 'bypass',
        }).catch((err) => {
          unsub()
          reject(new Error(`AI Fix session failed: ${err instanceof Error ? err.message : 'Unknown'}`))
        })

        setTimeout(() => {
          unsub()
          reject(new Error('AI Fix timed out (180s)'))
        }, 180_000)
      })

      // Apply: replace entire workflow with the fixed version
      if (result.nodes && result.nodes.length > 0) {
        get().pushHistory()
        const typedNodes = normalizeNodeTypes(result.nodes as unknown as Array<Record<string, unknown>>)
        const hydratedNodes = hydrateToolNodes(typedNodes)
        const validatedNodes = validateAiPromptNodes(hydratedNodes, result.edges || [])
        set({
          nodes: validatedNodes,
          edges: (result.edges || []).map((e) => ({
            ...e,
            type: e.type || 'dashed',
          })),
          selectedNodeId: null,
        })
        result.appliedAt = new Date().toISOString()
      }

      set({ isFixing: false, aiFixResult: result })
    } catch (err) {
      set({
        isFixing: false,
        aiFixResult: {
          suggestions: [],
          summary: `Fix failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      })
    }
  },

  loadJiraProjects: async () => {
    try {
      const workingDirectory = useProjectStore.getState().activeProjectPath
      if (!workingDirectory || !api.jira) return

      // Check saved board config first
      const boardConfig = await api.jira.getBoardConfig(workingDirectory)
      if (boardConfig?.projectKey && !get().jiraProjectKey) {
        set({ jiraProjectKey: boardConfig.projectKey })
      }

      // Load all available projects
      await api.jira.setActiveProject(workingDirectory)
      const projects = await api.jira.getProjects()
      if (projects && projects.length > 0) {
        const mapped = projects.map((p: { key: string; name: string }) => ({ key: p.key, name: p.name }))
        set((s) => ({
          jiraProjects: mapped,
          // Auto-select first project if none selected
          jiraProjectKey: s.jiraProjectKey || boardConfig?.projectKey || mapped[0].key,
        }))
      }
    } catch {
      // Jira not connected — silently ignore
    }
  },

  setJiraProjectKey: (key) => set({ jiraProjectKey: key }),

  // ── Results Canvas ──
  resultsCanvasOpen: false,
  setResultsCanvasOpen: (open) => set({ resultsCanvasOpen: open }),

  // ── Chat Builder ──
  chatMessages: [],
  chatMode: false,
  chatIsGenerating: false,
  chatSessionId: null,
  chatStreamingText: '',
  chatStartedAt: null,
  workflowSummary: null,

  toggleChatMode: () => set((s) => ({ chatMode: !s.chatMode })),
  clearChat: () => set({ chatMessages: [], chatStreamingText: '', workflowSummary: null }),
  setSummary: (lines) => set({ workflowSummary: lines }),

  abortChat: () => {
    const sid = get().chatSessionId
    if (sid) {
      api.claude.abort(sid).catch(() => {})
    }
    set({ chatIsGenerating: false, chatSessionId: null, chatStreamingText: '', chatStartedAt: null })
  },

  retryLastMessage: () => {
    const { chatMessages } = get()
    // Find the last user message
    const lastUserMsg = [...chatMessages].reverse().find((m) => m.role === 'user')
    if (!lastUserMsg) return
    // Remove trailing error messages
    const cleaned = chatMessages.filter((m) => !(m.role === 'assistant' && m.content.startsWith('__ERROR__:')))
    set({ chatMessages: cleaned })
    get().sendChatMessage(lastUserMsg.content)
  },

  sendChatMessage: async (text: string) => {
    const { nodes, edges, chatMessages } = get()

    // Add user message
    const userMsg: WorkflowChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    set({ chatMessages: [...chatMessages, userMsg], chatIsGenerating: true, chatStreamingText: '', chatStartedAt: Date.now() })

    const sessionId = `wf-chat-${Date.now()}`
    set({ chatSessionId: sessionId })

    try {
      const prompt = buildChatPrompt([...chatMessages, userMsg], nodes, edges, text, get().jiraProjectKey || undefined)
      const workingDirectory = useProjectStore.getState().activeProjectPath || undefined

      const aiResponse = await new Promise<{ action: string; nodes?: Node<WorkflowNodeData>[]; edges?: Edge[]; message: string; summary?: string }>((resolve, reject) => {
        let resultText = ''

        const unsub = api.claude.onEvent((event: ClaudeEvent) => {
          if (event.sessionId !== sessionId) return

          if (event.type === 'content_block_delta') {
            const delta = event.delta as { type: string; text?: string }
            if (delta?.type === 'text_delta' && delta.text) {
              resultText += delta.text
              set({ chatStreamingText: resultText })
            }
          }

          if (event.type === 'result') {
            unsub()
            let finalText = resultText
            const rawResult = event.result
            if (typeof rawResult === 'string') {
              finalText = rawResult
            } else if (rawResult && typeof rawResult === 'object') {
              const resultObj = rawResult as { content?: Array<{ type: string; text?: string }> }
              if (resultObj.content) {
                const extracted = resultObj.content
                  .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                  .map((b) => b.text)
                  .join('')
                if (extracted) finalText = extracted
              }
            }

            try {
              const cleaned = extractJson(finalText)
              const parsed = JSON.parse(cleaned)
              resolve({
                action: parsed.action || 'explain',
                nodes: parsed.nodes,
                edges: parsed.edges,
                message: parsed.message || 'Done.',
                summary: parsed.summary,
              })
            } catch (parseErr) {
              console.warn('[AI Builder] Failed to parse response as JSON:', parseErr, '\nRaw text:', finalText.slice(0, 500))
              reject(new Error('Failed to generate workflow. The AI response was not valid JSON. Please try rephrasing your request.'))
            }
          }
        })

        api.claude.startSession(sessionId, {
          prompt,
          resume: false,
          workingDirectory,
          model: 'sonnet',
          permissionMode: 'plan',
        }).catch((err) => {
          unsub()
          reject(new Error(`Chat session failed: ${err instanceof Error ? err.message : 'Unknown'}`))
        })

        // Timeout — 5 minutes for complex workflows
        setTimeout(() => {
          unsub()
          reject(new Error('Generation took too long. Try a simpler description or break it into steps.'))
        }, 300_000)
      })

      // Apply workflow changes if action is "replace"
      let changeSummary: string | undefined
      if (aiResponse.action === 'replace' && aiResponse.nodes && Array.isArray(aiResponse.nodes)) {
        get().pushHistory()
        const typedNodes = normalizeNodeTypes(aiResponse.nodes as unknown as Array<Record<string, unknown>>)
        const hydratedNodes = hydrateToolNodes(typedNodes)
        const validatedNodes = validateAiPromptNodes(hydratedNodes, aiResponse.edges || [])
        set({
          nodes: validatedNodes,
          edges: (aiResponse.edges || []).map((e) => ({
            ...e,
            type: e.type || 'dashed',
          })),
          selectedNodeId: null,
        })
        changeSummary = aiResponse.summary || `Updated workflow`

        // Auto-generate summary
        const summaryLines = generateWorkflowSummaryLocally(
          get().nodes as Node<WorkflowNodeData>[],
          get().edges,
        )
        set({ workflowSummary: summaryLines })
      }

      // Add assistant message
      const assistantMsg: WorkflowChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: aiResponse.message,
        timestamp: Date.now(),
        changeSummary,
      }
      set((s) => ({
        chatMessages: [...s.chatMessages, assistantMsg],
        chatIsGenerating: false,
        chatSessionId: null,
        chatStreamingText: '',
        chatStartedAt: null,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      const errorAssistantMsg: WorkflowChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `__ERROR__:${errorMsg}`,
        timestamp: Date.now(),
      }
      set((s) => ({
        chatMessages: [...s.chatMessages, errorAssistantMsg],
        chatIsGenerating: false,
        chatSessionId: null,
        chatStreamingText: '',
        chatStartedAt: null,
      }))
    }
  },
}))
