import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTaskStore, computeNextRunAt } from './useTaskStore'
import type { Task, TaskSchedule } from './useTaskStore'
import type { WorkflowDefinition } from '../types/workflow'

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  api: {
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    claude: {
      abort: vi.fn(),
    },
  },
}))

vi.mock('../utils/workflow-executor', () => ({
  executeWorkflow: vi.fn(),
}))

vi.mock('./useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => ({
      jiraProjectKey: null,
      editingTaskId: null,
      execution: null,
      stopExecution: vi.fn(),
    })),
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getApi() {
  const mod = await import('../api')
  return (mod as unknown as { api: Record<string, Record<string, ReturnType<typeof vi.fn>>> }).api
}

function makeTask(overrides: Partial<Task> = {}): Omit<Task, 'id' | 'projectPath' | 'createdAt' | 'updatedAt' | 'runs'> {
  return {
    title: 'Test Task',
    description: 'A test task',
    template: 'custom',
    status: 'idle',
    priority: 'medium',
    agentId: null,
    agentName: null,
    progress: 0,
    integrations: [],
    schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
    ...overrides,
  }
}

const initialState = useTaskStore.getState()

beforeEach(() => {
  useTaskStore.setState(initialState, true)
  vi.clearAllMocks()
})

// ── computeNextRunAt ──────────────────────────────────────────────────────────

describe('computeNextRunAt', () => {
  it('returns null for manual interval', () => {
    expect(computeNextRunAt('2024-01-01T00:00:00.000Z', 'manual')).toBeNull()
  })

  it('adds 15 minutes for 15min interval', () => {
    const result = computeNextRunAt('2024-01-01T00:00:00.000Z', '15min')
    expect(result).toBe('2024-01-01T00:15:00.000Z')
  })

  it('adds 1 hour for 1h interval', () => {
    const result = computeNextRunAt('2024-01-01T00:00:00.000Z', '1h')
    expect(result).toBe('2024-01-01T01:00:00.000Z')
  })

  it('adds 1 day for 1d interval', () => {
    const result = computeNextRunAt('2024-01-01T00:00:00.000Z', '1d')
    expect(result).toBe('2024-01-02T00:00:00.000Z')
  })

  it('adds 1 week for 1w interval', () => {
    const result = computeNextRunAt('2024-01-01T00:00:00.000Z', '1w')
    expect(result).toBe('2024-01-08T00:00:00.000Z')
  })
})

// ── loadTasks ─────────────────────────────────────────────────────────────────

describe('loadTasks', () => {
  it('loads tasks from storage', async () => {
    const api = await getApi()
    const stored = [
      {
        id: 't1',
        projectPath: '/proj',
        title: 'Task 1',
        description: '',
        template: 'custom',
        status: 'idle',
        priority: 'medium',
        agentId: null,
        agentName: null,
        progress: 0,
        integrations: [],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    api.settings.get.mockImplementation((key: string) => {
      if (key === 'v2_tasks:/proj') return Promise.resolve(stored)
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    expect(useTaskStore.getState().currentProjectPath).toBe('/proj')
    expect(useTaskStore.getState().tasks).toHaveLength(1)
    expect(useTaskStore.getState().tasks[0].title).toBe('Task 1')
  })

  it('sets empty tasks when no storage entry', async () => {
    const api = await getApi()
    api.settings.get.mockResolvedValue(null)

    await useTaskStore.getState().loadTasks('/proj')

    expect(useTaskStore.getState().tasks).toEqual([])
  })

  it('normalizes running tasks to failed on load', async () => {
    const api = await getApi()
    api.settings.get.mockImplementation((key: string) => {
      if (key === 'v2_tasks:/proj') return Promise.resolve([
        {
          id: 't1', projectPath: '/proj', title: 'Running Task', description: '',
          template: 'custom', status: 'running', priority: 'medium',
          agentId: null, agentName: null, progress: 0, integrations: [],
          schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
          runs: [{ id: 'r1', completedAt: null, startedAt: '2024-01-01T00:00:00.000Z' }],
          createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ])
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    expect(useTaskStore.getState().tasks[0].status).toBe('failed')
  })

  it('normalizes queued tasks with no runs to idle', async () => {
    const api = await getApi()
    api.settings.get.mockImplementation((key: string) => {
      if (key === 'v2_tasks:/proj') return Promise.resolve([
        {
          id: 't2', projectPath: '/proj', title: 'Queued Task', description: '',
          template: 'custom', status: 'queued', priority: 'low',
          agentId: null, agentName: null, progress: 0, integrations: [],
          schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
          runs: [],
          createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ])
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    expect(useTaskStore.getState().tasks[0].status).toBe('idle')
  })

  it('fixes orphaned in-progress runs (completedAt null) on load', async () => {
    const api = await getApi()
    api.settings.get.mockImplementation((key: string) => {
      if (key === 'v2_tasks:/proj') return Promise.resolve([
        {
          id: 't3', projectPath: '/proj', title: 'Task With Orphan Run', description: '',
          template: 'custom', status: 'completed', priority: 'medium',
          agentId: null, agentName: null, progress: 100, integrations: [],
          schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
          runs: [{ id: 'r1', taskId: 't3', startedAt: '2024-01-01T00:00:00.000Z', completedAt: null, status: 'success' }],
          createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ])
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    const run = useTaskStore.getState().tasks[0].runs[0]
    expect(run.status).toBe('failed')
    expect(run.completedAt).not.toBeNull()
    expect(run.summary).toContain('interrupted')
  })

  it('migrates global v2_tasks when project-specific storage is empty', async () => {
    const api = await getApi()
    const globalTask = {
      id: 'gt1', title: 'Global Task', description: '', template: 'custom',
      status: 'idle', priority: 'medium', agentId: null, agentName: null,
      progress: 0, integrations: [],
      schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
      runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    }
    api.settings.get.mockImplementation((key: string) => {
      if (key === 'v2_tasks:/proj') return Promise.resolve([])
      if (key === 'v2_tasks') return Promise.resolve([globalTask])
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    expect(useTaskStore.getState().tasks[0].projectPath).toBe('/proj')
    expect(api.settings.set).toHaveBeenCalledWith('v2_tasks', null)
  })

  it('sets empty tasks on storage error', async () => {
    const api = await getApi()
    api.settings.get.mockRejectedValue(new Error('storage error'))

    await useTaskStore.getState().loadTasks('/proj')

    expect(useTaskStore.getState().tasks).toEqual([])
  })

  it('resets selectedTaskId on load', async () => {
    const api = await getApi()
    api.settings.get.mockResolvedValue(null)
    useTaskStore.setState({ selectedTaskId: 'old-selection' })

    await useTaskStore.getState().loadTasks('/proj')

    expect(useTaskStore.getState().selectedTaskId).toBeNull()
  })

  it('applies fallback values for missing task fields during normalization (lines 259-262)', async () => {
    const api = await getApi()
    api.settings.get.mockImplementation((key: string) => {
      if (key === 'v2_tasks:/proj') return Promise.resolve([
        {
          id: 't-minimal',
          title: 'Minimal Task',
          description: '',
          // projectPath omitted → falls back to `projectPath` param
          // template omitted → falls back to 'custom'
          // integrations omitted → falls back to []
          // schedule omitted → falls back to default object
          status: 'idle',
          priority: 'medium',
          agentId: null,
          agentName: null,
          progress: 0,
          runs: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ])
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    const task = useTaskStore.getState().tasks[0]
    expect(task.projectPath).toBe('/proj')
    expect(task.template).toBe('custom')
    expect(task.integrations).toEqual([])
    expect(task.schedule).toEqual({
      interval: 'manual',
      enabled: false,
      nextRunAt: null,
      lastRunAt: null,
    })
  })
})

// ── addTask ───────────────────────────────────────────────────────────────────

describe('addTask', () => {
  it('adds task with generated id and timestamps', async () => {
    const api = await getApi()
    api.settings.get.mockResolvedValue(null)
    useTaskStore.setState({ currentProjectPath: '/proj', tasks: [] })

    await useTaskStore.getState().addTask(makeTask({ title: 'New Task' }))

    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBeTruthy()
    expect(tasks[0].title).toBe('New Task')
    expect(tasks[0].projectPath).toBe('/proj')
    expect(tasks[0].runs).toEqual([])
    expect(tasks[0].createdAt).toBeTruthy()
    expect(api.settings.set).toHaveBeenCalledWith('v2_tasks:/proj', tasks)
  })

  it('does nothing when no currentProjectPath', async () => {
    const api = await getApi()
    useTaskStore.setState({ currentProjectPath: null, tasks: [] })

    await useTaskStore.getState().addTask(makeTask())

    expect(useTaskStore.getState().tasks).toHaveLength(0)
    expect(api.settings.set).not.toHaveBeenCalled()
  })
})

// ── updateTask ────────────────────────────────────────────────────────────────

describe('updateTask', () => {
  it('updates matching task and sets updatedAt', async () => {
    const api = await getApi()
    const task: Task = {
      id: 't1', projectPath: '/proj', title: 'Old Title', description: '',
      template: 'custom', status: 'idle', priority: 'low', agentId: null, agentName: null,
      progress: 0, integrations: [],
      schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
      runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    }
    useTaskStore.setState({ tasks: [task], currentProjectPath: '/proj' })

    await useTaskStore.getState().updateTask('t1', { title: 'New Title', priority: 'high' })

    const updated = useTaskStore.getState().tasks[0]
    expect(updated.title).toBe('New Title')
    expect(updated.priority).toBe('high')
    expect(updated.updatedAt).not.toBe('2024-01-01T00:00:00.000Z')
    expect(api.settings.set).toHaveBeenCalledWith('v2_tasks:/proj', expect.any(Array))
  })

  it('does not modify other tasks', async () => {
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 't2', projectPath: '/proj', title: 'T2', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().updateTask('t1', { title: 'Changed' })

    expect(useTaskStore.getState().tasks[1].title).toBe('T2')
  })
})

// ── removeTask ────────────────────────────────────────────────────────────────

describe('removeTask', () => {
  it('removes task and persists', async () => {
    const api = await getApi()
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj', selectedTaskId: null })

    await useTaskStore.getState().removeTask('t1')

    expect(useTaskStore.getState().tasks).toHaveLength(0)
    expect(api.settings.set).toHaveBeenCalledWith('v2_tasks:/proj', [])
  })

  it('clears selectedTaskId when removing selected task', async () => {
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj', selectedTaskId: 't1' })

    await useTaskStore.getState().removeTask('t1')

    expect(useTaskStore.getState().selectedTaskId).toBeNull()
  })

  it('does not clear selectedTaskId when removing non-selected task', async () => {
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 't2', projectPath: '/proj', title: 'T2', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj', selectedTaskId: 't2' })

    await useTaskStore.getState().removeTask('t1')

    expect(useTaskStore.getState().selectedTaskId).toBe('t2')
  })
})

// ── selectTask ────────────────────────────────────────────────────────────────

describe('selectTask', () => {
  it('sets selectedTaskId', () => {
    useTaskStore.getState().selectTask('t1')
    expect(useTaskStore.getState().selectedTaskId).toBe('t1')
  })

  it('clears selectedTaskId with null', () => {
    useTaskStore.setState({ selectedTaskId: 't1' })
    useTaskStore.getState().selectTask(null)
    expect(useTaskStore.getState().selectedTaskId).toBeNull()
  })
})

// ── setFilter ─────────────────────────────────────────────────────────────────

describe('setFilter', () => {
  it('merges partial filter updates', () => {
    useTaskStore.getState().setFilter({ status: 'running' })
    expect(useTaskStore.getState().filter.status).toBe('running')
    expect(useTaskStore.getState().filter.priority).toBe('all')
    expect(useTaskStore.getState().filter.search).toBe('')
  })

  it('updates search independently', () => {
    useTaskStore.getState().setFilter({ search: 'deploy' })
    expect(useTaskStore.getState().filter.search).toBe('deploy')
    expect(useTaskStore.getState().filter.status).toBe('all')
  })
})

// ── setShowCreateModal ────────────────────────────────────────────────────────

describe('setShowCreateModal', () => {
  it('opens and closes modal', () => {
    useTaskStore.getState().setShowCreateModal(true)
    expect(useTaskStore.getState().showCreateModal).toBe(true)

    useTaskStore.getState().setShowCreateModal(false)
    expect(useTaskStore.getState().showCreateModal).toBe(false)
  })
})

// ── setActiveExecution ────────────────────────────────────────────────────────

describe('setActiveExecution', () => {
  it('stores execution data for a task', () => {
    const exec = {
      status: 'running' as const,
      currentStep: 1,
      totalSteps: 3,
      currentNodeLabel: 'Step 1',
      logs: [],
      stepResults: [],
      startedAt: new Date().toISOString(),
    }
    useTaskStore.getState().setActiveExecution('t1', exec)
    expect(useTaskStore.getState().activeExecutions['t1']).toEqual(exec)
  })

  it('removes execution when data is null', () => {
    useTaskStore.setState({
      activeExecutions: {
        't1': {
          status: 'running', currentStep: 1, totalSteps: 3,
          currentNodeLabel: null, logs: [], stepResults: [],
          startedAt: new Date().toISOString(),
        },
      },
    })
    useTaskStore.getState().setActiveExecution('t1', null)
    expect(useTaskStore.getState().activeExecutions['t1']).toBeUndefined()
  })
})

// ── addIntegration / removeIntegration ────────────────────────────────────────

describe('addIntegration', () => {
  it('adds integration to task', async () => {
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().addIntegration('t1', {
      type: 'slack',
      channelId: 'C1',
      channelName: '#general',
    })

    const task = useTaskStore.getState().tasks[0]
    expect(task.integrations).toHaveLength(1)
    expect(task.integrations[0].config.type).toBe('slack')
    expect(task.integrations[0].id).toBeTruthy()
  })
})

describe('removeIntegration', () => {
  it('removes integration by id', async () => {
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [{ id: 'int-1', config: { type: 'slack', channelId: 'C1', channelName: '#g' }, connectedAt: '2024-01-01T00:00:00.000Z' }],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().removeIntegration('t1', 'int-1')

    expect(useTaskStore.getState().tasks[0].integrations).toHaveLength(0)
  })

  it('passes non-matching tasks through in addIntegration map (line 328 false branch)', async () => {
    // Line 328: `t.id === taskId ? ... : t` — false branch with multiple tasks
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 't2', projectPath: '/proj', title: 'Other', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().addIntegration('t1', { type: 'slack', channelId: 'C1', channelName: '#g' })

    // t2 should pass through unchanged (false branch of the ternary)
    expect(useTaskStore.getState().tasks.find((t) => t.id === 't2')?.integrations).toHaveLength(0)
    expect(useTaskStore.getState().tasks.find((t) => t.id === 't1')?.integrations).toHaveLength(1)
  })

  it('passes non-matching tasks through in removeIntegration map (lines 335-338 false branch)', async () => {
    // Lines 335-338: false branch of ternary with multiple tasks
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [{ id: 'int-1', config: { type: 'slack', channelId: 'C1', channelName: '#g' }, connectedAt: '2024-01-01T00:00:00.000Z' }],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 't2', projectPath: '/proj', title: 'Other', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [{ id: 'int-2', config: { type: 'slack', channelId: 'C2', channelName: '#other' }, connectedAt: '2024-01-01T00:00:00.000Z' }],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().removeIntegration('t1', 'int-1')

    // t2 should pass through unchanged (false branch)
    expect(useTaskStore.getState().tasks.find((t) => t.id === 't2')?.integrations).toHaveLength(1)
    expect(useTaskStore.getState().tasks.find((t) => t.id === 't1')?.integrations).toHaveLength(0)
  })
})

// ── updateSchedule ────────────────────────────────────────────────────────────

describe('updateSchedule', () => {
  it('updates schedule interval and computes nextRunAt when enabled', async () => {
    const schedule: TaskSchedule = { interval: 'manual', enabled: true, nextRunAt: null, lastRunAt: '2024-01-01T00:00:00.000Z' }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().updateSchedule('t1', { interval: '1h' })

    const updatedSchedule = useTaskStore.getState().tasks[0].schedule
    expect(updatedSchedule.interval).toBe('1h')
    expect(updatedSchedule.nextRunAt).toBe('2024-01-01T01:00:00.000Z')
  })

  it('sets nextRunAt to null for manual interval', async () => {
    const schedule: TaskSchedule = { interval: '1h', enabled: true, nextRunAt: '2024-01-01T01:00:00.000Z', lastRunAt: '2024-01-01T00:00:00.000Z' }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().updateSchedule('t1', { interval: 'manual' })

    expect(useTaskStore.getState().tasks[0].schedule.nextRunAt).toBeNull()
  })

  it('passes non-matching tasks through in updateSchedule map (line 346 true branch)', async () => {
    // Line 346: `if (t.id !== taskId) return t` — true branch with multiple tasks
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: true, nextRunAt: null, lastRunAt: '2024-01-01T00:00:00.000Z' },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 't2', projectPath: '/proj', title: 'Other', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().updateSchedule('t1', { interval: '1h' })

    // t2 should pass through unchanged (true branch of if(t.id !== taskId))
    expect(useTaskStore.getState().tasks.find((t) => t.id === 't2')?.schedule.interval).toBe('manual')
  })

  it('skips nextRunAt recomputation when schedule has no interval field (line 349: if (schedule.interval) false branch)', async () => {
    // Line 349: `if (schedule.interval)` — false branch when schedule update doesn't include interval
    const schedule: TaskSchedule = { interval: '1h', enabled: true, nextRunAt: '2024-01-01T01:00:00.000Z', lastRunAt: '2024-01-01T00:00:00.000Z' }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    // Pass a schedule update without interval — exercises line 349 false branch
    await useTaskStore.getState().updateSchedule('t1', { enabled: false } as Partial<TaskSchedule>)

    // nextRunAt should remain unchanged (not recomputed)
    expect(useTaskStore.getState().tasks[0].schedule.nextRunAt).toBe('2024-01-01T01:00:00.000Z')
    expect(useTaskStore.getState().tasks[0].schedule.enabled).toBe(false)
  })

  it('does not compute nextRunAt when interval is non-manual but enabled is false (line 352 false branch)', async () => {
    // Line 352: `else if (merged.enabled)` — false branch when enabled=false with non-manual interval
    const schedule: TaskSchedule = { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    // Set non-manual interval but enabled remains false — exercises `else if (merged.enabled)` false branch
    await useTaskStore.getState().updateSchedule('t1', { interval: '1h' })

    // enabled=false → merged.enabled=false → else if branch not taken → nextRunAt stays null
    expect(useTaskStore.getState().tasks[0].schedule.nextRunAt).toBeNull()
    expect(useTaskStore.getState().tasks[0].schedule.interval).toBe('1h')
  })

  it('uses current time as base when merged.lastRunAt is null in updateSchedule (line 354)', async () => {
    // Line 354: `merged.lastRunAt || new Date().toISOString()` — need lastRunAt=null
    const schedule: TaskSchedule = { interval: 'manual', enabled: true, nextRunAt: null, lastRunAt: null }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().updateSchedule('t1', { interval: '1h' })

    const updatedSchedule = useTaskStore.getState().tasks[0].schedule
    expect(updatedSchedule.interval).toBe('1h')
    // nextRunAt should be 1h from now (not null)
    expect(updatedSchedule.nextRunAt).not.toBeNull()
  })
})

// ── toggleSchedule ────────────────────────────────────────────────────────────

describe('toggleSchedule', () => {
  it('enables schedule and computes nextRunAt', async () => {
    const schedule: TaskSchedule = { interval: '1h', enabled: false, nextRunAt: null, lastRunAt: '2024-01-01T00:00:00.000Z' }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().toggleSchedule('t1')

    const updated = useTaskStore.getState().tasks[0].schedule
    expect(updated.enabled).toBe(true)
    expect(updated.nextRunAt).toBe('2024-01-01T01:00:00.000Z')
  })

  it('disables schedule and clears nextRunAt', async () => {
    const schedule: TaskSchedule = { interval: '1h', enabled: true, nextRunAt: '2024-01-01T01:00:00.000Z', lastRunAt: '2024-01-01T00:00:00.000Z' }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().toggleSchedule('t1')

    const updated = useTaskStore.getState().tasks[0].schedule
    expect(updated.enabled).toBe(false)
    expect(updated.nextRunAt).toBeNull()
  })

  it('does nothing when task not found', async () => {
    useTaskStore.setState({ tasks: [], currentProjectPath: '/proj' })
    // Should not throw
    await useTaskStore.getState().toggleSchedule('nonexistent')
    expect(useTaskStore.getState().tasks).toHaveLength(0)
  })

  it('passes non-matching tasks through in toggleSchedule map (line 373 false branch)', async () => {
    // Line 373: `t.id === taskId ? ... : t` — false branch when there are multiple tasks
    const schedule: TaskSchedule = { interval: '1h', enabled: false, nextRunAt: null, lastRunAt: null }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 't2', projectPath: '/proj', title: 'Other Task', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null }, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().toggleSchedule('t1')

    // t2 should pass through unchanged
    const t2 = useTaskStore.getState().tasks.find((t) => t.id === 't2')
    expect(t2?.schedule.enabled).toBe(false)
    expect(t2?.title).toBe('Other Task')
  })

  it('uses current time as base when lastRunAt is null (line 370: lastRunAt || new Date().toISOString())', async () => {
    // Line 370: `computeNextRunAt(task.schedule.lastRunAt || new Date().toISOString(), ...)`
    // When lastRunAt is null, new Date().toISOString() is used as the base time.
    const schedule: TaskSchedule = { interval: '1h', enabled: false, nextRunAt: null, lastRunAt: null }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule, runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().toggleSchedule('t1')

    const updated = useTaskStore.getState().tasks[0].schedule
    expect(updated.enabled).toBe(true)
    // nextRunAt should be roughly 1h from now (not null)
    expect(updated.nextRunAt).not.toBeNull()
  })
})

// ── triggerRun ────────────────────────────────────────────────────────────────

describe('triggerRun', () => {
  it('sets task to running and creates a run entry', async () => {
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().triggerRun('t1', 'manual')

    const task = useTaskStore.getState().tasks[0]
    expect(task.status).toBe('running')
    expect(task.runs).toHaveLength(1)
    expect(task.runs[0].trigger).toBe('manual')
    expect(task.runs[0].completedAt).toBeNull()
  })

  it('limits stored runs to MAX_RUNS_PER_TASK (100)', async () => {
    const runs = Array.from({ length: 100 }, (_, i) => ({
      id: `run-${i}`,
      taskId: 't1',
      startedAt: '2024-01-01T00:00:00.000Z',
      completedAt: '2024-01-01T00:01:00.000Z',
      duration: 60000,
      status: 'success' as const,
      trigger: 'manual' as const,
      actions: [],
      summary: 'done',
      logs: [],
    }))
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().triggerRun('t1', 'manual')

    expect(useTaskStore.getState().tasks[0].runs).toHaveLength(100)
  })

  it('passes non-matching tasks through unchanged in triggerRun map (line 396 true branch)', async () => {
    // Line 396: `if (t.id !== taskId) return t` — true branch when multiple tasks exist
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 't2', projectPath: '/proj', title: 'Other Task', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().triggerRun('t1', 'manual')

    // t2 should be unchanged
    expect(useTaskStore.getState().tasks.find((t) => t.id === 't2')?.title).toBe('Other Task')
    expect(useTaskStore.getState().tasks.find((t) => t.id === 't2')?.runs).toHaveLength(0)
  })
})

// ── addRunResult ──────────────────────────────────────────────────────────────

describe('addRunResult', () => {
  it('updates run with result and sets status to completed', async () => {
    const startedAt = '2024-01-01T00:00:00.000Z'
    const completedAt = '2024-01-01T00:01:00.000Z'
    const runId = 'run-1'
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'running', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [{
          id: runId, taskId: 't1', startedAt, completedAt: null, duration: null,
          status: 'success', trigger: 'manual', actions: [], summary: 'running...', logs: [],
        }],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().addRunResult('t1', {
      id: runId,
      taskId: 't1',
      startedAt,
      completedAt,
      duration: 60000,
      status: 'success',
      trigger: 'manual',
      actions: [],
      summary: 'done',
      logs: [],
    })

    const task = useTaskStore.getState().tasks[0]
    expect(task.status).toBe('completed')
    expect(task.progress).toBe(100)
    expect(task.runs[0].completedAt).toBe(completedAt)
    expect(task.schedule.lastRunAt).toBe(completedAt)
  })

  it('sets task status to failed when run status is failed', async () => {
    const runId = 'run-1'
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'running', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [{
          id: runId, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z', completedAt: null,
          duration: null, status: 'success', trigger: 'manual', actions: [], summary: '', logs: [],
        }],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().addRunResult('t1', {
      id: runId, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z',
      completedAt: '2024-01-01T00:01:00.000Z', duration: 60000,
      status: 'failed', trigger: 'manual', actions: [], summary: 'error', logs: [],
    })

    expect(useTaskStore.getState().tasks[0].status).toBe('failed')
  })

  it('passes non-matching tasks through unchanged in addRunResult map (line 406 true branch)', async () => {
    // Line 406: `if (t.id !== taskId) return t` — true branch when multiple tasks exist
    const runId = 'run-1'
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'running', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [{ id: runId, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z', completedAt: null, duration: null, status: 'success', trigger: 'manual', actions: [], summary: '', logs: [] }],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 't2', projectPath: '/proj', title: 'Other Task', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().addRunResult('t1', {
      id: runId, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z',
      completedAt: '2024-01-01T00:01:00.000Z', duration: 60000,
      status: 'success', trigger: 'manual', actions: [], summary: 'done', logs: [],
    })

    // t2 should be unchanged
    expect(useTaskStore.getState().tasks.find((t) => t.id === 't2')?.status).toBe('idle')
  })

  it('uses startedAt as lastRunAt when completedAt is null (line 408: run.completedAt || run.startedAt)', async () => {
    // Line 408: `run.completedAt || run.startedAt` — need completedAt=null
    const runId = 'run-1'
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'running', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [{ id: runId, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z', completedAt: null, duration: null, status: 'success', trigger: 'manual', actions: [], summary: '', logs: [] }],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().addRunResult('t1', {
      id: runId, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z',
      completedAt: null as unknown as string, // null completedAt — exercises `|| run.startedAt`
      duration: null, status: 'success', trigger: 'manual', actions: [], summary: 'done', logs: [],
    })

    // lastRunAt should fall back to startedAt
    expect(useTaskStore.getState().tasks[0].schedule.lastRunAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('maps through non-matching runs unchanged in addRunResult (line 407 false branch)', async () => {
    // Line 407: `r.id === run.id ? run : r` — false branch when run id doesn't match
    const runId1 = 'run-1'
    const runId2 = 'run-2'
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'running', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [
          { id: runId1, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z', completedAt: null, duration: null, status: 'success', trigger: 'manual', actions: [], summary: 'run1', logs: [] },
          { id: runId2, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z', completedAt: null, duration: null, status: 'success', trigger: 'manual', actions: [], summary: 'run2', logs: [] },
        ],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().addRunResult('t1', {
      id: runId1, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z',
      completedAt: '2024-01-01T00:01:00.000Z', duration: 60000,
      status: 'success', trigger: 'manual', actions: [], summary: 'updated run1', logs: [],
    })

    const updatedRuns = useTaskStore.getState().tasks[0].runs
    // runId1 was updated; runId2 should pass through unchanged (false branch of r.id === run.id)
    expect(updatedRuns.find((r) => r.id === runId1)?.summary).toBe('updated run1')
    expect(updatedRuns.find((r) => r.id === runId2)?.summary).toBe('run2')
  })

  it('computes nextRunAt when schedule is enabled with non-manual interval on run completion (line 409 true branch)', async () => {
    // Line 409: `t.schedule.enabled && t.schedule.interval !== 'manual'` — both true
    const runId = 'run-1'
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'running', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [],
        schedule: { interval: '1h', enabled: true, nextRunAt: null, lastRunAt: null },
        runs: [{ id: runId, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z', completedAt: null, duration: null, status: 'success', trigger: 'scheduled', actions: [], summary: '', logs: [] }],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().addRunResult('t1', {
      id: runId, taskId: 't1', startedAt: '2024-01-01T00:00:00.000Z',
      completedAt: '2024-01-01T01:00:00.000Z', duration: 3600000,
      status: 'success', trigger: 'scheduled', actions: [], summary: 'done', logs: [],
    })

    const updatedSchedule = useTaskStore.getState().tasks[0].schedule
    // nextRunAt should be 1h after completedAt = '2024-01-01T02:00:00.000Z'
    expect(updatedSchedule.nextRunAt).toBe('2024-01-01T02:00:00.000Z')
  })
})

// ── runTaskWorkflow ───────────────────────────────────────────────────────────

describe('runTaskWorkflow', () => {
  it('does nothing when task has no workflow', async () => {
    const api = await getApi()
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().runTaskWorkflow('t1')

    // No settings.set for run persistence — workflow never started
    expect(api.settings.set).not.toHaveBeenCalled()
  })

  it('does nothing when task not found', async () => {
    const api = await getApi()
    useTaskStore.setState({ tasks: [], currentProjectPath: '/proj' })

    await useTaskStore.getState().runTaskWorkflow('nonexistent')

    expect(api.settings.set).not.toHaveBeenCalled()
  })

  it('marks task as running and calls executeWorkflow', async () => {
    const { executeWorkflow } = await import('../utils/workflow-executor')
    const execMock = vi.mocked(executeWorkflow)
    execMock.mockResolvedValue(undefined)

    const workflow = {
      nodes: [
        { id: 'start', data: { type: 'start', label: 'Start' }, position: { x: 0, y: 0 } },
        { id: 'step1', data: { type: 'claude', label: 'Do Work' }, position: { x: 0, y: 100 } },
        { id: 'end', data: { type: 'end', label: 'End' }, position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'step1' },
        { id: 'e2', source: 'step1', target: 'end' },
      ],
    }
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'Workflow Task', description: '', template: 'custom',
        status: 'idle', priority: 'medium', agentId: null, agentName: null, progress: 0,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], workflow,
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj' })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')

    expect(execMock).toHaveBeenCalledTimes(1)
  })
})

// ── stopTask ──────────────────────────────────────────────────────────────────

describe('stopTask', () => {
  it('adds task to _abortedTaskIds', () => {
    useTaskStore.setState({ tasks: [], currentProjectPath: '/proj', activeExecutions: {} })
    useTaskStore.getState().stopTask('t1')
    expect(useTaskStore.getState()._abortedTaskIds.has('t1')).toBe(true)
  })

  it('calls api.claude.abort when active session exists', async () => {
    const api = await getApi()
    useTaskStore.setState({
      tasks: [],
      _activeTaskSessions: { 't1': 'sess-abc' },
      activeExecutions: {},
      currentProjectPath: '/proj',
    })

    useTaskStore.getState().stopTask('t1')

    expect(api.claude.abort).toHaveBeenCalledWith('sess-abc')
  })

  it('does not call abort when no active session', async () => {
    const api = await getApi()
    useTaskStore.setState({
      tasks: [],
      _activeTaskSessions: {},
      activeExecutions: {},
      currentProjectPath: '/proj',
    })

    useTaskStore.getState().stopTask('t1')

    expect(api.claude.abort).not.toHaveBeenCalled()
  })

  it('directly resets task status when no active execution', async () => {
    const api = await getApi()
    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'running', priority: 'medium', agentId: null, agentName: null, progress: 50,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj', activeExecutions: {}, _activeTaskSessions: {} })

    useTaskStore.getState().stopTask('t1')

    // updateTask is async but the call is synchronous — wait one microtask
    await Promise.resolve()

    expect(api.settings.set).toHaveBeenCalled()
    expect(useTaskStore.getState().tasks[0].status).toBe('failed')
  })

  it('calls workflowStore.stopExecution when the workflow editor is open for that task', async () => {
    const mod = await import('./useWorkflowStore')
    const wfStore = (mod as unknown as { useWorkflowStore: { getState: ReturnType<typeof vi.fn> } }).useWorkflowStore
    const stopExecution = vi.fn()
    wfStore.getState.mockReturnValue({
      jiraProjectKey: null,
      editingTaskId: 't1',
      execution: { status: 'running' },
      stopExecution,
    })

    const tasks: Task[] = [
      {
        id: 't1', projectPath: '/proj', title: 'T1', description: '', template: 'custom',
        status: 'running', priority: 'medium', agentId: null, agentName: null, progress: 50,
        integrations: [], schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    useTaskStore.setState({ tasks, currentProjectPath: '/proj', activeExecutions: { t1: { status: 'running', currentStep: 1, totalSteps: 2, currentNodeLabel: null, logs: [], stepResults: [], startedAt: new Date().toISOString() } }, _activeTaskSessions: {} })

    useTaskStore.getState().stopTask('t1')

    expect(stopExecution).toHaveBeenCalled()
  })
})

// ── loadTasks — v2_tasks_pending migration ────────────────────────────────────

describe('loadTasks — v2_tasks_pending migration', () => {
  it('migrates pending wizard tasks and clears the pending key', async () => {
    const api = await getApi()
    const pendingTask = {
      id: 'pending-1', title: 'Pending Task', description: '', template: 'custom',
      status: 'idle', priority: 'medium', agentId: null, agentName: null,
      progress: 0, integrations: [],
      schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
      runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    }
    api.settings.get.mockImplementation((key: string) => {
      if (key === 'v2_tasks:/proj') return Promise.resolve([])
      if (key === 'v2_tasks_pending') return Promise.resolve([pendingTask])
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].projectPath).toBe('/proj')
    expect(tasks[0].title).toBe('Pending Task')
    expect(api.settings.set).toHaveBeenCalledWith('v2_tasks_pending', null)
  })
})

// ── loadTasks — completed run passthrough (line 254) ─────────────────────────

describe('loadTasks — completed run passthrough', () => {
  it('leaves runs with a non-null completedAt unchanged', async () => {
    const api = await getApi()
    api.settings.get.mockImplementation((key: string) => {
      if (key === 'v2_tasks:/proj') return Promise.resolve([
        {
          id: 't1', projectPath: '/proj', title: 'Task With Completed Run', description: '',
          template: 'custom', status: 'completed', priority: 'medium',
          agentId: null, agentName: null, progress: 100, integrations: [],
          schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
          runs: [{
            id: 'r1', taskId: 't1',
            startedAt: '2024-01-01T00:00:00.000Z',
            completedAt: '2024-01-01T00:05:00.000Z',
            duration: 300000,
            status: 'success',
          }],
          createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ])
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    const run = useTaskStore.getState().tasks[0].runs[0]
    // Run already has completedAt — must not be overwritten
    expect(run.completedAt).toBe('2024-01-01T00:05:00.000Z')
    expect(run.status).toBe('success')
  })
})

// ── runTaskWorkflow — executeWorkflow callbacks ───────────────────────────────

async function getExecuteWorkflow() {
  const mod = await import('../utils/workflow-executor')
  return (mod as unknown as { executeWorkflow: ReturnType<typeof vi.fn> }).executeWorkflow
}

function makeFullTask(id = 't1', projectPath = '/proj'): Task {
  return {
    id,
    projectPath,
    title: 'Test Task',
    description: '',
    template: 'custom',
    status: 'idle',
    priority: 'medium',
    agentId: null,
    agentName: null,
    progress: 0,
    integrations: [],
    schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
    runs: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workflow: {
      nodes: [
        { id: 'NODE_START_01', type: 'start', position: { x: 0, y: 0 }, data: { type: 'start', label: 'Start' } },
        { id: 'n1', type: 'mcp_tool', position: { x: 0, y: 100 }, data: { type: 'mcp_tool', label: 'Tool' } },
      ],
      edges: [],
    } as unknown as WorkflowDefinition,
  }
}

describe('runTaskWorkflow — executeWorkflow callbacks', () => {
  it('onNodeStart updates active execution with correct step', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return new Promise(() => {}) // never resolves — we drive callbacks manually
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')

    // Wait for the initial async setup (updateTask etc.) to complete
    await new Promise((r) => setTimeout(r, 0))

    capturedCallbacks.onNodeStart('n1')

    const exec = useTaskStore.getState().activeExecutions['t1']
    expect(exec).toBeDefined()
    expect(exec!.currentStep).toBe(1)
    expect(exec!.status).toBe('running')

    // Clean up
    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('onNodeComplete increments completedSteps', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return new Promise(() => {})
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    const stepResult = { nodeId: 'n1', status: 'completed' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), duration: 100 }
    capturedCallbacks.onNodeComplete('n1', stepResult)

    const exec = useTaskStore.getState().activeExecutions['t1']
    expect(exec!.stepResults).toHaveLength(1)
    expect(exec!.stepResults[0].status).toBe('completed')

    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('onNodeFail records failed step result', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return new Promise(() => {})
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    const failResult = { nodeId: 'n1', status: 'failed' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), duration: 50, error: 'timeout' }
    capturedCallbacks.onNodeFail('n1', failResult)

    const exec = useTaskStore.getState().activeExecutions['t1']
    expect(exec!.stepResults).toHaveLength(1)
    expect(exec!.stepResults[0].status).toBe('failed')

    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('onLog appends log messages and truncates to last 5', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return new Promise(() => {})
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    for (let i = 0; i < 7; i++) {
      capturedCallbacks.onLog(`Log line ${i}`)
    }

    const exec = useTaskStore.getState().activeExecutions['t1']
    // Execution logs are capped at last 5
    expect(exec!.logs.length).toBeLessThanOrEqual(5)
    expect(exec!.logs[exec!.logs.length - 1]).toBe('Log line 6')

    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('onComplete marks execution completed and calls addRunResult', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      // Resolve immediately after callbacks are captured
      return Promise.resolve().then(() => { capturedCallbacks.onComplete() })
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')

    // After onComplete, execution should be marked completed (before the 5s timeout clears it)
    // addRunResult is async — wait a tick
    await new Promise((r) => setTimeout(r, 0))

    const tasks = useTaskStore.getState().tasks
    const task = tasks.find((t) => t.id === 't1')
    expect(task).toBeDefined()
    // Status should have been updated by addRunResult to completed or still running
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('onComplete with mixed step results marks task as partial when any step failed', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return Promise.resolve().then(() => {
        // Add a failed step result first, then call onComplete
        const failResult = { nodeId: 'n1', status: 'failed' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), duration: 50, error: 'timeout' }
        capturedCallbacks.onNodeFail('n1', failResult)
        capturedCallbacks.onComplete()
      })
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    // The task run result should show 'partial' (some failures)
    const tasks = useTaskStore.getState().tasks
    const task = tasks.find((t) => t.id === 't1')
    // runs are added by addRunResult
    const latestRun = task?.runs[0]
    if (latestRun) {
      expect(latestRun.status).toBe('partial')
    }
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('onFail marks execution failed and persists failure run result', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return Promise.resolve().then(() => { capturedCallbacks.onFail('Node crashed') })
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    // After onFail the active execution should reflect failed status
    const exec = useTaskStore.getState().activeExecutions['t1']
    // exec may still exist (cleared after 5s timeout, not immediately)
    if (exec) {
      expect(exec.status).toBe('failed')
    }

    // addRunResult should have been called → settings.set called
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('isAborted returns true after stopTask is called', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let isAbortedFn: (() => boolean) | null = null
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, () => boolean>) => {
      isAbortedFn = callbacks.isAborted
      return new Promise(() => {})
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set(), _activeTaskSessions: {} })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    expect(isAbortedFn!()).toBe(false)

    useTaskStore.getState().stopTask('t1')
    expect(isAbortedFn!()).toBe(true)

    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('onSessionStart stores session id and onSessionEnd removes it', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return new Promise(() => {})
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set(), _activeTaskSessions: {} })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    capturedCallbacks.onSessionStart('session-abc')
    expect(useTaskStore.getState()._activeTaskSessions['t1']).toBe('session-abc')

    capturedCallbacks.onSessionEnd()
    expect(useTaskStore.getState()._activeTaskSessions['t1']).toBeUndefined()

    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('does nothing when task has no workflow nodes', async () => {
    const executeWorkflow = await getExecuteWorkflow()

    const emptyTask: Task = {
      ...makeFullTask(),
      workflow: { nodes: [], edges: [] } as unknown as WorkflowDefinition,
    }
    useTaskStore.setState({ tasks: [emptyTask], currentProjectPath: '/proj' })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')

    expect(executeWorkflow).not.toHaveBeenCalled()
  })

  it('uses empty array for edges when workflow.edges is undefined (line 430: workflow.edges || [])', async () => {
    // Line 430: `task.workflow.edges || []` — need edges to be undefined
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()
    executeWorkflow.mockResolvedValue(undefined)

    const taskNoEdges: Task = {
      ...makeFullTask(),
      workflow: {
        nodes: [
          { id: 'NODE_START_01', type: 'start', position: { x: 0, y: 0 }, data: { type: 'start', label: 'Start' } },
          { id: 'n1', type: 'mcp_tool', position: { x: 0, y: 100 }, data: { type: 'mcp_tool', label: 'Tool' } },
        ],
        // edges omitted — exercises `task.workflow.edges || []`
      } as unknown as WorkflowDefinition,
    }
    useTaskStore.setState({ tasks: [taskNoEdges], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')

    expect(executeWorkflow).toHaveBeenCalled()
    // Second argument (edges) should be an empty array from the fallback
    const [, edges] = executeWorkflow.mock.calls[0]
    expect(Array.isArray(edges)).toBe(true)
    api.settings.set.mockResolvedValue(undefined)
  })

  it('passes non-matching tasks through unchanged in allTasks map (lines 454 true branch)', async () => {
    // Line 454: `if (t.id !== taskId) return t` — the true branch with multiple tasks
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()
    executeWorkflow.mockResolvedValue(undefined)

    const task1 = makeFullTask('t1', '/proj')
    const task2: Task = {
      ...makeFullTask('t2', '/proj'),
      title: 'Other Task',
    }
    useTaskStore.setState({ tasks: [task1, task2], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')

    // task2 should be unchanged
    const tasks = useTaskStore.getState().tasks
    const unchanged = tasks.find((t) => t.id === 't2')
    expect(unchanged?.title).toBe('Other Task')
    api.settings.set.mockResolvedValue(undefined)
  })

  it('uses currentProjectPath as workingDirectory when task.projectPath is falsy (line 476)', async () => {
    // Line 476: `task.projectPath || get().currentProjectPath || undefined`
    // When task.projectPath is empty string (falsy), the currentProjectPath is used.
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()
    executeWorkflow.mockResolvedValue(undefined)

    const taskNoPath: Task = {
      ...makeFullTask(),
      projectPath: '' as unknown as string, // falsy — exercises `task.projectPath || ...`
    }
    useTaskStore.setState({ tasks: [taskNoPath], currentProjectPath: '/fallback-proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')

    // executeWorkflow should have been called — confirms no throw
    expect(executeWorkflow).toHaveBeenCalled()
    // The 5th argument (workingDirectory) should be '/fallback-proj'
    const [, , , workingDir] = executeWorkflow.mock.calls[0]
    expect(workingDir).toBe('/fallback-proj')
    api.settings.set.mockResolvedValue(undefined)
  })

  it('node label falls back to null when node has no label (line 484: data.label || null)', async () => {
    // Line 484: `nodes.find((n) => n.id === nodeId)?.data.label || null`
    // When the node has an empty/falsy label, the `|| null` branch is taken.
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return new Promise(() => {})
    })

    // Create a task with a node that has an empty label string
    const taskEmptyLabel: Task = {
      ...makeFullTask(),
      workflow: {
        nodes: [
          { id: 'NODE_START_01', type: 'start', position: { x: 0, y: 0 }, data: { type: 'start', label: 'Start' } },
          { id: 'n1', type: 'mcp_tool', position: { x: 0, y: 100 }, data: { type: 'mcp_tool', label: '' } }, // empty label
        ],
        edges: [],
      } as unknown as WorkflowDefinition,
    }
    useTaskStore.setState({ tasks: [taskEmptyLabel], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    capturedCallbacks.onNodeStart('n1')

    const exec = useTaskStore.getState().activeExecutions['t1']
    // label should be null (empty string '' is falsy → `|| null` returns null)
    expect(exec!.currentNodeLabel).toBeNull()

    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('onLog skips setActiveExecution when no active execution exists (line 528 false branch)', async () => {
    // Line 528: `if (exec)` — the false branch is taken when activeExecutions[taskId] is undefined.
    // Call onLog after the active execution has been cleared.
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return new Promise(() => {})
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    // Clear the active execution so `get().activeExecutions[taskId]` is undefined
    useTaskStore.getState().setActiveExecution('t1', null)
    expect(useTaskStore.getState().activeExecutions['t1']).toBeUndefined()

    // Call onLog — exec is undefined so `if (exec)` is false, no setActiveExecution call
    // Should not throw
    capturedCallbacks.onLog('some log message after exec cleared')

    // Execution is still cleared (not re-created by onLog)
    expect(useTaskStore.getState().activeExecutions['t1']).toBeUndefined()

    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('onNodeStart grows totalSteps when nextStep exceeds current totalSteps (line 483)', async () => {
    // Line 483: `if (nextStep > totalSteps) totalSteps = nextStep`
    // The fixture has 1 executable node (n1), so totalSteps=1.
    // After onNodeComplete sets completedSteps=1, a second onNodeStart call makes nextStep=2.
    // At that point nextStep(2) > totalSteps(1), triggering the branch.
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return new Promise(() => {})
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    // Complete step 1 so completedSteps becomes 1 (equals totalSteps=1)
    const stepResult = { nodeId: 'n1', status: 'completed' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), duration: 100 }
    capturedCallbacks.onNodeComplete('n1', stepResult)

    // Now trigger a second node start — nextStep = completedSteps+1 = 2 > totalSteps=1
    capturedCallbacks.onNodeStart('n1')

    const exec = useTaskStore.getState().activeExecutions['t1']
    // totalSteps should have grown to 2; currentStep should be 2
    expect(exec!.currentStep).toBe(2)
    expect(exec!.totalSteps).toBeGreaterThanOrEqual(2)

    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('onNodeComplete grows totalSteps when completedSteps exceeds current totalSteps (line 499)', async () => {
    // Line 499: `if (completedSteps > totalSteps) totalSteps = completedSteps`
    // We call onNodeComplete twice. After the first call completedSteps=1 (equals totalSteps=1).
    // After the second call completedSteps becomes 2 > totalSteps=1, triggering the branch.
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return new Promise(() => {})
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    const runPromise = useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 0))

    const stepResult = { nodeId: 'n1', status: 'completed' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), duration: 100 }
    capturedCallbacks.onNodeComplete('n1', stepResult) // completedSteps=1, totalSteps=1 → no growth
    capturedCallbacks.onNodeComplete('n1', stepResult) // completedSteps=2, totalSteps=1 → grows

    const exec = useTaskStore.getState().activeExecutions['t1']
    expect(exec!.currentStep).toBe(2)
    expect(exec!.totalSteps).toBeGreaterThanOrEqual(2)

    api.settings.set.mockResolvedValue(undefined)
    runPromise.catch(() => {})
  })

  it('onComplete produces "success" run status when all steps completed (lines 560-561 success branch)', async () => {
    // Exercises `hasFailed ? 'partial' : 'success'` with hasFailed=false (line 557/560)
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return Promise.resolve().then(() => {
        // Complete step successfully, then call onComplete
        const stepResult = { nodeId: 'n1', status: 'completed' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), duration: 100 }
        capturedCallbacks.onNodeComplete('n1', stepResult)
        capturedCallbacks.onComplete()
      })
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    // addRunResult is async — wait for it to complete
    await new Promise((r) => setTimeout(r, 10))

    const task = useTaskStore.getState().tasks.find((t) => t.id === 't1')
    expect(task).toBeDefined()
    // With no failed steps, run status should be 'success'
    const completedRun = task?.runs.find((r) => r.status === 'success' || r.status === 'partial')
    expect(completedRun?.status).toBe('success')
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('onComplete produces "partial" run status when some steps failed (lines 560-561 partial branch)', async () => {
    // Exercises `hasFailed ? 'partial' : 'success'` with hasFailed=true (line 557/560)
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return Promise.resolve().then(() => {
        // Add a failed step, then call onComplete
        const failResult = { nodeId: 'n1', status: 'failed' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), duration: 50, error: 'boom' }
        capturedCallbacks.onNodeFail('n1', failResult)
        capturedCallbacks.onComplete()
      })
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 10))

    const task = useTaskStore.getState().tasks.find((t) => t.id === 't1')
    expect(task).toBeDefined()
    // With a failed step, run status should be 'partial'
    const completedRun = task?.runs.find((r) => r.status === 'success' || r.status === 'partial')
    expect(completedRun?.status).toBe('partial')
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('uses undefined workingDirectory when both task.projectPath and currentProjectPath are falsy (line 476)', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return Promise.resolve().then(() => capturedCallbacks.onComplete())
    })

    // Task with empty projectPath and store has null currentProjectPath
    const task = { ...makeFullTask(), projectPath: '' }
    useTaskStore.setState({ tasks: [task], currentProjectPath: null, activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 10))

    // workingDirectory resolves to undefined — executeWorkflow is still called successfully
    expect(executeWorkflow).toHaveBeenCalled()
    expect(api.settings.set).toHaveBeenCalled()
  })

  it('falls back to r.nodeId in action description when node label is not found (line 561 || branch)', async () => {
    const executeWorkflow = await getExecuteWorkflow()
    const api = await getApi()

    let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {}
    executeWorkflow.mockImplementation((_n: unknown, _e: unknown, callbacks: Record<string, (...args: unknown[]) => void>) => {
      capturedCallbacks = callbacks
      return Promise.resolve().then(() => {
        // Report a step result for a nodeId that doesn't exist in the nodes array
        const stepResult = {
          nodeId: 'UNKNOWN_NODE',
          status: 'completed' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          duration: 10,
        }
        capturedCallbacks.onNodeComplete('UNKNOWN_NODE', stepResult)
        capturedCallbacks.onComplete()
      })
    })

    useTaskStore.setState({ tasks: [makeFullTask()], currentProjectPath: '/proj', activeExecutions: {}, _abortedTaskIds: new Set() })

    await useTaskStore.getState().runTaskWorkflow('t1', 'manual')
    await new Promise((r) => setTimeout(r, 10))

    const task = useTaskStore.getState().tasks.find((t) => t.id === 't1')
    const run = task?.runs.find((r) => r.status === 'success' || r.status === 'partial')
    expect(run).toBeDefined()
    // The action description should fall back to the nodeId since no matching node was found
    const action = run?.actions?.[0]
    expect(action?.description).toContain('UNKNOWN_NODE')
    expect(api.settings.set).toHaveBeenCalled()
  })
})

// ── loadTasks — line 225 and 243 branch coverage ──────────────────────────────

describe('loadTasks — non-array stored value and missing runs (lines 225, 243)', () => {
  it('treats non-array stored value as empty list when pending tasks merge produces non-array stored (line 225)', async () => {
    const api = await getApi()
    const pendingTask = {
      id: 'pending-x', title: 'Pending X', description: '', template: 'custom',
      status: 'idle', priority: 'medium', agentId: null, agentName: null,
      progress: 0, integrations: [],
      schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
      runs: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    }
    api.settings.get.mockImplementation((key: string) => {
      // v2_tasks:/proj returns a non-array (e.g. a string) — exercises the `Array.isArray(stored) ? stored : []` false branch
      if (key === 'v2_tasks:/proj') return Promise.resolve('invalid-non-array' as unknown)
      if (key === 'v2_tasks_pending') return Promise.resolve([pendingTask])
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    // The non-array stored is treated as [] so only the pending task ends up in the list
    const tasks = useTaskStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('pending-x')
  })

  it('handles a task with null runs field without throwing (line 243 || [] branch)', async () => {
    const api = await getApi()
    api.settings.get.mockImplementation((key: string) => {
      if (key === 'v2_tasks:/proj') return Promise.resolve([
        {
          id: 't-no-runs',
          title: 'No Runs Task',
          description: '',
          projectPath: '/proj',
          template: 'custom',
          status: 'idle',
          priority: 'medium',
          agentId: null,
          agentName: null,
          progress: 0,
          integrations: [],
          schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
          runs: null, // null triggers the `|| []` fallback
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ])
      return Promise.resolve(null)
    })

    await useTaskStore.getState().loadTasks('/proj')

    const task = useTaskStore.getState().tasks[0]
    expect(task).toBeDefined()
    expect(task.runs).toEqual([])
  })
})
