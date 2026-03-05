import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '../../common/Icon'
import { StatusDot } from './StatusDot'
import { FormToggle } from './FormToggle'
import { TaskRunCard, StepResultCard, actionIcons, formatDuration as fmtDuration, timeAgo as fmtTimeAgo, runStatusColors } from './TaskRunCard'
import { SCHEDULE_OPTIONS } from '../../../data/task-templates'
import { useTaskStore, type Task, type TaskStatus, type TaskPriority, type ScheduleInterval } from '../../../store/useTaskStore'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import type { Node } from '@xyflow/react'
import type { WorkflowNodeData } from '../../../types/workflow'
import { prepareTaskForExport, serializeExport, encodeForClipboard, canShareTask } from '../../../utils/task-sharing'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { ProBadge } from '../../common/ProBadge'
import { api } from '../../../api'

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

function timeUntil(dateStr: string | null): string {
  if (!dateStr) return '--'
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'overdue'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'in <1m'
  if (mins < 60) return `in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `in ${hours}h`
  const days = Math.floor(hours / 24)
  return `in ${days}d`
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
  const updateTask = useTaskStore((s) => s.updateTask)
  const updateSchedule = useTaskStore((s) => s.updateSchedule)
  const activeExecution = useTaskStore((s) => s.activeExecutions[task.id])
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState(task.description)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const descTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Share state
  const [copied, setCopied] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)

  const handleExportFile = useCallback(async () => {
    const exportData = prepareTaskForExport(task)
    const json = serializeExport(exportData)
    const sanitizedTitle = task.title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'task'
    const filePath = await api.dialog.saveFile({
      defaultPath: `${sanitizedTitle}.pilos`,
      filters: [{ name: 'Pilos Task', extensions: ['pilos'] }],
    })
    if (filePath) {
      await api.files.writeFile(filePath, json)
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 2000)
    }
  }, [task])

  const handleCopyClipboard = useCallback(async () => {
    const exportData = prepareTaskForExport(task)
    const encoded = encodeForClipboard(exportData)
    await navigator.clipboard.writeText(encoded)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [task])

  // Tick every 30s so relative times (timeAgo / timeUntil) stay current
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Sync drafts when task prop changes
  useEffect(() => { setTitleDraft(task.title) }, [task.title])
  useEffect(() => { setDescDraft(task.description) }, [task.description])
  useEffect(() => { if (editingTitle) titleInputRef.current?.focus() }, [editingTitle])
  useEffect(() => { if (editingDesc) descTextareaRef.current?.focus() }, [editingDesc])

  const saveTitle = () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== task.title) updateTask(task.id, { title: trimmed })
    else setTitleDraft(task.title)
    setEditingTitle(false)
  }

  const saveDesc = () => {
    if (descDraft !== task.description) updateTask(task.id, { description: descDraft })
    setEditingDesc(false)
  }

  const jiraIntegration = task.integrations.find((i) => i.config.type === 'jira')

  // Get step results: from live execution or latest persisted run
  const stepResults = activeExecution?.stepResults
    || task.runs[0]?.stepResults
    || []

  // Get workflow nodes for labels
  const workflowNodes: Node<WorkflowNodeData>[] = task.workflow?.nodes || []
  const nodeLabels = new Map(workflowNodes.map((n) => [n.id, n.data.label]))

  return (
    <div className="w-[360px] border-l border-pilos-border flex flex-col bg-pilos-bg flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pilos-border flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false) } }}
              className="text-sm font-bold text-white bg-zinc-800 border border-blue-500 rounded px-1.5 py-0.5 flex-1 mr-2 outline-none"
            />
          ) : (
            <h3
              onClick={() => setEditingTitle(true)}
              className="text-sm font-bold text-white truncate flex-1 mr-2 cursor-pointer hover:text-blue-300 transition-colors"
              title="Click to edit"
            >
              {task.title}
            </h3>
          )}
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors flex-shrink-0">
            <Icon icon="lucide:x" className="text-sm" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <StatusDot color={statusColors[task.status]} pulse={task.status === 'running'} />
          <span className="text-xs text-zinc-400">{statusLabels[task.status]}</span>
          <select
            value={task.priority}
            onChange={(e) => updateTask(task.id, { priority: e.target.value as TaskPriority })}
            className={`text-[10px] capitalize px-1.5 py-0.5 rounded outline-none cursor-pointer appearance-none pr-4 bg-no-repeat bg-[right_2px_center] bg-[length:10px] ${
              task.priority === 'critical' ? 'bg-red-500/10 text-red-400'
              : task.priority === 'high' ? 'bg-orange-500/10 text-orange-400'
              : task.priority === 'medium' ? 'bg-blue-500/10 text-blue-400'
              : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>

        {/* Run / Stop button */}
        <div className="relative">
          {task.status === 'running' ? (
            <button
              onClick={() => useTaskStore.getState().stopTask(task.id)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <Icon icon="lucide:square" className="text-sm" />
              Stop Task
            </button>
          ) : (
            <button
              onClick={() => setShowRunMenu(!showRunMenu)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <Icon icon="lucide:play" className="text-sm" />
              Run Task
            </button>
          )}

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
            <div>
              <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Description</label>
              {editingDesc ? (
                <textarea
                  ref={descTextareaRef}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={saveDesc}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setDescDraft(task.description); setEditingDesc(false) } }}
                  rows={3}
                  className="w-full text-xs text-zinc-300 bg-zinc-800 border border-blue-500 rounded px-2 py-1.5 outline-none resize-none leading-relaxed"
                />
              ) : (
                <p
                  onClick={() => setEditingDesc(true)}
                  className={`text-xs leading-relaxed cursor-pointer hover:text-blue-300 transition-colors min-h-[20px] ${task.description ? 'text-zinc-400' : 'text-zinc-600 italic'}`}
                >
                  {task.description || '+ Add description'}
                </p>
              )}
            </div>

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
                  <select
                    value={task.schedule.interval}
                    onChange={(e) => updateSchedule(task.id, { interval: e.target.value as ScheduleInterval })}
                    className="bg-zinc-800 border border-pilos-border rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {SCHEDULE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
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
                        <span className={`text-xs ${timeUntil(task.schedule.nextRunAt) === 'overdue' ? 'text-orange-400' : 'text-zinc-300'}`}>{timeUntil(task.schedule.nextRunAt)}</span>
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

            {/* Share */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Share {!isPro && <ProBadge />}</label>
              {!isPro ? (
                <div className="space-y-2">
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-500 opacity-50 cursor-not-allowed"
                  >
                    <Icon icon="lucide:download" className="text-zinc-600 text-sm" />
                    Export as .pilos file
                  </button>
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-500 opacity-50 cursor-not-allowed"
                  >
                    <Icon icon="lucide:clipboard-copy" className="text-zinc-600 text-sm" />
                    Copy to clipboard
                  </button>
                </div>
              ) : canShareTask(task) ? (
                <div className="space-y-2">
                  <button
                    onClick={handleExportFile}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
                  >
                    <Icon icon="lucide:download" className="text-blue-400 text-sm" />
                    {exportSuccess ? 'Exported!' : 'Export as .pilos file'}
                  </button>
                  <button
                    onClick={handleCopyClipboard}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
                  >
                    <Icon icon="lucide:clipboard-copy" className="text-blue-400 text-sm" />
                    {copied ? 'Copied!' : 'Copy to clipboard'}
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg flex items-start gap-2">
                  <Icon icon="lucide:lock" className="text-zinc-500 text-sm mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-400">Marketplace purchase</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">This workflow was purchased from the marketplace and cannot be reshared.</p>
                  </div>
                </div>
              )}
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
          <>
            {/* Latest Run Summary Banner */}
            {task.runs[0] ? (
              <>
                <div className={`p-3 rounded-xl border mb-4 ${
                  task.runs[0].status === 'success' ? 'bg-emerald-500/5 border-emerald-500/20'
                  : task.runs[0].status === 'partial' ? 'bg-orange-500/5 border-orange-500/20'
                  : 'bg-red-500/5 border-red-500/20'
                }`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <StatusDot color={runStatusColors[task.runs[0].status] || 'gray'} />
                    <span className="text-xs font-bold text-white">Latest Run</span>
                    <span className="text-[10px] text-zinc-600 ml-auto">{fmtTimeAgo(task.runs[0].startedAt)}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed select-text">{task.runs[0].summary}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-zinc-500 font-mono">{fmtDuration(task.runs[0].duration)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      task.runs[0].trigger === 'scheduled' ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {task.runs[0].trigger}
                    </span>
                    {task.runs[0].stepResults && task.runs[0].stepResults.length > 0 && (
                      <span className="text-[10px] text-zinc-600">
                        {task.runs[0].stepResults.filter((r) => r.status === 'completed').length}/{task.runs[0].stepResults.length} steps
                      </span>
                    )}
                  </div>
                </div>

                {/* Step Results */}
                {stepResults.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Step Results</span>
                      <span className="text-[9px] text-emerald-500">
                        {stepResults.filter((r) => r.status === 'completed').length} passed
                      </span>
                      {stepResults.filter((r) => r.status === 'failed').length > 0 && (
                        <span className="text-[9px] text-red-400">
                          {stepResults.filter((r) => r.status === 'failed').length} failed
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {stepResults.map((result, i) => (
                        <StepResultCard
                          key={`${result.nodeId}-${i}`}
                          result={result}
                          label={nodeLabels.get(result.nodeId) || result.nodeId}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {task.runs[0].actions.length > 0 && (
                  <div className="mb-4">
                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block mb-2">
                      Actions ({task.runs[0].actions.length})
                    </span>
                    <div className="space-y-1.5">
                      {task.runs[0].actions.map((action, i) => {
                        const iconCfg = actionIcons[action.type] || actionIcons.error
                        return (
                          <div key={i} className="flex items-start gap-2 p-2 bg-pilos-card border border-pilos-border rounded-lg">
                            <Icon icon={iconCfg.icon} className={`${iconCfg.color} text-xs mt-0.5 flex-shrink-0`} />
                            <div className="min-w-0 select-text">
                              <span className="text-[11px] text-zinc-300">{action.description}</span>
                              {action.metadata && Object.keys(action.metadata).length > 0 && (
                                <div className="mt-0.5 text-[10px] text-zinc-600 font-mono truncate">
                                  {Object.entries(action.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Logs */}
                {task.runs[0].logs && task.runs[0].logs.length > 0 && (
                  <details className="pt-2 border-t border-pilos-border">
                    <summary className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest cursor-pointer hover:text-zinc-400">
                      Logs ({task.runs[0].logs.length})
                    </summary>
                    <pre className="mt-1.5 text-[10px] text-zinc-500 leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto custom-scrollbar select-text">
                      {task.runs[0].logs.join('\n')}
                    </pre>
                  </details>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon icon="lucide:file-check-2" className="text-zinc-800 text-2xl mb-2" />
                <p className="text-xs text-zinc-600">No results yet</p>
                <p className="text-[10px] text-zinc-700 mt-0.5">Run the task to see results here</p>
              </div>
            )}
          </>
        )}

        {tab === 'Run History' && (
          <>
            {task.runs.length > 0 ? (
              <div className="space-y-2">
                {task.runs.map((run, i) => (
                  <TaskRunCard key={run.id} run={run} index={task.runs.length - 1 - i} nodeLabels={nodeLabels} />
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
