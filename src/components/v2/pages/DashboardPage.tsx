import { useEffect, useMemo } from 'react'
import { Icon } from '../../common/Icon'
import { GradientAvatar } from '../components/GradientAvatar'
import { ActiveTaskCard } from '../components/ActiveTaskCard'
import { useProjectStore } from '../../../store/useProjectStore'
import { useConversationStore } from '../../../store/useConversationStore'
import { useAppStore } from '../../../store/useAppStore'
import { useAnalyticsStore, computeSummary } from '../../../store/useAnalyticsStore'
import { useTaskStore } from '../../../store/useTaskStore'
import { api } from '../../../api'
import { AVAILABLE_TOOLS } from '../../../data/agent-templates'
import type { AgentDefinition } from '../../../types'

// ── Agent status helpers ──

type AgentStatus = 'active' | 'busy' | 'idle'

const STATUS_TAG: Record<AgentStatus, string> = {
  active: 'tag ok',
  busy: 'tag warn',
  idle: 'tag',
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  active: 'active',
  busy: 'busy',
  idle: 'idle',
}

function AgentCard({ agent, status }: { agent: AgentDefinition; status: AgentStatus }) {
  const setActiveView = useAppStore((s) => s.setActiveView)

  return (
    <button
      type="button"
      onClick={() => setActiveView('chat')}
      className="tile hover"
      style={{ padding: 14, width: '100%', textAlign: 'left' }}
    >
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <GradientAvatar gradient={agent.color} icon={agent.icon} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
            <div className="tile-nm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.name}
            </div>
            <span className={STATUS_TAG[status]}>{STATUS_LABEL[status]}</span>
          </div>
          <div className="tile-desc">{agent.role}</div>
        </div>
      </div>

      {agent.expertise.length > 0 && (
        <div className="wrap-flex" style={{ marginTop: 12 }}>
          {agent.expertise.slice(0, 3).map((e) => (
            <span key={e} className="tag" style={{ fontFamily: 'inherit', fontSize: 10 }}>
              {e}
            </span>
          ))}
        </div>
      )}

      <div className="tile-foot">
        <div className="row" style={{ gap: 4 }}>
          {(agent.capabilities?.tools || []).slice(0, 4).map((toolId) => {
            const tool = AVAILABLE_TOOLS.find((t) => t.id === toolId)
            return (
              <div
                key={toolId}
                title={tool?.name || toolId}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--muted)',
                }}
              >
                <Icon icon={tool?.icon || 'lucide:plug'} className="text-[11px]" />
              </div>
            )
          })}
        </div>
        <Icon icon="lucide:chevron-right" className="text-[14px]" style={{ color: 'var(--muted)' }} />
      </div>
    </button>
  )
}

// ── Recent project row (no-project state) ──

function RecentProjectRow({ path, name }: { path: string; name: string }) {
  const openProject = useProjectStore((s) => s.openProject)
  const removeRecentProject = useProjectStore((s) => s.removeRecentProject)

  return (
    <div
      className="list-item"
      style={{ paddingRight: 8 }}
    >
      <button
        type="button"
        onClick={() => openProject(path)}
        className="row"
        style={{
          gap: 10,
          flex: 1,
          minWidth: 0,
          background: 'none',
          border: 'none',
          color: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <Icon icon="lucide:folder" className="text-[14px]" style={{ color: 'var(--muted)', flex: 'none' }} />
        <div className="li-main">
          <div className="li-name">{name}</div>
          <div className="li-sub" style={{ fontFamily: 'var(--mono)' }}>{path}</div>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          removeRecentProject(path)
        }}
        className="btn icon sm ghost"
        title="Remove from recent"
        style={{ marginLeft: 4 }}
      >
        <Icon icon="lucide:x" className="text-[12px]" />
      </button>
    </div>
  )
}

// ── Main Dashboard ──

export default function DashboardPage() {
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const openProject = useProjectStore((s) => s.openProject)
  const hasActiveSession = useConversationStore((s) => s.hasActiveSession)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const currentAgentName = useConversationStore((s) => s.streaming.currentAgentName)
  const analyticsEntries = useAnalyticsStore((s) => s.entries)
  const summary = useMemo(() => computeSummary(analyticsEntries), [analyticsEntries])
  const tasks = useTaskStore((s) => s.tasks)
  const activeExecutions = useTaskStore((s) => s.activeExecutions)
  const setActiveView = useAppStore((s) => s.setActiveView)

  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const agents = activeTab?.agents || []
  const activeTasks = tasks.filter((t) => t.status === 'running' || t.status === 'queued').length
  const runningTasks = tasks.filter((t) => t.status === 'running' || activeExecutions[t.id])

  useEffect(() => {
    useAnalyticsStore.getState().loadEntries()
  }, [])

  const handleOpenProject = async () => {
    const dir = await api.dialog.openDirectory()
    if (dir) openProject(dir)
  }

  const hasProject = !!activeProjectPath

  const getAgentStatus = (agent: AgentDefinition, idx: number): AgentStatus => {
    if (isStreaming && currentAgentName === agent.name) return 'busy'
    if (hasActiveSession && idx < 2) return 'active'
    return 'idle'
  }

  // ─── No-project state ───
  if (!hasProject) {
    return (
      <div className="page-scroll">
        {/* Page header */}
        <div className="main-head">
          <div className="main-title">
            Dashboard
            <span className="main-sub">Open a project to begin</span>
          </div>
        </div>

        <div className="pad">
          {/* Welcome card */}
          <div className="tile" style={{ padding: 22, marginBottom: 18 }}>
            <div className="row" style={{ gap: 14 }}>
              <div className="rail-logo" style={{ width: 48, height: 48 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  Welcome to Pilos Agents
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  The visual layer for Claude Code. Open a project to get started.
                </div>
              </div>
              <button className="btn primary" onClick={handleOpenProject}>
                <Icon icon="lucide:folder-open" className="text-[15px]" />
                Open project
              </button>
            </div>
          </div>

          {recentProjects.length > 0 && (
            <>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  padding: '0 4px 8px',
                }}
              >
                Recent projects
              </div>
              <div className="tile" style={{ padding: 6 }}>
                {recentProjects.slice(0, 5).map((p) => (
                  <RecentProjectRow key={p.path} path={p.path} name={p.name} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ─── Active project state ───
  return (
    <div className="page-scroll">
      {/* Page header */}
      <div className="main-head">
        <div className="main-title">
          Dashboard
          <span className="main-sub">
            {activeTab?.projectName || 'Project'} · {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="main-actions">
          <button className="btn sm ghost" onClick={() => setActiveView('config')}>
            <Icon icon="lucide:plus" className="text-[13px]" />
            Spawn agent
          </button>
          <button className="btn sm" onClick={handleOpenProject}>
            <Icon icon="lucide:folder-open" className="text-[13px]" />
            Open project
          </button>
        </div>
      </div>

      <div className="pad">
        {/* Quick stats */}
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 18 }}>
          <div className="stat">
            <div className="sk">
              <Icon icon="lucide:list-checks" className="text-[14px]" />
              Active tasks
            </div>
            <div className="sv">
              {activeTasks || tasks.length}
              <span className="unit">total</span>
            </div>
          </div>
          <div className="stat">
            <div className="sk">
              <Icon icon="lucide:trending-up" className="text-[14px]" />
              Success rate
            </div>
            <div className="sv">
              {summary.successRate.toFixed(1)}
              <span className="unit">%</span>
            </div>
          </div>
          <div className="stat">
            <div className="sk">
              <Icon icon="lucide:clock" className="text-[14px]" />
              Avg latency
            </div>
            <div className="sv">
              {summary.avgResponseTime > 0 ? Math.round(summary.avgResponseTime) : '—'}
              {summary.avgResponseTime > 0 && <span className="unit">ms</span>}
            </div>
          </div>
        </div>

        {/* Active tasks */}
        {runningTasks.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div
              className="row"
              style={{ justifyContent: 'space-between', padding: '0 4px 10px' }}
            >
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                }}
              >
                Active tasks
              </div>
              <button
                onClick={() => setActiveView('workflows')}
                className="btn sm ghost"
              >
                View all
                <Icon icon="lucide:chevron-right" className="text-[12px]" />
              </button>
            </div>
            <div className="grid-cards gc-2">
              {runningTasks.map((task) => (
                <ActiveTaskCard
                  key={task.id}
                  task={task}
                  execution={activeExecutions[task.id]}
                />
              ))}
            </div>
          </div>
        )}

        {/* Active agents */}
        <div style={{ marginBottom: 18 }}>
          <div
            className="row"
            style={{ justifyContent: 'space-between', padding: '0 4px 10px' }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              Active agents
            </div>
            <button
              onClick={() => setActiveView('config')}
              className="btn sm ghost"
            >
              <Icon icon="lucide:plus" className="text-[12px]" />
              Spawn agent
            </button>
          </div>

          {agents.length > 0 ? (
            <div className="grid-cards gc-2">
              {agents.map((agent, i) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  status={getAgentStatus(agent, i)}
                />
              ))}
            </div>
          ) : (
            <div className="tile" style={{ padding: 22, textAlign: 'center' }}>
              <Icon
                icon="lucide:bot"
                className="text-[22px]"
                style={{ color: 'var(--muted)', display: 'block', margin: '0 auto 8px' }}
              />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
                No agents configured
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Configure agents in the Agents page to enable team mode.
              </div>
            </div>
          )}
        </div>

        {/* Status footer */}
        <div
          className="row"
          style={{
            gap: 10,
            marginTop: 18,
            padding: '10px 14px',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-sm)',
          }}
        >
          <span
            className={`li-dot ${isStreaming ? 'dot-run' : 'dot-ok'}`}
            style={{ width: 7, height: 7 }}
          />
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            {isStreaming
              ? `Processing · Agent ${currentAgentName || 'unknown'} active`
              : 'All systems nominal. Waiting for instruction.'}
          </span>
        </div>
      </div>
    </div>
  )
}
