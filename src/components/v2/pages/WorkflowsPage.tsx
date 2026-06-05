/**
 * Workflows page — pixel-faithful port of pilos-handoff/app/screen_workflow.jsx.
 *
 * Three-pane layout: palette (200px) + canvas (drag-drop nodes, animated run,
 * SVG edges) + inspector (256px). Real wiring: tasks come from useTaskStore,
 * the "Run" button triggers the selected task via runTaskWorkflow, and the
 * inspector edits the underlying workflow node's data.
 *
 * The palette items are visual-only — no drag-drop yet. Clicking them is a
 * no-op (no existing "add step" action on the store; the full workflow
 * builder lives behind editingWorkflowTaskId — see TasksPage legacy). FLAG:
 * palette → add-node wiring deferred.
 */
import { useEffect, useMemo, useState, useRef, type ComponentType } from 'react'
import { useTaskStore, type Task, type ScheduleInterval } from '../../../store/useTaskStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { SCHEDULE_OPTIONS } from '../../../data/task-templates'
import { WorkflowEditor } from '../workflow/WorkflowEditor'
import {
  IconWorkflow,
  IconSpark,
  IconClock,
  IconPlay,
  IconStop,
  IconCpu,
  IconCheckSm,
  IconCopy,
  IconTrash,
  IconZoomIn,
  IconZoomOut,
  IconFit,
  IconBranch,
  IconAgents,
  IconMcp,
  IconSend,
  IconGrip,
  IconPlus,
  IconSearch,
  IconPen,
} from '../PilosIcons'
import type { WorkflowNodeData } from '../../../types/workflow'
import type { Node } from '@xyflow/react'

// ── Node kind metadata (colors + icons) ──
type NodeKind = 'Schedule' | 'Agent' | 'Prompt' | 'MCP' | 'Condition' | 'Notify'

const NODE_KINDS: Record<NodeKind, { color: string; Icon: ComponentType<{ size?: number; style?: React.CSSProperties }> }> = {
  Schedule: { color: '#5cb8ff', Icon: IconClock },
  Agent: { color: '#818cf8', Icon: IconAgents },
  Prompt: { color: '#c792ea', Icon: IconSpark },
  MCP: { color: '#3ecf8e', Icon: IconMcp },
  Condition: { color: '#f6b73c', Icon: IconBranch },
  Notify: { color: '#ec4899', Icon: IconSend },
}

// ── Palette categories (visual only) ──
const PALETTE_GROUPS: { sec: string; items: { label: string; kind: NodeKind }[] }[] = [
  { sec: 'Triggers', items: [
    { label: 'Schedule', kind: 'Schedule' },
    { label: 'Webhook', kind: 'Condition' },
    { label: 'Jira event', kind: 'Condition' },
  ]},
  { sec: 'Agents & AI', items: [
    { label: 'Agent step', kind: 'Agent' },
    { label: 'AI Prompt', kind: 'Prompt' },
    { label: 'Team round', kind: 'Agent' },
  ]},
  { sec: 'Tools', items: [
    { label: 'MCP Tool', kind: 'MCP' },
    { label: 'Run command', kind: 'MCP' },
    { label: 'HTTP request', kind: 'MCP' },
  ]},
  { sec: 'Logic', items: [
    { label: 'Condition', kind: 'Condition' },
    { label: 'Loop', kind: 'Prompt' },
    { label: 'Delay', kind: 'Prompt' },
    { label: 'Parallel', kind: 'Prompt' },
    { label: 'Variable', kind: 'Prompt' },
  ]},
  { sec: 'Actions', items: [
    { label: 'Notify', kind: 'Notify' },
    { label: 'Webhook out', kind: 'Notify' },
  ]},
]

function PaletteNode({ label, kind }: { label: string; kind: NodeKind }) {
  const k = NODE_KINDS[kind]
  return (
    <div className="pal-node" draggable>
      <div className="pn-ic" style={{ background: k.color + '22', color: k.color }}>
        <k.Icon size={14} />
      </div>
      {label}
      <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>
        <IconGrip size={14} />
      </span>
    </div>
  )
}

// ── Map task workflow nodes → display nodes ──
interface DisplayNode {
  id: string
  x: number
  y: number
  kind: NodeKind
  title: string
  body: string
  foot: string
  branch?: boolean
}

interface DisplayEdge {
  id: string
  from: [number, number]
  to: [number, number]
  label?: string
  lx?: number
  ly?: number
  seq: number
}

function nodeTypeToKind(t: string | undefined): NodeKind {
  switch (t) {
    case 'start':
    case 'schedule':
      return 'Schedule'
    case 'agent':
    case 'agent_call':
      return 'Agent'
    case 'condition':
    case 'if':
      return 'Condition'
    case 'tool_call':
    case 'mcp':
      return 'MCP'
    case 'notify':
    case 'output':
      return 'Notify'
    case 'ai_prompt':
    case 'prompt':
      return 'Prompt'
    default:
      return 'Prompt'
  }
}

function describeNode(n: Node<WorkflowNodeData>): { title: string; body: string; foot: string } {
  const d = n.data
  const title = (d as { label?: string }).label || (d.type as string) || 'Step'
  const body = ((d as { description?: string; instruction?: string; expression?: string }).description
    || (d as { instruction?: string }).instruction
    || (d as { expression?: string }).expression
    || (d.type as string) || '')
  const foot = ((d as { model?: string; agentName?: string }).model
    || (d as { agentName?: string }).agentName
    || (d.type as string) || '')
  return { title: String(title), body: String(body), foot: String(foot) }
}

// ── Demo fallback when a task has no workflow yet ──
const DEMO_NODES: DisplayNode[] = [
  { id: 'n1', x: 242, y: 20, kind: 'Schedule', title: 'Every day · 2:00 AM', body: 'cron 0 2 * * *', foot: 'trigger' },
  { id: 'n2', x: 242, y: 126, kind: 'Agent', title: 'Review open PRs', body: 'Forge · reviews diffs via GitHub MCP', foot: 'claude-sonnet-4.6' },
  { id: 'n3', x: 242, y: 256, kind: 'Condition', title: 'Has critical issues?', body: 'severity ≥ P1', foot: 'branch', branch: true },
  { id: 'n4', x: 64, y: 392, kind: 'MCP', title: 'Jira: create ticket', body: 'PROJ · type=bug · P1', foot: 'jira-mcp' },
  { id: 'n5', x: 420, y: 392, kind: 'Notify', title: 'Log: all clear', body: 'append run log', foot: 'internal' },
  { id: 'n6', x: 242, y: 520, kind: 'Notify', title: 'Slack: post summary', body: '#eng-alerts', foot: 'slack-mcp' },
]

const DEMO_EDGES: DisplayEdge[] = [
  { id: 'e1', from: [340, 90], to: [340, 126], seq: 0 },
  { id: 'e2', from: [340, 222], to: [340, 256], seq: 1 },
  { id: 'e3', from: [308, 340], to: [162, 392], label: 'yes', lx: 210, ly: 372, seq: 2 },
  { id: 'e4', from: [372, 340], to: [518, 392], label: 'no', lx: 470, ly: 372, seq: -1 },
  { id: 'e5', from: [162, 484], to: [340, 520], seq: 3 },
  { id: 'e6', from: [518, 484], to: [340, 520], seq: -1 },
]

function buildDisplay(task: Task | null): { nodes: DisplayNode[]; edges: DisplayEdge[] } {
  // No task OR task with no nodes → empty canvas (the in-canvas empty state
  // handles each case with different copy). The DEMO_* fallback exists only
  // as a reference visual for the WorkflowEditor demo route.
  if (!task) return { nodes: [], edges: [] }
  if (!task.workflow || !task.workflow.nodes || task.workflow.nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Single-column linear layout — keeps it readable even when source positions
  // are arbitrary react-flow coords.
  const NODE_W = 196
  const NODE_GAP = 36
  const NODE_H = 100
  const X = 242
  const nodes: DisplayNode[] = task.workflow.nodes.map((n, i) => {
    const meta = describeNode(n)
    return {
      id: n.id,
      x: X,
      y: 20 + i * (NODE_H + NODE_GAP),
      kind: nodeTypeToKind(n.data?.type as string | undefined),
      title: meta.title,
      body: meta.body || '—',
      foot: meta.foot || '—',
    }
  })
  // Generate simple straight edges along the order from task.workflow.edges
  const idIndex = new Map(nodes.map((n, i) => [n.id, i]))
  const edges: DisplayEdge[] = (task.workflow.edges || []).map((e, i) => {
    const fi = idIndex.get(e.source)
    const ti = idIndex.get(e.target)
    if (fi == null || ti == null) return null
    const fromY = nodes[fi].y + NODE_H - 10
    const toY = nodes[ti].y
    return {
      id: e.id || `e${i}`,
      from: [X + NODE_W / 2, fromY],
      to: [X + NODE_W / 2, toY],
      seq: i,
    }
  }).filter(Boolean) as DisplayEdge[]
  return { nodes, edges }
}

function edgePath(f: [number, number], t: [number, number]) {
  const dy = Math.max(30, (t[1] - f[1]) * 0.5)
  return `M ${f[0]} ${f[1]} C ${f[0]} ${f[1] + dy}, ${t[0]} ${t[1] - dy}, ${t[0]} ${t[1]}`
}

export default function WorkflowsPage() {
  // Dispatcher: when a task is being edited, swap the whole page for the
  // rich react-flow editor. This early return is before any other hooks,
  // so all hooks below live in the WorkflowsView function — keeping the
  // rule-of-hooks safe across both branches.
  const editingTaskId = useWorkflowStore((s) => s.editingTaskId)
  if (editingTaskId) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%' }}>
        <WorkflowEditor />
      </div>
    )
  }
  return <WorkflowsView />
}

function WorkflowsView() {
  const setEditingTaskId = useWorkflowStore((s) => s.setEditingTaskId)
  const tasks = useTaskStore((s) => s.tasks)
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const selectTask = useTaskStore((s) => s.selectTask)
  const loadTasks = useTaskStore((s) => s.loadTasks)
  const addTask = useTaskStore((s) => s.addTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const removeTask = useTaskStore((s) => s.removeTask)
  const [isRenaming, setIsRenaming] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const runTaskWorkflow = useTaskStore((s) => s.runTaskWorkflow)
  const stopTask = useTaskStore((s) => s.stopTask)
  const updateSchedule = useTaskStore((s) => s.updateSchedule)
  const activeExecutions = useTaskStore((s) => s.activeExecutions)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'
  const [search, setSearch] = useState('')
  // Inline schedule popover (anchored to the Schedule toolbar button)
  const [showSchedule, setShowSchedule] = useState(false)

  useEffect(() => {
    if (activeProjectPath) loadTasks(activeProjectPath)
  }, [activeProjectPath])

  // Pick the selected task, falling back to the first one
  const activeTask = useMemo(() => {
    if (selectedTaskId) {
      const t = tasks.find((t) => t.id === selectedTaskId)
      if (t) return t
    }
    return tasks[0] || null
  }, [tasks, selectedTaskId])

  const { nodes, edges } = useMemo(() => buildDisplay(activeTask), [activeTask])
  const isRunning = activeTask ? !!activeExecutions[activeTask.id] : false

  const [sel, setSel] = useState<string>('')
  useEffect(() => { setSel(nodes[0]?.id || ''); setShowSchedule(false) }, [activeTask?.id])

  const [zoom, setZoom] = useState(0.82)

  // Animated run indicator: when the real task runs, we walk through nodes in
  // order — this is purely visual feedback, the real execution drives state via
  // activeExecutions.currentStep, which we mirror.
  const execStep = activeTask ? activeExecutions[activeTask.id]?.currentStep ?? -1 : -1
  const runOrder = useMemo(() => nodes.map((n) => n.id), [nodes])
  const nodeState = (id: string) => {
    if (!isRunning && execStep < 0) return ''
    const idx = runOrder.indexOf(id)
    if (idx === -1) return ''
    if (!isRunning && execStep >= 99) return 'done'
    if (idx < execStep) return 'done'
    if (idx === execStep) return 'running'
    return ''
  }
  const edgeLit = (e: DisplayEdge) => e.seq >= 0 && (execStep > e.seq || execStep >= 99)

  const selNode = nodes.find((n) => n.id === sel) || null

  const handleRun = () => {
    if (!activeTask) return
    if (isRunning) {
      stopTask(activeTask.id)
    } else {
      runTaskWorkflow(activeTask.id, 'manual')
    }
  }

  // Open the visual editor straight into AI Builder (chat) mode. Uses the
  // currently-selected workflow when present, otherwise scaffolds a blank one
  // first so the user always lands in a working chat. setEditingTaskId →
  // loadWorkflow resets chatMode to false, so we flip it back on right after.
  const handleGenerateWithAI = async () => {
    let taskId = activeTask?.id || null
    if (!taskId) {
      if (!activeProjectPath) return
      await handleCreate()
      taskId = useTaskStore.getState().selectedTaskId
    }
    if (!taskId) return
    setEditingTaskId(taskId)
    useWorkflowStore.setState({ chatMode: true })
  }

  const handleCreate = async () => {
    if (!activeProjectPath) return
    // No window.prompt (disabled in Electron). Just create with a default
    // name; user renames inline by double-clicking the canvas title.
    const finalTitle = `Workflow ${tasks.length + 1}`
    try {
      await addTask({
        title: finalTitle,
        description: '',
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        integrations: [],
        status: 'idle',
        progress: 0,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastError: null,
        workflow: { nodes: [], edges: [] },
      } as any)
      // Auto-select the new task (it's appended to the end of tasks[])
      const created = useTaskStore.getState().tasks.find((t) => t.title === finalTitle && (!t.runs || t.runs.length === 0))
      if (created) {
        selectTask(created.id)
        // Drop the user straight into rename mode so they can name it
        setIsRenaming(true)
        requestAnimationFrame(() => {
          renameInputRef.current?.focus()
          renameInputRef.current?.select()
        })
      }
    } catch (e) {
      console.error('[WorkflowsPage] addTask failed', e)
    }
  }

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((t) => t.title.toLowerCase().includes(q))
  }, [tasks, search])

  return (
    <div className="wf">
      {/* Workflows list — pick / create / search */}
      <div className="panel" style={{ width: 240 }}>
        <div className="panel-head">
          <div className="panel-title">
            <span>Workflows</span>
            <button
              type="button"
              className="add"
              onClick={handleCreate}
              disabled={!activeProjectPath}
              title="New workflow"
            >
              <IconPlus size={14} />
            </button>
          </div>
          <div className="panel-search">
            <IconSearch size={14} />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="panel-body">
          {filteredTasks.map((t) => {
            const isActive = activeTask?.id === t.id
            const isRunningRow = !!activeExecutions[t.id]
            const dot = isRunningRow
              ? 'dot-run'
              : t.status === 'failed'
                ? 'dot-err'
                : t.schedule.enabled
                  ? 'dot-ok'
                  : 'dot-idle'
            const sub = t.schedule.enabled
              ? `scheduled · ${t.schedule.interval}`
              : `manual · ${t.status}`
            return (
              <div
                key={t.id}
                className={'list-item' + (isActive ? ' active' : '')}
                style={{ position: 'relative' }}
              >
                <button
                  type="button"
                  onClick={() => selectTask(t.id)}
                  title={t.description || t.title}
                  className="row"
                  style={{
                    flex: 1, minWidth: 0, gap: 10,
                    background: 'none', border: 'none', color: 'inherit',
                    textAlign: 'left', cursor: 'pointer', padding: 0,
                  }}
                >
                  <span className={'li-dot ' + dot} />
                  <div className="li-main">
                    <div className="li-name">{t.title}</div>
                    <div className="li-sub">{sub}</div>
                  </div>
                  {t.runs && t.runs.length > 0 && (
                    <span className="li-badge">{t.runs.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  className="btn icon sm ghost wf-row-del"
                  title="Delete workflow"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Delete workflow "${t.title}"?`)) {
                      void removeTask(t.id)
                    }
                  }}
                >
                  <IconTrash size={12} />
                </button>
              </div>
            )
          })}

          {tasks.length === 0 && activeProjectPath && (
            <div className="muted" style={{ padding: '12px 8px', fontSize: 11.5, textAlign: 'center' }}>
              No workflows yet.<br />
              Use “Turn into workflow” in the chat header to save a conversation as one, or click + above.
            </div>
          )}
          {tasks.length > 0 && filteredTasks.length === 0 && (
            <div className="muted" style={{ padding: '12px 8px', fontSize: 11.5, textAlign: 'center' }}>
              No workflows match “{search}”.
            </div>
          )}
          {!activeProjectPath && (
            <div className="muted" style={{ padding: '12px 8px', fontSize: 11.5, textAlign: 'center' }}>
              Open a project to manage workflows.
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="wf-canvas">
        <div className="wf-toolbar">
          <div className="main-title" style={{ fontSize: 13.5 }}>
            <IconWorkflow size={16} style={{ color: 'var(--ink-3)' }} />
            {activeTask ? (
              isRenaming ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  defaultValue={activeTask.title}
                  className="rename-input"
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== activeTask.title) {
                      void updateTask(activeTask.id, { title: next })
                    }
                    setIsRenaming(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      ;(e.target as HTMLInputElement).blur()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setIsRenaming(false)
                    }
                  }}
                />
              ) : (
                <span
                  onDoubleClick={() => {
                    setIsRenaming(true)
                    requestAnimationFrame(() => {
                      renameInputRef.current?.focus()
                      renameInputRef.current?.select()
                    })
                  }}
                  title="Double-click to rename"
                  style={{ cursor: 'text' }}
                >
                  {activeTask.title}
                </span>
              )
            ) : (
              <span style={{ color: 'var(--muted)' }}>No workflow selected</span>
            )}
            {activeTask && !isRenaming && (
              <span className="tag ok">
                <span className="li-dot dot-ok" style={{ width: 6, height: 6 }} />
                {activeTask.schedule.enabled ? 'enabled' : activeTask.status}
              </span>
            )}
          </div>
          {activeTask && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                className="btn sm"
                onClick={() => setEditingTaskId(activeTask.id)}
                title="Open the visual node editor"
              >
                <IconPen size={13} />
                Edit nodes
              </button>
              <button
                className="btn sm ghost"
                onClick={handleGenerateWithAI}
                disabled={!isPro}
                title={isPro ? 'Build this workflow with the AI chat builder' : 'AI Builder requires a Pro plan'}
              >
                <IconSpark size={14} />
                Generate with AI
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  className={'btn sm' + (activeTask.schedule.enabled ? ' primary' : '')}
                  onClick={() => setShowSchedule((v) => !v)}
                  title="Configure run schedule"
                >
                  <IconClock size={14} />
                  Schedule
                </button>
                {showSchedule && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                      onClick={() => setShowSchedule(false)}
                    />
                    <div
                      style={{
                        position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 50,
                        width: 248, padding: 12,
                        background: 'var(--panel)', border: '1px solid var(--line)',
                        borderRadius: 'var(--r-sm)', boxShadow: '0 12px 32px -8px rgba(0,0,0,0.6)',
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--ink-2)', marginBottom: 10 }}>
                        Run schedule
                      </div>
                      <div className="field" style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', marginBottom: 5 }}>
                          Interval
                        </label>
                        <select
                          value={activeTask.schedule.interval}
                          onChange={(e) => {
                            const next = e.target.value as ScheduleInterval
                            void updateSchedule(activeTask.id, {
                              interval: next,
                              // Manual can't be "enabled"; auto-disable when switching to it.
                              ...(next === 'manual' ? { enabled: false } : {}),
                            })
                          }}
                          className="control"
                          style={{ width: '100%', cursor: 'pointer' }}
                        >
                          {SCHEDULE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <label
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 8, fontSize: 11.5, color: 'var(--ink-2)',
                          cursor: activeTask.schedule.interval === 'manual' ? 'not-allowed' : 'pointer',
                          opacity: activeTask.schedule.interval === 'manual' ? 0.5 : 1,
                        }}
                      >
                        Enable schedule
                        <input
                          type="checkbox"
                          checked={activeTask.schedule.enabled}
                          disabled={activeTask.schedule.interval === 'manual'}
                          onChange={(e) =>
                            // Pass interval alongside enabled so updateSchedule's
                            // nextRunAt recompute branch fires when toggling on.
                            void updateSchedule(activeTask.id, {
                              enabled: e.target.checked,
                              interval: activeTask.schedule.interval,
                            })
                          }
                        />
                      </label>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.4 }}>
                        {activeTask.schedule.interval === 'manual'
                          ? 'Runs only when triggered manually.'
                          : activeTask.schedule.enabled
                            ? `Runs ${(SCHEDULE_OPTIONS.find((o) => o.value === activeTask.schedule.interval)?.label || activeTask.schedule.interval).toLowerCase()} automatically.`
                            : 'Schedule is configured but paused. Toggle on to start.'}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button
                className="btn sm primary"
                onClick={handleRun}
              >
                {isRunning ? <IconStop size={13} /> : <IconPlay size={13} />}
                {isRunning ? 'Running…' : 'Run'}
              </button>
              <button
                type="button"
                className="btn sm ghost icon"
                title="Delete workflow"
                onClick={() => {
                  if (window.confirm(`Delete workflow "${activeTask.title}"?`)) {
                    void removeTask(activeTask.id)
                  }
                }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          )}
        </div>

        {!activeTask && (
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 14, textAlign: 'center', padding: 32, zIndex: 5,
            }}
          >
            <div style={{
              width: 60, height: 60, borderRadius: 18,
              background: 'var(--surface)', border: '1px solid var(--line)',
              display: 'grid', placeItems: 'center',
            }}>
              <IconWorkflow size={28} style={{ color: 'var(--ink-3)' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink-2)', margin: 0 }}>
                {tasks.length === 0 ? 'No workflows yet' : 'Pick a workflow'}
              </h3>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, maxWidth: 320 }}>
                {tasks.length === 0
                  ? 'Save a chat as a workflow from the chat header, or create a blank one with + in the left panel.'
                  : 'Select one from the left panel to view its graph.'}
              </p>
            </div>
            {tasks.length === 0 && activeProjectPath && (
              <button type="button" className="btn primary" onClick={handleCreate}>
                <IconPlus size={14} /> New workflow
              </button>
            )}
          </div>
        )}

        {activeTask && nodes.length === 0 && (
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 14, textAlign: 'center', padding: 32, zIndex: 5,
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'var(--surface)', border: '1px dashed var(--line-3)',
              display: 'grid', placeItems: 'center',
            }}>
              <IconWorkflow size={22} style={{ color: 'var(--ink-3)' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink-2)', margin: 0 }}>
                Empty workflow
              </h3>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, maxWidth: 340 }}>
                Open the editor to add steps, or save a chat as a workflow from the chat header
                to scaffold one from a real conversation.
              </p>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => setEditingTaskId(activeTask.id)}
            >
              <IconPen size={14} />
              Edit nodes
            </button>
          </div>
        )}

        <div className="wf-stage" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
          <svg className="wf-edges" width={680} height={Math.max(640, (nodes[nodes.length - 1]?.y || 0) + 200)}>
            {edges.map((e) => (
              <g key={e.id}>
                <path d={edgePath(e.from, e.to)} className={edgeLit(e) ? 'lit' : ''} />
                {e.label && (
                  <text className="edge-lbl" x={e.lx} y={e.ly}>{e.label}</text>
                )}
              </g>
            ))}
          </svg>
          {nodes.map((n) => {
            const k = NODE_KINDS[n.kind]
            const state = nodeState(n.id)
            return (
              <div
                key={n.id}
                className={`wnode ${state}${sel === n.id ? ' sel' : ''}`}
                style={{ left: n.x, top: n.y }}
                onClick={() => setSel(n.id)}
              >
                {n.kind !== 'Schedule' && <span className="port in" />}
                <div className="wnode-head">
                  <div className="wnode-ic" style={{ background: k.color + '22', color: k.color }}>
                    <k.Icon size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="wnode-tt">{n.title}</div>
                    <div className="wnode-kind">{n.kind}</div>
                  </div>
                  {state === 'done' && (
                    <span style={{ color: 'var(--ok)' }}>
                      <IconCheckSm size={15} />
                    </span>
                  )}
                </div>
                <div className="wnode-body">{n.body}</div>
                <div className="wnode-foot">
                  <IconCpu size={11} />
                  {n.foot}
                </div>
                {n.branch ? (
                  <>
                    <span className="port yes" style={{ background: '#3ecf8e', borderColor: '#3ecf8e' }} />
                    <span className="port no" style={{ background: '#f6b73c', borderColor: '#f6b73c' }} />
                  </>
                ) : (
                  <span className="port out" />
                )}
              </div>
            )
          })}
        </div>

        <div className="wf-zoom">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>
            <IconZoomOut size={15} />
          </button>
          <span className="zl">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))}>
            <IconZoomIn size={15} />
          </button>
          <button onClick={() => setZoom(0.82)} title="Fit">
            <IconFit size={15} />
          </button>
        </div>
      </div>

      {/* Inspector — only shown when a workflow is selected */}
      {activeTask && <div className="wf-inspect">
        <div className="insp-head">{selNode ? `${selNode.kind} node` : 'Inspector'}</div>
        <div className="insp-body scroll">
          {selNode ? (
            <>
              <div className="field">
                <label>Label</label>
                <div className="control">{selNode.title}</div>
              </div>
              {selNode.kind === 'Agent' && (
                <>
                  <div className="field">
                    <label>Assigned agent</label>
                    <div className="control">
                      {selNode.foot || '—'}
                    </div>
                  </div>
                  <div className="field">
                    <label>Model</label>
                    <div className="control">
                      <IconCpu size={14} style={{ color: 'var(--muted)' }} />
                      {selNode.foot || 'claude-sonnet-4.6'}
                    </div>
                  </div>
                  <div className="field">
                    <label>Instruction</label>
                    <textarea className="control" readOnly defaultValue={selNode.body} />
                  </div>
                </>
              )}
              {selNode.kind === 'Condition' && (
                <div className="field">
                  <label>Expression</label>
                  <div className="control" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                    {selNode.body}
                  </div>
                </div>
              )}
              {selNode.kind === 'MCP' && (
                <div className="field">
                  <label>Server</label>
                  <div className="control">
                    <span className="li-dot dot-ok" style={{ width: 7, height: 7 }} />
                    {selNode.foot || 'mcp'}
                  </div>
                </div>
              )}
              <div className="field">
                <label>On error</label>
                <div className="control">Retry 2× then halt</div>
              </div>
              <div className="divider" />
              <div className="wrap-flex">
                <button className="btn sm ghost">
                  <IconCopy size={14} />
                  Duplicate
                </button>
                <button className="btn sm ghost" style={{ color: 'var(--err)' }}>
                  <IconTrash size={14} />
                  Delete
                </button>
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>
              Select a node to edit its configuration.
            </div>
          )}
        </div>
      </div>}

    </div>
  )
}
