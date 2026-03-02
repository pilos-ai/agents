import { create } from 'zustand'
import { api } from '../api'
import { executeWorkflow } from '../utils/workflow-executor'
import type { WorkflowDefinition, WorkflowStepResult } from '../types/workflow'

// ── Schedule Types ──

export type ScheduleInterval = 'manual' | '15min' | '30min' | '1h' | '2h' | '4h' | '8h' | '12h' | '1d' | '1w'

export interface TaskSchedule {
  interval: ScheduleInterval
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
}

// ── Integration Types ──

export type IntegrationType = 'jira' | 'slack'

export interface JiraIntegrationConfig {
  type: 'jira'
  projectKey: string
  projectName: string
  boardId: number | null
  boardName: string | null
  autoCreateTickets: boolean
  autoAssign: boolean
}

export interface SlackIntegrationConfig {
  type: 'slack'
  channelId: string
  channelName: string
}

export type IntegrationConfig = JiraIntegrationConfig | SlackIntegrationConfig

export interface TaskIntegration {
  id: string
  config: IntegrationConfig
  connectedAt: string
}

// ── Run Result Types ──

export type RunStatus = 'success' | 'partial' | 'failed'

export interface RunAction {
  type: 'ticket_created' | 'ticket_assigned' | 'comment_analyzed' | 'notification_sent' | 'error'
  description: string
  metadata?: Record<string, unknown>
}

export interface TaskRun {
  id: string
  taskId: string
  startedAt: string
  completedAt: string | null
  duration: number | null
  status: RunStatus
  trigger: 'manual' | 'scheduled'
  actions: RunAction[]
  summary: string
  logs: string[]
  stepResults?: WorkflowStepResult[]
}

// ── Active Execution (runtime only, not persisted) ──

export interface ActiveExecution {
  status: 'running' | 'completed' | 'failed'
  currentStep: number
  totalSteps: number
  currentNodeLabel: string | null
  logs: string[]
  stepResults: WorkflowStepResult[]
  startedAt: string
}

// ── Task Types ──

export type TaskTemplate = 'client_review' | 'sprint_sync' | 'standup_report' | 'custom'
export type TaskStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'paused'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

export interface Task {
  id: string
  title: string
  description: string
  template: TaskTemplate
  status: TaskStatus
  priority: TaskPriority
  agentId: string | null
  agentName: string | null
  progress: number
  integrations: TaskIntegration[]
  schedule: TaskSchedule
  runs: TaskRun[]
  workflow?: WorkflowDefinition
  createdAt: string
  updatedAt: string
}

const MAX_RUNS_PER_TASK = 100

const INTERVAL_MS: Record<ScheduleInterval, number> = {
  manual: 0,
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
}

export function computeNextRunAt(lastRunAt: string, interval: ScheduleInterval): string | null {
  if (interval === 'manual') return null
  const ms = INTERVAL_MS[interval]
  return new Date(new Date(lastRunAt).getTime() + ms).toISOString()
}

// ── Store ──

interface TaskStore {
  tasks: Task[]
  filter: {
    status: TaskStatus | 'all'
    priority: TaskPriority | 'all'
    search: string
  }
  selectedTaskId: string | null
  showCreateModal: boolean
  activeExecutions: Record<string, ActiveExecution>

  setActiveExecution: (taskId: string, data: ActiveExecution | null) => void
  loadTasks: () => Promise<void>
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'runs'>) => Promise<void>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>
  removeTask: (id: string) => Promise<void>
  setFilter: (filter: Partial<TaskStore['filter']>) => void

  selectTask: (id: string | null) => void
  setShowCreateModal: (show: boolean) => void

  addIntegration: (taskId: string, config: IntegrationConfig) => Promise<void>
  removeIntegration: (taskId: string, integrationId: string) => Promise<void>

  updateSchedule: (taskId: string, schedule: Partial<TaskSchedule>) => Promise<void>
  toggleSchedule: (taskId: string) => Promise<void>

  triggerRun: (taskId: string, trigger: 'manual' | 'scheduled') => Promise<void>
  addRunResult: (taskId: string, run: TaskRun) => Promise<void>
  runTaskWorkflow: (taskId: string, trigger?: 'manual' | 'scheduled') => Promise<void>
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  filter: {
    status: 'all',
    priority: 'all',
    search: '',
  },
  selectedTaskId: null,
  showCreateModal: false,
  activeExecutions: {},

  setActiveExecution: (taskId, data) => {
    set((s) => {
      const next = { ...s.activeExecutions }
      if (data) {
        next[taskId] = data
      } else {
        delete next[taskId]
      }
      return { activeExecutions: next }
    })
  },

  loadTasks: async () => {
    try {
      const stored = await api.settings.get('v2_tasks')
      if (Array.isArray(stored)) {
        // Migrate old tasks to new shape
        const tasks = (stored as Record<string, unknown>[]).map((t) => ({
          ...t,
          template: (t.template as string) || 'custom',
          integrations: (t.integrations as unknown[]) || [],
          schedule: (t.schedule as TaskSchedule) || { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
          runs: (t.runs as unknown[]) || [],
          status: t.status === 'queued' && !(t.runs as unknown[] | undefined)?.length ? 'idle' : t.status,
        })) as Task[]
        set({ tasks })
      }
    } catch {
      // No tasks stored yet
    }
  },

  addTask: async (taskData) => {
    const task: Task = {
      ...taskData,
      id: crypto.randomUUID(),
      runs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const tasks = [...get().tasks, task]
    set({ tasks })
    await api.settings.set('v2_tasks', tasks)
  },

  updateTask: async (id, updates) => {
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    )
    set({ tasks })
    await api.settings.set('v2_tasks', tasks)
  },

  removeTask: async (id) => {
    const tasks = get().tasks.filter((t) => t.id !== id)
    set({ tasks })
    await api.settings.set('v2_tasks', tasks)
    if (get().selectedTaskId === id) {
      set({ selectedTaskId: null })
    }
  },

  setFilter: (filter) => {
    set((s) => ({ filter: { ...s.filter, ...filter } }))
  },

  selectTask: (id) => {
    set({ selectedTaskId: id })
  },

  setShowCreateModal: (show) => {
    set({ showCreateModal: show })
  },

  addIntegration: async (taskId, config) => {
    const integration: TaskIntegration = {
      id: crypto.randomUUID(),
      config,
      connectedAt: new Date().toISOString(),
    }
    const tasks = get().tasks.map((t) =>
      t.id === taskId ? { ...t, integrations: [...t.integrations, integration], updatedAt: new Date().toISOString() } : t
    )
    set({ tasks })
    await api.settings.set('v2_tasks', tasks)
  },

  removeIntegration: async (taskId, integrationId) => {
    const tasks = get().tasks.map((t) =>
      t.id === taskId
        ? { ...t, integrations: t.integrations.filter((i) => i.id !== integrationId), updatedAt: new Date().toISOString() }
        : t
    )
    set({ tasks })
    await api.settings.set('v2_tasks', tasks)
  },

  updateSchedule: async (taskId, schedule) => {
    const tasks = get().tasks.map((t) => {
      if (t.id !== taskId) return t
      const merged = { ...t.schedule, ...schedule }
      // Recompute nextRunAt when interval changes
      if (schedule.interval) {
        if (schedule.interval === 'manual') {
          merged.nextRunAt = null
        } else if (merged.enabled) {
          merged.nextRunAt = computeNextRunAt(
            merged.lastRunAt || new Date().toISOString(),
            merged.interval,
          )
        }
      }
      return { ...t, schedule: merged, updatedAt: new Date().toISOString() }
    })
    set({ tasks })
    await api.settings.set('v2_tasks', tasks)
  },

  toggleSchedule: async (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId)
    if (!task) return
    const enabled = !task.schedule.enabled
    const nextRunAt = enabled && task.schedule.interval !== 'manual'
      ? computeNextRunAt(task.schedule.lastRunAt || new Date().toISOString(), task.schedule.interval)
      : null
    const tasks = get().tasks.map((t) =>
      t.id === taskId
        ? { ...t, schedule: { ...t.schedule, enabled, nextRunAt }, updatedAt: new Date().toISOString() }
        : t
    )
    set({ tasks })
    await api.settings.set('v2_tasks', tasks)
  },

  triggerRun: async (taskId, trigger) => {
    const now = new Date().toISOString()
    const run: TaskRun = {
      id: crypto.randomUUID(),
      taskId,
      startedAt: now,
      completedAt: null,
      duration: null,
      status: 'success',
      trigger,
      actions: [],
      summary: 'Run started...',
      logs: [`[${now}] Run triggered (${trigger})`],
    }
    const tasks = get().tasks.map((t) => {
      if (t.id !== taskId) return t
      const runs = [run, ...t.runs].slice(0, MAX_RUNS_PER_TASK)
      return { ...t, status: 'running' as TaskStatus, progress: 0, runs, updatedAt: now }
    })
    set({ tasks })
    await api.settings.set('v2_tasks', tasks)
  },

  addRunResult: async (taskId, run) => {
    const tasks = get().tasks.map((t) => {
      if (t.id !== taskId) return t
      const runs = t.runs.map((r) => (r.id === run.id ? run : r))
      const lastRunAt = run.completedAt || run.startedAt
      const nextRunAt = t.schedule.enabled && t.schedule.interval !== 'manual'
        ? computeNextRunAt(lastRunAt, t.schedule.interval)
        : null
      return {
        ...t,
        status: (run.status === 'failed' ? 'failed' : 'completed') as TaskStatus,
        progress: 100,
        runs,
        schedule: { ...t.schedule, lastRunAt, nextRunAt },
        updatedAt: new Date().toISOString(),
      }
    })
    set({ tasks })
    await api.settings.set('v2_tasks', tasks)
  },

  runTaskWorkflow: async (taskId, trigger = 'manual') => {
    const task = get().tasks.find((t) => t.id === taskId)
    if (!task?.workflow?.nodes?.length) return

    const nodes = task.workflow.nodes
    const edges = task.workflow.edges || []
    const runId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    // Count executable nodes (dynamic — grows as loop iterations happen)
    let totalSteps = nodes.filter((n) =>
      n.data.type !== 'start' && n.data.type !== 'end' && n.data.type !== 'note'
    ).length

    // Mark task as running + create a run entry
    const run: TaskRun = {
      id: runId,
      taskId,
      startedAt,
      completedAt: null,
      duration: null,
      status: 'success',
      trigger,
      actions: [],
      summary: 'Workflow running...',
      logs: [],
    }
    await get().updateTask(taskId, { status: 'running', progress: 0 })
    const allTasks = get().tasks.map((t) => {
      if (t.id !== taskId) return t
      return { ...t, runs: [run, ...t.runs].slice(0, MAX_RUNS_PER_TASK) }
    })
    set({ tasks: allTasks })
    await api.settings.set('v2_tasks', allTasks)

    // Set initial active execution
    get().setActiveExecution(taskId, {
      status: 'running',
      currentStep: 0,
      totalSteps,
      currentNodeLabel: null,
      logs: [],
      stepResults: [],
      startedAt,
    })

    let completedSteps = 0
    const allStepResults: WorkflowStepResult[] = []
    const allLogs: string[] = []

    // Get working directory and jira project key
    const { useProjectStore } = await import('./useProjectStore')
    const { useWorkflowStore } = await import('./useWorkflowStore')
    const workingDirectory = useProjectStore.getState().activeProjectPath || undefined
    const jiraProjectKey = useWorkflowStore.getState().jiraProjectKey || undefined

    await executeWorkflow(nodes, edges, {
      onNodeStart: (nodeId) => {
        const nextStep = completedSteps + 1
        // Dynamically grow totalSteps when loop iterations push past initial count
        if (nextStep > totalSteps) totalSteps = nextStep
        const label = nodes.find((n) => n.id === nodeId)?.data.label || null
        get().setActiveExecution(taskId, {
          status: 'running',
          currentStep: nextStep,
          totalSteps,
          currentNodeLabel: label,
          logs: allLogs.slice(-5),
          stepResults: allStepResults,
          startedAt,
        })
      },

      onNodeComplete: (_nodeId, result) => {
        completedSteps++
        // Dynamically grow totalSteps when loop iterations push past initial count
        if (completedSteps > totalSteps) totalSteps = completedSteps
        allStepResults.push(result)
        get().setActiveExecution(taskId, {
          status: 'running',
          currentStep: completedSteps,
          totalSteps,
          currentNodeLabel: null,
          logs: allLogs.slice(-5),
          stepResults: [...allStepResults],
          startedAt,
        })
      },

      onNodeFail: (_nodeId, result) => {
        allStepResults.push(result)
        get().setActiveExecution(taskId, {
          status: 'running',
          currentStep: completedSteps,
          totalSteps,
          currentNodeLabel: null,
          logs: allLogs.slice(-5),
          stepResults: [...allStepResults],
          startedAt,
        })
      },

      onLog: (message) => {
        allLogs.push(message)
        const exec = get().activeExecutions[taskId]
        if (exec) {
          get().setActiveExecution(taskId, {
            ...exec,
            logs: allLogs.slice(-5),
          })
        }
      },

      onComplete: () => {
        const now = new Date().toISOString()
        const duration = Date.now() - new Date(startedAt).getTime()
        const hasFailed = allStepResults.some((r) => r.status === 'failed')

        get().setActiveExecution(taskId, {
          status: 'completed',
          currentStep: completedSteps,
          totalSteps,
          currentNodeLabel: null,
          logs: allLogs.slice(-5),
          stepResults: allStepResults,
          startedAt,
        })

        get().addRunResult(taskId, {
          id: runId,
          taskId,
          startedAt,
          completedAt: now,
          duration,
          status: hasFailed ? 'partial' : 'success',
          trigger,
          actions: allStepResults.map((r) => ({
            type: r.status === 'failed' ? 'error' as const : 'notification_sent' as const,
            description: `${nodes.find((n) => n.id === r.nodeId)?.data.label || r.nodeId}: ${r.status}`,
            metadata: { nodeId: r.nodeId, duration: r.duration },
          })),
          summary: `Workflow completed: ${allStepResults.filter((r) => r.status === 'completed').length}/${totalSteps} steps succeeded`,
          logs: allLogs,
          stepResults: allStepResults,
        })

        // Clear active execution after brief delay so UI shows completion state
        setTimeout(() => get().setActiveExecution(taskId, null), 5_000)
      },

      onFail: (error) => {
        const now = new Date().toISOString()
        get().setActiveExecution(taskId, {
          status: 'failed',
          currentStep: completedSteps,
          totalSteps,
          currentNodeLabel: null,
          logs: [...allLogs.slice(-4), `[ERROR] ${error}`],
          stepResults: allStepResults,
          startedAt,
        })

        get().addRunResult(taskId, {
          id: runId,
          taskId,
          startedAt,
          completedAt: now,
          duration: Date.now() - new Date(startedAt).getTime(),
          status: 'failed',
          trigger,
          actions: [{ type: 'error', description: error }],
          summary: `Workflow failed: ${error}`,
          logs: allLogs,
          stepResults: allStepResults,
        })

        // Clear active execution after brief delay so UI shows failure state
        setTimeout(() => get().setActiveExecution(taskId, null), 5_000)
      },

      isAborted: () => {
        return false // TODO: support aborting from task detail panel
      },
    }, workingDirectory, jiraProjectKey)
  },
}))
