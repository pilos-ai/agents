import { useState, useEffect, useMemo } from 'react'
import { Icon } from '../../common/Icon'
import { StatusDot } from '../components/StatusDot'
import { TaskDetailPanel } from '../components/TaskDetailPanel'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { GenerateTaskModal } from '../components/GenerateTaskModal'
import { WorkflowEditor } from '../workflow/WorkflowEditor'
import { useTaskStore, type Task, type TaskStatus, type TaskPriority } from '../../../store/useTaskStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { useWorkflowStore } from '../../../store/useWorkflowStore'

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

const priorityColors: Record<TaskPriority, string> = {
  low: 'text-zinc-400',
  medium: 'text-blue-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
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

function TaskRow({ task, selected, onClick }: { task: Task; selected: boolean; onClick: () => void }) {
  const hasJira = task.integrations.some((i) => i.config.type === 'jira')
  const hasSlack = task.integrations.some((i) => i.config.type === 'slack')
  const isScheduled = task.schedule.interval !== 'manual'

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3 border-b border-pilos-border transition-colors cursor-pointer hover:bg-zinc-800/30 ${
        selected ? 'bg-blue-500/5 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'
      }`}
    >
      <div className="w-14">
        <span className="text-[10px] text-zinc-600 font-mono">{task.id.slice(0, 6)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white truncate block">{task.title}</span>
      </div>
      <div className="w-24 flex items-center gap-2">
        <StatusDot color={statusColors[task.status]} pulse={task.status === 'running'} />
        <span className="text-xs text-zinc-400">{statusLabels[task.status]}</span>
      </div>
      <div className="w-16">
        <span className={`text-xs font-medium capitalize ${priorityColors[task.priority]}`}>{task.priority}</span>
      </div>
      <div className="w-8 flex items-center justify-center">
        {isScheduled ? (
          <Icon
            icon="lucide:clock"
            className={`text-xs ${task.schedule.enabled ? 'text-blue-400' : 'text-zinc-700'}`}
          />
        ) : (
          <span className="text-zinc-800">--</span>
        )}
      </div>
      <div className="w-16 flex items-center gap-1">
        {hasJira && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border border-pilos-border bg-pilos-card">
            <Icon icon="lucide:layout-kanban" className="text-blue-400 text-[10px]" />
          </span>
        )}
        {hasSlack && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border border-pilos-border bg-pilos-card">
            <Icon icon="lucide:hash" className="text-zinc-400 text-[10px]" />
          </span>
        )}
        {!hasJira && !hasSlack && <span className="text-[10px] text-zinc-800">--</span>}
      </div>
      <div className="w-16">
        <span className="text-[10px] text-zinc-600">{timeAgo(task.schedule.lastRunAt)}</span>
      </div>
    </div>
  )
}

export default function TasksPage() {
  const tasks = useTaskStore((s) => s.tasks)
  const filter = useTaskStore((s) => s.filter)
  const setFilter = useTaskStore((s) => s.setFilter)
  const loadTasks = useTaskStore((s) => s.loadTasks)
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const selectTask = useTaskStore((s) => s.selectTask)
  const showCreateModal = useTaskStore((s) => s.showCreateModal)
  const setShowCreateModal = useTaskStore((s) => s.setShowCreateModal)
  const editingWorkflowTaskId = useWorkflowStore((s) => s.editingTaskId)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const [showGenerateModal, setShowGenerateModal] = useState(false)

  useEffect(() => {
    if (activeProjectPath) {
      loadTasks(activeProjectPath)
    }
  }, [activeProjectPath])

  // Listen for header "New Task" button
  useEffect(() => {
    const handler = () => setShowCreateModal(true)
    window.addEventListener('pilos:new-task', handler)
    return () => window.removeEventListener('pilos:new-task', handler)
  }, [setShowCreateModal])

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter.status !== 'all' && t.status !== filter.status) return false
      if (filter.priority !== 'all' && t.priority !== filter.priority) return false
      if (filter.search && !t.title.toLowerCase().includes(filter.search.toLowerCase())) return false
      return true
    })
  }, [tasks, filter])

  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : null

  // Show workflow editor when editing a task's workflow
  if (editingWorkflowTaskId) {
    return <WorkflowEditor />
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Task List (left) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-pilos-border flex-shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative">
              <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-xs" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={filter.search}
                onChange={(e) => setFilter({ search: e.target.value })}
                className="pl-8 pr-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-pilos-blue w-48"
              />
            </div>
            <select
              value={filter.status}
              onChange={(e) => setFilter({ status: e.target.value as TaskStatus | 'all' })}
              className="px-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-400 outline-none appearance-none"
            >
              <option value="all">All Status</option>
              <option value="idle">Idle</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={filter.priority}
              onChange={(e) => setFilter({ priority: e.target.value as TaskPriority | 'all' })}
              className="px-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-400 outline-none appearance-none"
            >
              <option value="all">All Priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button
            onClick={() => setShowGenerateModal(true)}
            className="px-3 py-1.5 bg-pilos-card border border-pilos-border hover:border-zinc-600 text-zinc-300 hover:text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5"
          >
            <Icon icon="lucide:sparkles" className="text-blue-400 text-xs" />
            AI Generate
          </button>
        </div>

        {/* Table Header */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-pilos-border bg-pilos-card/30 flex-shrink-0">
          <div className="w-14 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">ID</div>
          <div className="flex-1 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Title</div>
          <div className="w-24 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Status</div>
          <div className="w-16 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Priority</div>
          <div className="w-8 text-[10px] font-bold text-zinc-600 uppercase tracking-widest text-center">
            <Icon icon="lucide:clock" className="text-[10px] inline" />
          </div>
          <div className="w-16 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Integr.</div>
          <div className="w-16 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Last Run</div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredTasks.length > 0 ? (
            filteredTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === selectedTaskId}
                onClick={() => selectTask(task.id === selectedTaskId ? null : task.id)}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Icon icon="lucide:list-checks" className="text-zinc-800 text-3xl mb-3" />
              <h3 className="text-sm font-medium text-zinc-500 mb-1">No tasks yet</h3>
              <p className="text-xs text-zinc-600">Create an automation task to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Panel (right) */}
      {selectedTask && (
        <TaskDetailPanel task={selectedTask} onClose={() => selectTask(null)} />
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <CreateTaskModal onClose={() => setShowCreateModal(false)} />
      )}

      {/* Generate Task Modal */}
      {showGenerateModal && (
        <GenerateTaskModal onClose={() => setShowGenerateModal(false)} />
      )}
    </div>
  )
}
