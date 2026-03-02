import { useState } from 'react'
import { Icon } from '../../common/Icon'
import { StatusDot } from './StatusDot'
import { FormToggle } from './FormToggle'
import { TaskRunCard } from './TaskRunCard'
import { WorkflowResultsBoard } from './WorkflowResultsBoard'
import { SCHEDULE_OPTIONS } from '../../../data/task-templates'
import { useTaskStore, type Task, type TaskStatus } from '../../../store/useTaskStore'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import type { Node } from '@xyflow/react'
import type { WorkflowNodeData } from '../../../types/workflow'

const statusColors: Record<TaskStatus, 'green' | 'orange' | 'blue' | 'gray'> = {
  idle: 'gray',
  queued: 'gray',
  running: 'orange',
  completed: 'green',
  failed: 'gray',
  paused: 'gray',
}

const statusLabels: Record<TaskStatus, string> = {
  idle: 'Idle',
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '--'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const TABS = ['Overview', 'Results', 'Run History'] as const

interface Props {
  task: Task
  onClose: () => void
}

export function TaskDetailPanel({ task, onClose }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [showRunMenu, setShowRunMenu] = useState(false)

  const triggerRun = useTaskStore((s) => s.triggerRun)
  const runTaskWorkflow = useTaskStore((s) => s.runTaskWorkflow)
  const toggleSchedule = useTaskStore((s) => s.toggleSchedule)
  const removeTask = useTaskStore((s) => s.removeTask)
  const activeExecution = useTaskStore((s) => s.activeExecutions[task.id])

  const jiraIntegration = task.integrations.find((i) => i.config.type === 'jira')
  const intervalLabel = SCHEDULE_OPTIONS.find((o) => o.value === task.schedule.interval)?.label || task.schedule.interval

  // Get step results: from live execution or latest persisted run
  const stepResults = activeExecution?.stepResults
    || task.runs[0]?.stepResults
    || []

  // Get workflow nodes for labels
  const workflowNodes: Node<WorkflowNodeData>[] = task.workflow?.nodes || []

  return (
    <div className="w-[360px] border-l border-pilos-border flex flex-col bg-pilos-bg flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pilos-border flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-white truncate flex-1 mr-2">{task.title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors flex-shrink-0">
            <Icon icon="lucide:x" className="text-sm" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <StatusDot color={statusColors[task.status]} pulse={task.status === 'running'} />
          <span className="text-xs text-zinc-400">{statusLabels[task.status]}</span>
          <span className={`text-[10px] capitalize px-1.5 py-0.5 rounded ${
            task.priority === 'critical' ? 'bg-red-500/10 text-red-400'
            : task.priority === 'high' ? 'bg-orange-500/10 text-orange-400'
            : task.priority === 'medium' ? 'bg-blue-500/10 text-blue-400'
            : 'bg-zinc-800 text-zinc-500'
          }`}>
            {task.priority}
          </span>
        </div>

        {/* Run button */}
        <div className="relative">
          <button
            onClick={() => setShowRunMenu(!showRunMenu)}
            disabled={task.status === 'running'}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Icon icon={task.status === 'running' ? 'lucide:loader-2' : 'lucide:play'} className={`text-sm ${task.status === 'running' ? 'animate-spin' : ''}`} />
            {task.status === 'running' ? 'Running...' : 'Run Task'}
          </button>

          {showRunMenu && task.status !== 'running' && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-pilos-border rounded-lg shadow-xl z-10 overflow-hidden">
              <button
                onClick={() => {
                  if (task.workflow?.nodes?.length) {
                    runTaskWorkflow(task.id)
                  } else {
                    triggerRun(task.id, 'manual')
                  }
                  setShowRunMenu(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700 transition-colors text-left"
              >
                <Icon icon="lucide:play" className="text-green-400 text-xs" />
                <span className="text-xs text-white">Run Now</span>
              </button>
              {task.schedule.interval !== 'manual' && (
                <button
                  onClick={() => { toggleSchedule(task.id); setShowRunMenu(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700 transition-colors text-left border-t border-pilos-border"
                >
                  <Icon icon={task.schedule.enabled ? 'lucide:pause' : 'lucide:clock'} className="text-blue-400 text-xs" />
                  <span className="text-xs text-white">{task.schedule.enabled ? 'Pause Schedule' : 'Enable Schedule'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-pilos-border flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t ? 'text-blue-400 border-blue-400' : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {tab === 'Overview' && (
          <>
            {/* Description */}
            {task.description && (
              <div>
                <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Description</label>
                <p className="text-xs text-zinc-400 leading-relaxed">{task.description}</p>
              </div>
            )}

            {/* Agent */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Agent</label>
              <p className="text-xs text-zinc-300">{task.agentName || 'Not assigned'}</p>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Schedule</label>
              <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500">Interval</span>
                  <span className="text-xs text-white">{intervalLabel}</span>
                </div>
                {task.schedule.interval !== 'manual' && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-zinc-500">Auto-run</span>
                      <FormToggle
                        checked={task.schedule.enabled}
                        onChange={() => toggleSchedule(task.id)}
                      />
                    </div>
                    {task.schedule.nextRunAt && (
                      <div className="flex justify-between">
                        <span className="text-xs text-zinc-500">Next run</span>
                        <span className="text-xs text-zinc-300">{timeAgo(task.schedule.nextRunAt)}</span>
                      </div>
                    )}
                  </>
                )}
                {task.schedule.lastRunAt && (
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Last run</span>
                    <span className="text-xs text-zinc-300">{timeAgo(task.schedule.lastRunAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Integrations */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Integrations</label>
              {task.integrations.length > 0 ? (
                <div className="space-y-2">
                  {jiraIntegration && jiraIntegration.config.type === 'jira' && (
                    <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon icon="lucide:layout-kanban" className="text-blue-400 text-sm" />
                        <span className="text-xs font-medium text-white">Jira</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[10px] text-zinc-500">Project</span>
                          <span className="text-[10px] text-zinc-300">{jiraIntegration.config.projectName} ({jiraIntegration.config.projectKey})</span>
                        </div>
                        {jiraIntegration.config.boardName && (
                          <div className="flex justify-between">
                            <span className="text-[10px] text-zinc-500">Board</span>
                            <span className="text-[10px] text-zinc-300">{jiraIntegration.config.boardName}</span>
                          </div>
                        )}
                        <div className="flex gap-2 mt-1">
                          {jiraIntegration.config.autoCreateTickets && (
                            <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">auto-create</span>
                          )}
                          {jiraIntegration.config.autoAssign && (
                            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">auto-assign</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">No integrations connected</p>
              )}
            </div>

            {/* Workflow */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Workflow</label>
              <button
                onClick={() => useWorkflowStore.getState().setEditingTaskId(task.id)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
              >
                <Icon icon="lucide:workflow" className="text-blue-400 text-sm" />
                {task.workflow ? 'Edit Workflow' : 'Create Workflow'}
                {task.workflow && (
                  <span className="text-[10px] text-zinc-600 ml-1">
                    ({task.workflow.nodes.length} steps)
                  </span>
                )}
              </button>
            </div>

            {/* Danger zone */}
            <div className="pt-2 border-t border-pilos-border">
              <button
                onClick={() => { removeTask(task.id); onClose() }}
                className="flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors"
              >
                <Icon icon="lucide:trash-2" className="text-xs" />
                Delete task
              </button>
            </div>
          </>
        )}

        {tab === 'Results' && (
          <WorkflowResultsBoard
            stepResults={stepResults}
            nodes={workflowNodes}
            onAiFix={() => useWorkflowStore.getState().aiFixWorkflow()}
            isFixing={useWorkflowStore.getState().isFixing}
          />
        )}

        {tab === 'Run History' && (
          <>
            {task.runs.length > 0 ? (
              <div className="space-y-2">
                {task.runs.map((run, i) => (
                  <TaskRunCard key={run.id} run={run} index={task.runs.length - 1 - i} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon icon="lucide:history" className="text-zinc-800 text-2xl mb-2" />
                <p className="text-xs text-zinc-600">No runs yet</p>
                <p className="text-[10px] text-zinc-700 mt-0.5">Click Run to execute this task</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
