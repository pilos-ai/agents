import { useEffect, useMemo } from 'react'
import { Icon } from '../../common/Icon'
import { GradientAvatar } from '../components/GradientAvatar'
import { StatusDot } from '../components/StatusDot'
import { ActiveTaskCard } from '../components/ActiveTaskCard'
import { useProjectStore } from '../../../store/useProjectStore'
import { useConversationStore } from '../../../store/useConversationStore'
import { useAppStore } from '../../../store/useAppStore'
import { useAnalyticsStore, computeSummary } from '../../../store/useAnalyticsStore'
import { useTaskStore } from '../../../store/useTaskStore'
import { api } from '../../../api'
import type { AgentDefinition } from '../../../types'

// ── Agent Status Helpers ──

type AgentStatus = 'active' | 'busy' | 'idle'

const statusConfig: Record<AgentStatus, { label: string; bg: string; text: string; dot: 'green' | 'orange' | 'gray' }> = {
  active: { label: 'ACTIVE', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'green' },
  busy: { label: 'BUSY', bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'orange' },
  idle: { label: 'IDLE', bg: 'bg-zinc-700/30', text: 'text-zinc-500', dot: 'gray' },
}

const agentModels = ['Claude 3.5 Sonnet', 'Claude 3 Haiku', 'Claude 3 Opus', 'Claude 3.5 Sonnet']
const agentTasks = [
  '"Optimizing the database query layer for the core microservice..."',
  '"Running integration tests for PR #492. Found 2 potential memory leaks."',
  'No active tasks. Last active 2 hours ago.',
  '"Composing visual design tokens for the landing page refresh..."',
]

function AgentCard({ agent, index, status }: { agent: AgentDefinition; index: number; status: AgentStatus }) {
  const setActiveView = useAppStore((s) => s.setActiveView)
  const cfg = statusConfig[status]
  const model = agentModels[index % agentModels.length]
  const task = agentTasks[index % agentTasks.length]

  return (
    <button
      onClick={() => setActiveView('terminal')}
      className="w-full p-4 bg-pilos-card border border-pilos-border rounded-xl hover:border-zinc-600 transition-all text-left"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <GradientAvatar gradient={agent.color} icon={agent.icon} size="md" />
          <div>
            <h4 className="text-sm font-bold text-white">{agent.name}</h4>
            <p className="text-[10px] text-zinc-600">{model}</p>
          </div>
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>

      <p className="text-xs text-zinc-400 italic leading-relaxed mb-3 line-clamp-2">{task}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center">
            <Icon icon="lucide:plug" className="text-zinc-600 text-[10px]" />
          </div>
        </div>
        <Icon icon="lucide:chevron-right" className="text-zinc-700 text-xs" />
      </div>
    </button>
  )
}

// ── Mini Bar Chart ──

function MiniBarChart() {
  const bars = [40, 65, 55, 80, 70, 90, 75]
  return (
    <div className="flex items-end gap-1 h-10">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-3 bg-blue-500/30 rounded-sm transition-all"
          style={{ height: `${h}%` }}
        >
          <div
            className="w-full bg-blue-500 rounded-sm"
            style={{ height: `${Math.max(30, h - 20)}%`, marginTop: 'auto' }}
          />
        </div>
      ))}
    </div>
  )
}

// ── Context Visualization ──

function ContextVisualization() {
  return (
    <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-white">Context Visualization</h3>
        <Icon icon="lucide:maximize-2" className="text-zinc-700 text-xs" />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-zinc-600" />
          <span className="text-[10px] text-zinc-500">User Prompt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-orange-500/60" />
          <span className="text-[10px] text-zinc-500">System</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" />
          <span className="text-[10px] text-zinc-500">Tools</span>
        </div>
      </div>

      {/* Diagram */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
            <Icon icon="lucide:user" className="text-blue-400 text-sm" />
          </div>
          <span className="text-[9px] text-zinc-600">Knowledge<br/>Retrieval</span>
        </div>

        <div className="flex-1 flex items-center">
          <div className="flex-1 h-px border-t border-dashed border-zinc-700" />
          <div className="px-2 py-1 bg-zinc-800 border border-pilos-border rounded text-[9px] font-mono text-zinc-400 mx-1">
            EMBEDDING
          </div>
          <div className="flex-1 h-px border-t border-dashed border-zinc-700" />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
            <Icon icon="lucide:brain" className="text-orange-400 text-sm" />
          </div>
          <span className="text-[9px] text-zinc-600">Top 3 Vectors<br/>(0.92 cosine sim)</span>
        </div>
      </div>

      {/* Colored bars */}
      <div className="space-y-1.5 mb-3">
        <div className="h-1.5 w-full bg-blue-500/40 rounded-full" />
        <div className="h-1.5 w-4/5 bg-emerald-500/40 rounded-full" />
        <div className="h-1.5 w-3/5 bg-orange-500/40 rounded-full" />
      </div>

      <p className="text-[10px] text-zinc-600">
        <span className="text-zinc-500">context compressed</span> (ratio 2.4:1)
      </p>
    </div>
  )
}

// ── Recent Project Card (no-project state) ──

function RecentProjectCard({ path, name }: { path: string; name: string }) {
  const openProject = useProjectStore((s) => s.openProject)

  return (
    <button
      onClick={() => openProject(path)}
      className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/50 rounded-lg transition-colors text-left"
    >
      <Icon icon="lucide:folder" className="text-zinc-600" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-300 truncate">{name}</p>
        <p className="text-[10px] text-zinc-600 truncate">{path}</p>
      </div>
      <Icon icon="lucide:chevron-right" className="text-zinc-700 text-xs" />
    </button>
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

  // No project state
  if (!hasProject) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-8 max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600/20 to-indigo-700/20 rounded-2xl flex items-center justify-center border border-blue-500/20">
              <Icon icon="lucide:cpu" className="text-blue-400 text-3xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Welcome to Pilos Agents</h1>
              <p className="text-sm text-zinc-400">Open a project to get started with your AI agent swarm</p>
            </div>
          </div>
          <div className="space-y-6">
            <button
              onClick={handleOpenProject}
              className="w-full p-6 bg-pilos-card border border-dashed border-zinc-700 rounded-xl hover:border-pilos-blue/50 transition-all text-center"
            >
              <Icon icon="lucide:folder-open" className="text-zinc-600 text-2xl mb-2" />
              <h3 className="text-sm font-bold text-white mb-1">Open a Project</h3>
              <p className="text-xs text-zinc-500">Select a directory to start working with agents</p>
            </button>
            {recentProjects.length > 0 && (
              <div>
                <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-1">Recent Projects</h2>
                <div className="bg-pilos-card border border-pilos-border rounded-xl overflow-hidden">
                  {recentProjects.slice(0, 5).map((p) => (
                    <RecentProjectCard key={p.path} path={p.path} name={p.name} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-6">
            {/* Hero Banner */}
            <div className="relative p-6 bg-gradient-to-br from-pilos-card to-zinc-900 border border-pilos-border rounded-2xl mb-6 overflow-hidden">
              {/* Decorative background pattern */}
              <div className="absolute top-0 right-0 w-64 h-64 opacity-[0.03]">
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  <circle cx="100" cy="100" r="80" stroke="white" fill="none" strokeWidth="0.5" />
                  <circle cx="100" cy="100" r="60" stroke="white" fill="none" strokeWidth="0.5" />
                  <circle cx="100" cy="100" r="40" stroke="white" fill="none" strokeWidth="0.5" />
                </svg>
              </div>

              <div className="relative">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-4">
                  <StatusDot color="green" pulse />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Built on Claude Code CLI</span>
                </div>

                <h1 className="text-3xl font-bold text-white mb-2 leading-tight">
                  The Visual Layer for{' '}
                  <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                    Claude Code
                  </span>
                </h1>

                <p className="text-sm text-zinc-400 max-w-lg leading-relaxed">
                  Your multi-agent orchestration terminal is online.
                  Managing {agents.length} active instance{agents.length !== 1 ? 's' : ''} across{' '}
                  {Math.max(1, openProjects.length)} distinct workstream{openProjects.length !== 1 ? 's' : ''}.
                </p>
              </div>

              {/* Stats row */}
              <div className="relative grid grid-cols-3 gap-4 mt-6">
                <div className="p-3 bg-pilos-bg/50 border border-pilos-border rounded-lg">
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block mb-1">Active Tasks</span>
                  <span className="text-2xl font-bold text-white font-mono">{activeTasks || tasks.length}</span>
                </div>
                <div className="p-3 bg-pilos-bg/50 border border-pilos-border rounded-lg">
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block mb-1">Success Rate</span>
                  <span className="text-2xl font-bold text-white font-mono">{summary.successRate.toFixed(1)}%</span>
                </div>
                <div className="p-3 bg-pilos-bg/50 border border-pilos-border rounded-lg">
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block mb-1">Avg Latency</span>
                  <span className="text-2xl font-bold text-white font-mono">
                    {summary.avgResponseTime > 0 ? `${Math.round(summary.avgResponseTime)}ms` : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Active Tasks */}
            {runningTasks.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Active Tasks</h2>
                  <button
                    onClick={() => setActiveView('tasks')}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  >
                    View All
                    <Icon icon="lucide:chevron-right" className="text-[10px]" />
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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

            {/* Active Agents */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Active Agents</h2>
                <button
                  onClick={() => setActiveView('config')}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                >
                  <Icon icon="lucide:plus" className="text-[10px]" />
                  Spawn Agent
                </button>
              </div>

              {agents.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {agents.map((agent, i) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      index={i}
                      status={getAgentStatus(agent, i)}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-pilos-card border border-pilos-border rounded-xl text-center">
                  <Icon icon="lucide:bot" className="text-zinc-700 text-2xl mb-2" />
                  <h3 className="text-sm font-medium text-zinc-400 mb-1">No agents configured</h3>
                  <p className="text-xs text-zinc-600">Configure agents in the Agent Swarm page to enable team mode</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="w-[340px] border-l border-pilos-border bg-pilos-bg overflow-y-auto custom-scrollbar flex-shrink-0">
          <div className="p-4 space-y-4">
            {/* Live Monitoring */}
            <div className="p-4 bg-pilos-card border border-pilos-border rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:activity" className="text-orange-400 text-sm" />
                  <h3 className="text-xs font-bold text-white">Live Monitoring</h3>
                </div>
                <button className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">Details</button>
              </div>

              {/* Token Throughput */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-zinc-500">Token Throughput</span>
                  <span className="text-xs font-bold text-white font-mono">
                    {summary.totalTokens > 0 ? `${(summary.totalTokens / Math.max(summary.totalSessions, 1) / 60).toFixed(1)}k/min` : '0/min'}
                  </span>
                </div>
                <MiniBarChart />
              </div>

              {/* Metrics */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span className="text-xs text-zinc-400">Memory Load</span>
                  </div>
                  <span className="text-xs font-mono text-white">1.2 <span className="text-zinc-600">GB</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    <span className="text-xs text-zinc-400">CPU Usage</span>
                  </div>
                  <span className="text-xs font-mono text-white">14.2<span className="text-zinc-600">%</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-xs text-zinc-400">MCP Latency</span>
                  </div>
                  <span className="text-xs font-mono text-white">12<span className="text-zinc-600">ms</span></span>
                </div>
              </div>
            </div>

            {/* Context Visualization */}
            <ContextVisualization />
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="h-8 border-t border-pilos-border bg-pilos-card/50 flex items-center px-4 flex-shrink-0">
        <StatusDot color={isStreaming ? 'orange' : 'green'} pulse={isStreaming} />
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider ml-2">
          {isStreaming
            ? `Processing · Agent ${currentAgentName || 'unknown'} active`
            : 'All systems nominal. Waiting for instruction.'}
        </span>
      </div>
    </div>
  )
}
