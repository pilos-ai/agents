import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../../common/Icon'
import { FormInput } from './FormInput'
import { FormSelect } from './FormSelect'
import { FormTextarea } from './FormTextarea'
import { FormToggle } from './FormToggle'
import { TASK_TEMPLATES, SCHEDULE_OPTIONS } from '../../../data/task-templates'
import { generateWorkflowForTemplate } from '../../../data/workflow-templates'
import type { TaskTemplateDefinition } from '../../../data/task-templates'
import { useTaskStore, type TaskTemplate, type TaskPriority, type ScheduleInterval, type JiraIntegrationConfig, type TaskIntegration } from '../../../store/useTaskStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { useAppStore } from '../../../store/useAppStore'

// Lazy-load Jira store from PM package
let jiraStoreRef: { useJiraStore: any } | null = null
async function loadJiraStore() {
  if (jiraStoreRef) return jiraStoreRef
  try {
    const mod = await import('@pilos/agents-pm')
    jiraStoreRef = { useJiraStore: mod.useJiraStore }
    return jiraStoreRef
  } catch {
    return null
  }
}

interface Props {
  onClose: () => void
}

const STEPS = ['Basics', 'Integrations', 'Schedule', 'Review'] as const
type Step = (typeof STEPS)[number]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

export function CreateTaskModal({ onClose }: Props) {
  const addTask = useTaskStore((s) => s.addTask)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setActiveSettingsSection = useAppStore((s) => s.setActiveSettingsSection)
  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const agents = activeTab?.agents || []

  const [step, setStep] = useState(0)

  // Step 1: Basics
  const [template, setTemplate] = useState<TaskTemplate>('custom')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [agentId, setAgentId] = useState<string>('')
  const [agentName, setAgentName] = useState<string>('')

  // Step 2: Integrations
  const [jiraConnected, setJiraConnected] = useState(false)
  const [jiraProjects, setJiraProjects] = useState<{ key: string; name: string }[]>([])
  const [jiraBoards, setJiraBoards] = useState<{ id: number; name: string }[]>([])
  const [jiraProjectKey, setJiraProjectKey] = useState('')
  const [jiraProjectName, setJiraProjectName] = useState('')
  const [jiraBoardId, setJiraBoardId] = useState<number | null>(null)
  const [jiraBoardName, setJiraBoardName] = useState('')
  const [jiraAutoCreate, setJiraAutoCreate] = useState(true)
  const [jiraAutoAssign, setJiraAutoAssign] = useState(false)
  const [jiraEnabled, setJiraEnabled] = useState(false)
  const [loadingJiraProjects, setLoadingJiraProjects] = useState(false)
  const [loadingJiraBoards, setLoadingJiraBoards] = useState(false)

  // MCP servers from project
  const mcpServers = activeTab?.mcpServers || []
  const enabledMcpServers = mcpServers.filter((s) => s.enabled)
  const githubConnected = mcpServers.some((s) => s.name.toLowerCase().includes('github') && s.enabled)

  // Step 3: Schedule
  const [interval, setInterval] = useState<ScheduleInterval>('manual')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)

  // Load Jira connection status
  useEffect(() => {
    loadJiraStore().then((mod) => {
      if (!mod) return
      const state = mod.useJiraStore.getState()
      setJiraConnected(state.connected)
      if (state.connected) {
        setLoadingJiraProjects(true)
        state.loadProjects().then(() => {
          const projects = mod.useJiraStore.getState().projects
          setJiraProjects(projects.map((p: any) => ({ key: p.key, name: p.name })))
          setLoadingJiraProjects(false)
        })
      }
    })
  }, [])

  // Load boards when Jira project changes
  const handleJiraProjectChange = useCallback(async (projectKey: string) => {
    setJiraProjectKey(projectKey)
    const proj = jiraProjects.find((p) => p.key === projectKey)
    setJiraProjectName(proj?.name || projectKey)
    setJiraBoardId(null)
    setJiraBoardName('')
    if (!projectKey) {
      setJiraBoards([])
      return
    }
    const mod = await loadJiraStore()
    if (!mod) return
    setLoadingJiraBoards(true)
    await mod.useJiraStore.getState().loadBoards(projectKey)
    const boards = mod.useJiraStore.getState().boards
    setJiraBoards(boards.map((b: any) => ({ id: b.id, name: b.name })))
    setLoadingJiraBoards(false)
  }, [jiraProjects])

  // Select template
  const handleTemplateSelect = (tmpl: TaskTemplateDefinition) => {
    setTemplate(tmpl.id)
    if (tmpl.id !== 'custom') {
      if (!title) setTitle(tmpl.name)
      if (!description) setDescription(tmpl.defaultDescription)
      setPriority(tmpl.defaultPriority)
      setInterval(tmpl.suggestedInterval)
      setScheduleEnabled(tmpl.suggestedInterval !== 'manual')
      if (tmpl.requiredIntegrations.includes('jira') && jiraConnected) {
        setJiraEnabled(true)
      }
    }
  }

  // Agent selection
  const handleAgentChange = (id: string) => {
    setAgentId(id)
    const agent = agents.find((a) => a.id === id)
    setAgentName(agent?.name || '')
  }

  // Create task
  const handleCreate = async () => {
    const integrations: TaskIntegration[] = []
    if (jiraEnabled && jiraProjectKey) {
      integrations.push({
        id: crypto.randomUUID(),
        config: {
          type: 'jira',
          projectKey: jiraProjectKey,
          projectName: jiraProjectName,
          boardId: jiraBoardId,
          boardName: jiraBoardName,
          autoCreateTickets: jiraAutoCreate,
          autoAssign: jiraAutoAssign,
        } as JiraIntegrationConfig,
        connectedAt: new Date().toISOString(),
      })
    }

    const workflow = generateWorkflowForTemplate(template)

    await addTask({
      title: title.trim() || 'Untitled Task',
      description: description.trim(),
      template,
      status: 'idle',
      priority,
      agentId: agentId || null,
      agentName: agentName || null,
      progress: 0,
      integrations,
      schedule: {
        interval,
        enabled: scheduleEnabled && interval !== 'manual',
        nextRunAt: null,
        lastRunAt: null,
      },
      ...(workflow ? { workflow } : {}),
    })
    onClose()
  }

  const canProceed = step === 0 ? title.trim().length > 0 : true

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-pilos-bg border border-pilos-border rounded-2xl w-[640px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-pilos-border">
          <h2 className="text-lg font-bold text-white">Create Automation Task</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <Icon icon="lucide:x" className="text-lg" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center border-b border-pilos-border">
          {STEPS.map((s, i) => {
            const isActive = step === i
            const isCompleted = i < step
            const isFuture = i > step
            return (
            <button
              key={s}
              onClick={() => isCompleted && setStep(i)}
              disabled={isFuture}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'text-blue-400 border-blue-400'
                  : isCompleted
                    ? 'text-zinc-400 border-transparent hover:text-zinc-300 cursor-pointer'
                    : 'text-zinc-500 border-transparent cursor-not-allowed'
              }`}
            >
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                isActive
                  ? 'bg-blue-500/20 text-blue-400'
                  : isCompleted
                    ? 'bg-zinc-700 text-zinc-400'
                    : 'bg-zinc-700/50 text-zinc-500'
              }`}>
                {isCompleted ? <Icon icon="lucide:check" className="text-[9px]" /> : i + 1}
              </span>
              {s}
            </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {step === 0 && (
            <>
              {/* Template picker */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Template</label>
                <div className="grid grid-cols-2 gap-2">
                  {TASK_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      onClick={() => handleTemplateSelect(tmpl)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                        template === tmpl.id
                          ? 'bg-blue-500/5 border-blue-500/20'
                          : 'bg-pilos-card border-pilos-border hover:border-zinc-600'
                      }`}
                    >
                      <Icon icon={tmpl.icon} className={`text-lg flex-shrink-0 ${template === tmpl.id ? 'text-blue-400' : 'text-zinc-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{tmpl.name}</p>
                        <p className="text-[10px] text-zinc-500 truncate">{tmpl.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <FormInput
                label="Task Name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Client Review"
                autoFocus
              />

              <FormTextarea
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this task should do..."
                rows={3}
              />

              <div className="flex gap-3">
                <div className="flex-1">
                  <FormSelect
                    label="Priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    options={PRIORITY_OPTIONS}
                  />
                </div>
                <div className="flex-1">
                  <FormSelect
                    label="Agent"
                    value={agentId}
                    onChange={(e) => handleAgentChange(e.target.value)}
                    options={[
                      { value: '', label: 'No agent' },
                      ...agents.map((a) => ({ value: a.id, label: a.name })),
                    ]}
                  />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Integrations</h3>
                <p className="text-xs text-zinc-500 mb-4">Connect external services and MCP servers</p>
              </div>

              {/* Integration rows — same layout as Settings > Integrations */}
              <div className="space-y-3">
                {/* Jira */}
                <div className="bg-pilos-card border border-pilos-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon icon="logos:jira" className="text-lg" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">Jira</p>
                        <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">Pro</span>
                      </div>
                      <p className="text-[10px] text-zinc-500">Atlassian issue tracking</p>
                    </div>
                    {jiraConnected ? (
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400">
                          <Icon icon="lucide:check-circle-2" className="text-xs" />
                          Connected
                        </span>
                        <FormToggle checked={jiraEnabled} onChange={setJiraEnabled} />
                      </div>
                    ) : (
                      <button
                        onClick={() => { setActiveSettingsSection('integrations'); setActiveView('settings'); onClose() }}
                        className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                  {jiraEnabled && jiraConnected && (
                    <div className="px-4 pb-4 pt-3 space-y-3 border-t border-pilos-border mx-4">
                      <FormSelect
                        label="Project"
                        value={jiraProjectKey}
                        onChange={(e) => handleJiraProjectChange(e.target.value)}
                        options={[
                          { value: '', label: loadingJiraProjects ? 'Loading...' : 'Select project' },
                          ...jiraProjects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` })),
                        ]}
                      />
                      {jiraProjectKey && (
                        <FormSelect
                          label="Board"
                          value={jiraBoardId?.toString() || ''}
                          onChange={(e) => {
                            const id = e.target.value ? Number(e.target.value) : null
                            setJiraBoardId(id)
                            const board = jiraBoards.find((b) => b.id === id)
                            setJiraBoardName(board?.name || '')
                          }}
                          options={[
                            { value: '', label: loadingJiraBoards ? 'Loading...' : 'Select board (optional)' },
                            ...jiraBoards.map((b) => ({ value: b.id.toString(), label: b.name })),
                          ]}
                        />
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Auto-create tickets</span>
                        <FormToggle checked={jiraAutoCreate} onChange={setJiraAutoCreate} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Auto-assign developers</span>
                        <FormToggle checked={jiraAutoAssign} onChange={setJiraAutoAssign} />
                      </div>
                    </div>
                  )}
                </div>

                {/* GitHub */}
                <div className="flex items-center gap-3 p-4 bg-pilos-card border border-pilos-border rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Icon icon="logos:github-icon" className="text-lg" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">GitHub</p>
                    <p className="text-[10px] text-zinc-500">Issues, PRs, code search</p>
                  </div>
                  {githubConnected ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400">
                      <Icon icon="lucide:check-circle-2" className="text-xs" />
                      Connected
                    </span>
                  ) : (
                    <button
                      onClick={() => { setActiveSettingsSection('integrations'); setActiveView('settings'); onClose() }}
                      className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                    >
                      Connect
                    </button>
                  )}
                </div>

                {/* Slack */}
                <div className="flex items-center gap-3 p-4 bg-pilos-card border border-pilos-border rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Icon icon="logos:slack-icon" className="text-lg" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Slack</p>
                    <p className="text-[10px] text-zinc-500">Team notifications</p>
                  </div>
                  <button
                    onClick={() => { setActiveSettingsSection('integrations'); setActiveView('settings'); onClose() }}
                    className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    Connect
                  </button>
                </div>

                {/* Linear */}
                <div className="flex items-center gap-3 p-4 bg-pilos-card border border-pilos-border rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <Icon icon="logos:linear-icon" className="text-lg" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Linear</p>
                    <p className="text-[10px] text-zinc-500">Issue tracking</p>
                  </div>
                  <button
                    onClick={() => { setActiveSettingsSection('integrations'); setActiveView('settings'); onClose() }}
                    className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    Connect
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Schedule</h3>
                <p className="text-xs text-zinc-500 mb-4">Set how often this task should run automatically</p>
              </div>

              <FormSelect
                label="Run Interval"
                value={interval}
                onChange={(e) => {
                  const val = e.target.value as ScheduleInterval
                  setInterval(val)
                  if (val === 'manual') setScheduleEnabled(false)
                }}
                options={SCHEDULE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />

              {interval !== 'manual' && (
                <div className="flex items-center justify-between p-3 bg-pilos-card border border-pilos-border rounded-lg">
                  <div>
                    <p className="text-sm text-white">Enable schedule</p>
                    <p className="text-[10px] text-zinc-500">Task will start running automatically once created</p>
                  </div>
                  <FormToggle checked={scheduleEnabled} onChange={setScheduleEnabled} />
                </div>
              )}

              <div className="p-3 bg-zinc-900/50 border border-pilos-border rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Icon icon="lucide:info" className="text-zinc-500 text-xs" />
                  <span className="text-xs text-zinc-400">Preview</span>
                </div>
                <p className="text-sm text-zinc-300">
                  {interval === 'manual'
                    ? 'This task will only run when triggered manually.'
                    : scheduleEnabled
                      ? `This task will run ${SCHEDULE_OPTIONS.find((o) => o.value === interval)?.label.toLowerCase() || interval} automatically.`
                      : `Schedule is configured (${SCHEDULE_OPTIONS.find((o) => o.value === interval)?.label.toLowerCase()}) but disabled. You can enable it later.`
                  }
                </p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Review</h3>
                <p className="text-xs text-zinc-500 mb-4">Review your task configuration before creating</p>
              </div>

              <div className="space-y-3">
                {/* Basics */}
                <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon={TASK_TEMPLATES.find((t) => t.id === template)?.icon || 'lucide:cog'} className="text-blue-400 text-sm" />
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Basics</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Name</span>
                    <span className="text-xs text-white">{title || 'Untitled Task'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Template</span>
                    <span className="text-xs text-white">{TASK_TEMPLATES.find((t) => t.id === template)?.name || 'Custom'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Priority</span>
                    <span className={`text-xs capitalize ${
                      priority === 'critical' ? 'text-red-400' : priority === 'high' ? 'text-orange-400' : priority === 'medium' ? 'text-blue-400' : 'text-zinc-400'
                    }`}>{priority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Agent</span>
                    <span className="text-xs text-white">{agentName || 'None'}</span>
                  </div>
                  {description && (
                    <div className="pt-1 border-t border-pilos-border">
                      <p className="text-[11px] text-zinc-500 line-clamp-2">{description}</p>
                    </div>
                  )}
                </div>

                {/* Integrations & MCP Tools */}
                <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon="lucide:plug" className="text-blue-400 text-sm" />
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Integrations & Tools</span>
                  </div>
                  {jiraEnabled && jiraProjectKey ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-blue-500/15 flex items-center justify-center">
                        <Icon icon="lucide:layout-kanban" className="text-blue-400 text-[10px]" />
                      </div>
                      <span className="text-xs text-white">
                        Jira — {jiraProjectName} {jiraBoardName ? `/ ${jiraBoardName}` : ''}
                      </span>
                      <div className="ml-auto flex gap-2">
                        {jiraAutoCreate && <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">auto-create</span>}
                        {jiraAutoAssign && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">auto-assign</span>}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">No integrations connected</p>
                  )}
                  {enabledMcpServers.length > 0 && (
                    <div className="pt-1.5 border-t border-pilos-border">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-zinc-500 mr-1">MCP:</span>
                        {enabledMcpServers.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                          >
                            <span className="text-[10px]">{s.icon}</span>
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Schedule */}
                <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon="lucide:clock" className="text-blue-400 text-sm" />
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Schedule</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Interval</span>
                    <span className="text-xs text-white">{SCHEDULE_OPTIONS.find((o) => o.value === interval)?.label || interval}</span>
                  </div>
                  {interval !== 'manual' && (
                    <div className="flex justify-between">
                      <span className="text-xs text-zinc-500">Auto-run</span>
                      <span className={`text-xs ${scheduleEnabled ? 'text-green-400' : 'text-zinc-600'}`}>
                        {scheduleEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-pilos-border">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {step > 0 ? 'Back' : 'Cancel'}
          </button>
          <button
            onClick={() => step < STEPS.length - 1 ? setStep(step + 1) : handleCreate()}
            disabled={!canProceed}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {step < STEPS.length - 1 ? 'Next' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
