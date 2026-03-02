import { useState, useCallback, useRef, useEffect } from 'react'
import { Icon } from '../../common/Icon'
import { api } from '../../../api'
import { useProjectStore } from '../../../store/useProjectStore'
import { useTaskStore } from '../../../store/useTaskStore'
import { useAppStore } from '../../../store/useAppStore'
import { extractJson, hydrateToolNodes, validateAiPromptNodes, generateWorkflowSummaryLocally } from '../../../utils/workflow-ai'
import { normalizeNodeTypes, useWorkflowStore } from '../../../store/useWorkflowStore'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { MCP_SERVER_TEMPLATES } from '../../../data/mcp-server-templates'
import { ROLES, buildWorkspaceGenerationPrompt } from '../../../data/role-definitions'
import type { RoleDefinition, UserRole } from '../../../data/role-definitions'
import type { ClaudeEvent } from '../../../types'
import type { WorkflowNodeData } from '../../../types/workflow'
import type { Node, Edge } from '@xyflow/react'
import type { TaskPriority } from '../../../store/useTaskStore'

// ── Types ──

interface GeneratedTask {
  title: string
  description: string
  priority: TaskPriority
  workflow: {
    nodes: Node<WorkflowNodeData>[]
    edges: Edge[]
  }
  summary: string[]
  enabled: boolean
}

// ── Color Helpers ──

const ROLE_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  blue: { bg: 'bg-blue-500/5', border: 'border-blue-500/30 hover:border-blue-500/60', text: 'text-blue-400', icon: 'bg-blue-500/10' },
  emerald: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/30 hover:border-emerald-500/60', text: 'text-emerald-400', icon: 'bg-emerald-500/10' },
  purple: { bg: 'bg-purple-500/5', border: 'border-purple-500/30 hover:border-purple-500/60', text: 'text-purple-400', icon: 'bg-purple-500/10' },
  amber: { bg: 'bg-amber-500/5', border: 'border-amber-500/30 hover:border-amber-500/60', text: 'text-amber-400', icon: 'bg-amber-500/10' },
  orange: { bg: 'bg-orange-500/5', border: 'border-orange-500/30 hover:border-orange-500/60', text: 'text-orange-400', icon: 'bg-orange-500/10' },
  zinc: { bg: 'bg-zinc-500/5', border: 'border-zinc-500/30 hover:border-zinc-500/60', text: 'text-zinc-400', icon: 'bg-zinc-500/10' },
}

const PRIORITY_BADGE: Record<string, string> = {
  low: 'bg-zinc-700 text-zinc-400',
  medium: 'bg-blue-500/20 text-blue-400',
  high: 'bg-amber-500/20 text-amber-400',
  critical: 'bg-red-500/20 text-red-400',
}

// ── Step 1: Role Selection ──

function RoleSelectionStep({ onSelect }: { onSelect: (role: RoleDefinition, customDesc?: string) => void }) {
  const [selectedId, setSelectedId] = useState<UserRole | null>(null)
  const [customDesc, setCustomDesc] = useState('')
  const selected = ROLES.find((r) => r.id === selectedId)

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
            <Icon icon="lucide:rocket" className="text-blue-400 text-2xl" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Set Up Your Workspace</h1>
          <p className="text-sm text-zinc-500">Select your role and we'll generate tasks and workflows tailored to your work</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {ROLES.map((role) => {
            const c = ROLE_COLORS[role.color] || ROLE_COLORS.zinc
            const isSelected = selectedId === role.id
            return (
              <button
                key={role.id}
                onClick={() => setSelectedId(role.id)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? `${c.bg} border-${role.color}-500 shadow-lg`
                    : `bg-pilos-card ${c.border}`
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${c.icon} flex items-center justify-center mb-3`}>
                  <Icon icon={role.icon} className={`${c.text} text-lg`} />
                </div>
                <p className="text-sm font-bold text-white mb-1">{role.label}</p>
                <p className="text-[10px] text-zinc-500 leading-relaxed">{role.description}</p>
                {role.taskHints.length > 0 && isSelected && (
                  <div className="mt-3 space-y-1">
                    {role.taskHints.slice(0, 3).map((h, i) => (
                      <p key={i} className="text-[9px] text-zinc-600 truncate">
                        <span className={`${c.text} mr-1`}>-</span> {h.split(' — ')[0]}
                      </p>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {selectedId === 'custom' && (
          <div className="mb-6">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">
              Describe your role and the workflows you need
            </label>
            <textarea
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              placeholder="e.g. I'm a marketing manager who needs to track campaign tasks in Jira, send weekly reports to Slack, and monitor content deadlines..."
              rows={3}
              className="w-full px-3 py-2.5 bg-pilos-bg border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500 resize-none"
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => useAppStore.getState().completeWorkspaceSetup('skipped')}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={() => selected && onSelect(selected, selectedId === 'custom' ? customDesc : undefined)}
            disabled={!selected || (selectedId === 'custom' && !customDesc.trim())}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            Continue
            <Icon icon="lucide:arrow-right" className="text-sm" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lazy-load Jira store for OAuth connect ──

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

// ── Step 2: Integration Check ──

function IntegrationCheckStep({ role, onContinue, onBack }: {
  role: RoleDefinition
  onContinue: (integrations: string[]) => void
  onBack: () => void
}) {
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'

  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const addProjectMcpServer = useProjectStore((s) => s.addProjectMcpServer)
  const activeTab = openProjects.find((p) => p.projectPath === activeProjectPath)
  const mcpServers = activeTab?.mcpServers || []

  // Connection state
  const [checked, setChecked] = useState(false)
  const [jiraConnected, setJiraConnected] = useState(false)
  const [jiraConnecting, setJiraConnecting] = useState(false)

  const githubServer = mcpServers.find((s) => s.name.toLowerCase().includes('github'))
  const [githubConnected, setGithubConnected] = useState(!!githubServer?.enabled)
  const [showGithubSetup, setShowGithubSetup] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [githubConnecting, setGithubConnecting] = useState(false)

  const slackServer = mcpServers.find((s) => s.name.toLowerCase().includes('slack'))
  const [slackConnected, setSlackConnected] = useState(!!slackServer?.enabled)
  const [showSlackSetup, setShowSlackSetup] = useState(false)
  const [slackBotToken, setSlackBotToken] = useState('')
  const [slackTeamId, setSlackTeamId] = useState('')
  const [slackConnecting, setSlackConnecting] = useState(false)

  // Check Jira on mount
  useEffect(() => {
    loadJiraStore()
      .then((mod) => {
        if (mod) setJiraConnected(!!mod.useJiraStore.getState().connected)
      })
      .catch(() => {})
      .finally(() => setChecked(true))
  }, [])

  // Sync GitHub/Slack state when mcpServers change
  useEffect(() => {
    setGithubConnected(!!mcpServers.find((s) => s.name.toLowerCase().includes('github'))?.enabled)
    setSlackConnected(!!mcpServers.find((s) => s.name.toLowerCase().includes('slack'))?.enabled)
  }, [mcpServers])

  const handleJiraConnect = useCallback(async () => {
    const mod = await loadJiraStore()
    if (!mod) return
    setJiraConnecting(true)
    try {
      await mod.useJiraStore.getState().authorize()
      await mod.useJiraStore.getState().checkConnection()
      setJiraConnected(mod.useJiraStore.getState().connected)
    } catch {
      // cancelled
    } finally {
      setJiraConnecting(false)
    }
  }, [])

  const handleGithubConnect = useCallback(() => {
    if (!githubToken.trim() || !activeProjectPath) return
    setGithubConnecting(true)
    try {
      const tmpl = MCP_SERVER_TEMPLATES.find((t) => t.id === 'github')
      if (tmpl && tmpl.config.type === 'stdio') {
        addProjectMcpServer({
          id: crypto.randomUUID(),
          name: tmpl.name,
          icon: tmpl.icon,
          description: tmpl.description,
          enabled: true,
          config: {
            type: 'stdio',
            command: tmpl.config.command,
            args: tmpl.config.args,
            env: { ...tmpl.config.env, GITHUB_TOKEN: githubToken.trim() },
          },
        })
        setShowGithubSetup(false)
        setGithubToken('')
        setGithubConnected(true)
      }
    } finally {
      setGithubConnecting(false)
    }
  }, [githubToken, activeProjectPath, addProjectMcpServer])

  const handleSlackConnect = useCallback(() => {
    if (!slackBotToken.trim() || !slackTeamId.trim() || !activeProjectPath) return
    setSlackConnecting(true)
    try {
      const tmpl = MCP_SERVER_TEMPLATES.find((t) => t.id === 'slack')
      if (tmpl && tmpl.config.type === 'stdio') {
        addProjectMcpServer({
          id: crypto.randomUUID(),
          name: tmpl.name,
          icon: tmpl.icon,
          description: tmpl.description,
          enabled: true,
          config: {
            type: 'stdio',
            command: tmpl.config.command,
            args: tmpl.config.args,
            env: { ...tmpl.config.env, SLACK_BOT_TOKEN: slackBotToken.trim(), SLACK_TEAM_ID: slackTeamId.trim() },
          },
        })
        setShowSlackSetup(false)
        setSlackBotToken('')
        setSlackTeamId('')
        setSlackConnected(true)
      }
    } finally {
      setSlackConnecting(false)
    }
  }, [slackBotToken, slackTeamId, activeProjectPath, addProjectMcpServer])

  const connected = [
    ...(jiraConnected ? ['jira'] : []),
    ...(githubConnected ? ['github'] : []),
    ...(slackConnected ? ['slack'] : []),
  ]

  if (!checked) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Icon icon="lucide:loader-2" className="text-blue-400 text-2xl animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
            <Icon icon="lucide:plug-zap" className="text-emerald-400 text-2xl" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Your Integrations</h1>
          <p className="text-sm text-zinc-500">Connect services to power your workflows</p>
        </div>

        <div className="space-y-3 mb-8">
          {/* Jira — Pro only */}
          <div className={`rounded-xl border overflow-hidden ${jiraConnected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-pilos-card border-pilos-border'}`}>
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Icon icon="logos:jira" className="text-lg" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">Jira</p>
                  <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">Pro</span>
                </div>
                <p className="text-[10px] text-zinc-500">Atlassian issue tracking</p>
              </div>
              {jiraConnected ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                  <Icon icon="lucide:check-circle" className="text-xs" /> Connected
                </span>
              ) : (
                <button
                  onClick={isPro ? handleJiraConnect : undefined}
                  disabled={!isPro || jiraConnecting}
                  className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {jiraConnecting ? (
                    <><Icon icon="lucide:loader-2" className="text-xs animate-spin" /> Connecting...</>
                  ) : isPro ? (
                    'Connect'
                  ) : (
                    'Upgrade'
                  )}
                </button>
              )}
            </div>
          </div>

          {/* GitHub — all tiers */}
          <div className={`rounded-xl border overflow-hidden ${githubConnected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-pilos-card border-pilos-border'}`}>
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <Icon icon="logos:github-icon" className="text-lg" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">GitHub</p>
                <p className="text-[10px] text-zinc-500">Issues, PRs, code search</p>
              </div>
              {githubConnected ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                  <Icon icon="lucide:check-circle" className="text-xs" /> Connected
                </span>
              ) : !activeProjectPath ? (
                <span className="text-[10px] text-zinc-600">Open a project first</span>
              ) : (
                <button
                  onClick={() => setShowGithubSetup(!showGithubSetup)}
                  className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
            {showGithubSetup && !githubConnected && activeProjectPath && (
              <div className="border-t border-pilos-border px-4 pb-4 pt-3 space-y-3">
                <p className="text-[11px] text-zinc-500">
                  Create a <span className="text-zinc-300">Personal Access Token</span> at GitHub &gt; Settings &gt; Developer settings &gt; Tokens (classic) with <span className="text-zinc-300">repo</span> scope.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="flex-1 bg-zinc-900 border border-pilos-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                  />
                  <button
                    onClick={handleGithubConnect}
                    disabled={!githubToken.trim() || githubConnecting}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {githubConnecting ? <Icon icon="lucide:loader-2" className="text-xs animate-spin" /> : 'Connect'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Slack — all tiers */}
          <div className={`rounded-xl border overflow-hidden ${slackConnected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-pilos-card border-pilos-border'}`}>
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <Icon icon="logos:slack-icon" className="text-lg" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Slack</p>
                <p className="text-[10px] text-zinc-500">Team notifications</p>
              </div>
              {slackConnected ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                  <Icon icon="lucide:check-circle" className="text-xs" /> Connected
                </span>
              ) : !activeProjectPath ? (
                <span className="text-[10px] text-zinc-600">Open a project first</span>
              ) : (
                <button
                  onClick={() => setShowSlackSetup(!showSlackSetup)}
                  className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
            {showSlackSetup && !slackConnected && activeProjectPath && (
              <div className="border-t border-pilos-border px-4 pb-4 pt-3 space-y-3">
                <p className="text-[11px] text-zinc-500">
                  Create a Slack app at <span className="text-zinc-300">api.slack.com/apps</span>, add <span className="text-zinc-300">chat:write</span> + <span className="text-zinc-300">channels:read</span> scopes, then install to your workspace.
                </p>
                <div className="space-y-2">
                  <input
                    type="password"
                    value={slackBotToken}
                    onChange={(e) => setSlackBotToken(e.target.value)}
                    placeholder="xoxb-xxxxxxxxxxxx"
                    className="w-full bg-zinc-900 border border-pilos-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={slackTeamId}
                      onChange={(e) => setSlackTeamId(e.target.value)}
                      placeholder="Team ID (e.g. T01234567)"
                      className="flex-1 bg-zinc-900 border border-pilos-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                    />
                    <button
                      onClick={handleSlackConnect}
                      disabled={!slackBotToken.trim() || !slackTeamId.trim() || slackConnecting}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {slackConnecting ? <Icon icon="lucide:loader-2" className="text-xs animate-spin" /> : 'Connect'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-[10px] text-zinc-600 text-center mb-6">
          {connected.length > 0
            ? `Workflows will use ${connected.join(' + ')}. You can configure more in Settings later.`
            : 'No integrations connected. Workflows will use data processing and AI analysis.'}
        </p>

        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
            <Icon icon="lucide:arrow-left" className="text-xs" /> Back
          </button>
          <button
            onClick={() => onContinue(connected)}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-2"
          >
            Generate Workspace
            <Icon icon="lucide:sparkles" className="text-sm" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Generating ──

function GeneratingStep({ role, customDescription, integrations, onComplete, onError }: {
  role: RoleDefinition
  customDescription?: string
  integrations: string[]
  onComplete: (tasks: GeneratedTask[]) => void
  onError: (error: string) => void
}) {
  const [phase, setPhase] = useState('Starting AI session...')
  const sessionIdRef = useRef<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const activeProjectPath = useProjectStore.getState().activeProjectPath
    const jiraProjectKey = useWorkflowStore.getState().jiraProjectKey || undefined

    const prompt = buildWorkspaceGenerationPrompt(role, customDescription, integrations, jiraProjectKey)
    const sessionId = `workspace-gen-${crypto.randomUUID()}`
    sessionIdRef.current = sessionId

    let resultText = ''

    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      if (event.sessionId !== sessionId) return

      if (event.type === 'assistant') {
        setPhase('Designing workflows...')
        const msg = event.message as { content?: Array<{ type: string; text?: string }> }
        if (msg?.content) {
          const text = msg.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('')
          if (text) resultText = text
        }
      }

      if (event.type === 'content_block_delta') {
        setPhase('Building your workspace...')
        const delta = event.delta as { type: string; text?: string }
        if (delta?.type === 'text_delta' && delta.text) {
          resultText += delta.text
        }
      }

      if (event.type === 'session:error') {
        unsub()
        unsubRef.current = null
        sessionIdRef.current = null
        onError(`Session error: ${(event as Record<string, unknown>).error || 'Unknown error'}`)
        return
      }

      if (event.type === 'session:ended') {
        // Only treat as error if we haven't received a result yet
        if (sessionIdRef.current) {
          unsub()
          unsubRef.current = null
          sessionIdRef.current = null
          onError('Session ended unexpectedly. Please try again.')
        }
        return
      }

      if (event.type === 'result') {
        unsub()
        unsubRef.current = null
        sessionIdRef.current = null

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
            tasks: Array<{
              title: string
              description: string
              priority: string
              workflow: { nodes: unknown[]; edges: Edge[] }
            }>
          }

          if (!parsed.tasks || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
            throw new Error('No tasks generated')
          }

          setPhase('Processing results...')

          const generatedTasks: GeneratedTask[] = parsed.tasks.map((t) => {
            const typedNodes = normalizeNodeTypes(t.workflow.nodes as Array<Record<string, unknown>>)
            const hydratedNodes = hydrateToolNodes(typedNodes)
            const validatedNodes = validateAiPromptNodes(hydratedNodes, t.workflow.edges || [])
            const edges = (t.workflow.edges || []).map((e) => ({ ...e, type: e.type || 'dashed' }))
            const summary = generateWorkflowSummaryLocally(validatedNodes, edges)

            return {
              title: t.title,
              description: t.description,
              priority: (['low', 'medium', 'high', 'critical'].includes(t.priority) ? t.priority : 'medium') as TaskPriority,
              workflow: { nodes: validatedNodes, edges },
              summary,
              enabled: true,
            }
          })

          onComplete(generatedTasks)
        } catch (err) {
          onError(`Failed to parse workspace: ${err instanceof Error ? err.message : 'Invalid response'}`)
        }
      }
    })

    unsubRef.current = unsub

    api.claude.startSession(sessionId, {
      prompt,
      resume: false,
      workingDirectory: activeProjectPath || undefined,
      model: 'sonnet',
      permissionMode: 'plan',
    }).catch((err) => {
      onError(`Session failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      unsub()
    })

    // Timeout
    const timeout = setTimeout(() => {
      if (sessionIdRef.current) {
        api.claude.abort(sessionIdRef.current)
        onError('Generation timed out (3 minutes). Please try again.')
      }
    }, 180_000)

    return () => {
      clearTimeout(timeout)
      if (sessionIdRef.current) api.claude.abort(sessionIdRef.current)
      if (unsubRef.current) unsubRef.current()
    }
  }, [])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
          <Icon icon="lucide:loader-2" className="text-blue-400 text-2xl animate-spin" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Generating Your Workspace</h2>
        <p className="text-sm text-zinc-500 mb-4">{phase}</p>
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.6s' }} />
        </div>
        <p className="text-[10px] text-zinc-700 mt-6">
          Creating {role.label} tasks with workflow templates...
        </p>
      </div>
    </div>
  )
}

// ── Step 4: Review & Apply ──

function ReviewStep({ tasks, role, onApply, onRegenerate, onBack }: {
  tasks: GeneratedTask[]
  role: RoleDefinition
  onApply: (tasks: GeneratedTask[]) => void
  onRegenerate: () => void
  onBack: () => void
}) {
  const [items, setItems] = useState(tasks)
  const [expanded, setExpanded] = useState<number | null>(0)

  const toggleItem = (idx: number) => {
    setItems((prev) => prev.map((t, i) => i === idx ? { ...t, enabled: !t.enabled } : t))
  }

  const enabledCount = items.filter((t) => t.enabled).length

  return (
    <div className="flex-1 flex flex-col items-center p-8 overflow-auto">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
            <Icon icon="lucide:check-circle" className="text-emerald-400 text-2xl" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Your Workspace is Ready</h1>
          <p className="text-sm text-zinc-500">
            {items.length} tasks generated for {role.label}. Toggle off any you don't need.
          </p>
        </div>

        <div className="space-y-3 mb-8">
          {items.map((task, idx) => {
            const isExpanded = expanded === idx
            return (
              <div
                key={idx}
                className={`rounded-xl border transition-all ${
                  task.enabled ? 'bg-pilos-card border-pilos-border' : 'bg-pilos-bg border-pilos-border/50 opacity-50'
                }`}
              >
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => toggleItem(idx)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      task.enabled ? 'bg-blue-600 border-blue-600' : 'border-zinc-600'
                    }`}
                  >
                    {task.enabled && <Icon icon="lucide:check" className="text-white text-[10px]" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white truncate">{task.title}</p>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium}`}>
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{task.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-zinc-600">{task.workflow.nodes.length} nodes</span>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : idx)}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <Icon icon={isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-sm" />
                    </button>
                  </div>
                </div>

                {isExpanded && task.summary.length > 0 && (
                  <div className="px-4 pb-4 pl-12">
                    <div className="p-3 rounded-lg bg-pilos-bg border border-pilos-border/50">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Workflow Steps</p>
                      {task.summary.map((step, i) => (
                        <div key={i} className="flex items-start gap-2 py-0.5">
                          <span className="text-[10px] text-zinc-700 font-mono w-4 flex-shrink-0">{i + 1}.</span>
                          <span className="text-[10px] text-zinc-400">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
              <Icon icon="lucide:arrow-left" className="text-xs" /> Back
            </button>
            <button onClick={onRegenerate} className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
              <Icon icon="lucide:refresh-cw" className="text-xs" /> Regenerate
            </button>
          </div>
          <button
            onClick={() => onApply(items.filter((t) => t.enabled))}
            disabled={enabledCount === 0}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-30 transition-colors flex items-center gap-2"
          >
            <Icon icon="lucide:rocket" className="text-sm" />
            Set Up Workspace ({enabledCount} task{enabledCount !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Wizard ──

export default function RoleWizardPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedRole, setSelectedRole] = useState<RoleDefinition | null>(null)
  const [customDescription, setCustomDescription] = useState<string | undefined>()
  const [connectedIntegrations, setConnectedIntegrations] = useState<string[]>([])
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedTask[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleRoleSelect = useCallback((role: RoleDefinition, desc?: string) => {
    setSelectedRole(role)
    setCustomDescription(desc)
    setStep(2)
  }, [])

  const handleIntegrationsContinue = useCallback((integrations: string[]) => {
    setConnectedIntegrations(integrations)
    setError(null)
    setStep(3)
  }, [])

  const handleGenerationComplete = useCallback((tasks: GeneratedTask[]) => {
    setGeneratedTasks(tasks)
    setStep(4)
  }, [])

  const handleGenerationError = useCallback((err: string) => {
    setError(err)
    setStep(2) // Go back to integration step so user can retry
  }, [])

  const handleRegenerate = useCallback(() => {
    setError(null)
    setGeneratedTasks([])
    setStep(3)
  }, [])

  const handleApply = useCallback(async (tasks: GeneratedTask[]) => {
    const taskStore = useTaskStore.getState()

    for (const task of tasks) {
      await taskStore.addTask({
        title: task.title,
        description: task.description,
        template: 'custom',
        status: 'idle',
        priority: task.priority,
        agentId: null,
        agentName: null,
        progress: 0,
        integrations: [],
        schedule: { interval: 'manual', enabled: false, nextRunAt: null, lastRunAt: null },
        workflow: { nodes: task.workflow.nodes, edges: task.workflow.edges },
      })
    }

    await useAppStore.getState().completeWorkspaceSetup(selectedRole?.id)
    useAppStore.getState().setActiveView('tasks')
  }, [selectedRole])

  return (
    <div className="flex-1 flex flex-col bg-pilos-bg">
      {/* Progress bar */}
      <div className="flex items-center justify-center gap-2 py-4 px-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
              s < step ? 'bg-emerald-500 text-white' :
              s === step ? 'bg-blue-600 text-white' :
              'bg-pilos-card border border-pilos-border text-zinc-600'
            }`}>
              {s < step ? <Icon icon="lucide:check" className="text-xs" /> : s}
            </div>
            {s < 4 && <div className={`w-12 h-0.5 rounded ${s < step ? 'bg-emerald-500' : 'bg-pilos-border'}`} />}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-8 mb-2 flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/5 border border-red-500/20">
          <Icon icon="lucide:alert-circle" className="text-red-400 text-sm flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="text-xs text-red-300">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-zinc-500 hover:text-zinc-300">
            <Icon icon="lucide:x" className="text-xs" />
          </button>
        </div>
      )}

      {/* Steps */}
      {step === 1 && <RoleSelectionStep onSelect={handleRoleSelect} />}
      {step === 2 && selectedRole && (
        <IntegrationCheckStep role={selectedRole} onContinue={handleIntegrationsContinue} onBack={() => setStep(1)} />
      )}
      {step === 3 && selectedRole && (
        <GeneratingStep
          role={selectedRole}
          customDescription={customDescription}
          integrations={connectedIntegrations}
          onComplete={handleGenerationComplete}
          onError={handleGenerationError}
        />
      )}
      {step === 4 && selectedRole && (
        <ReviewStep
          tasks={generatedTasks}
          role={selectedRole}
          onApply={handleApply}
          onRegenerate={handleRegenerate}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  )
}
