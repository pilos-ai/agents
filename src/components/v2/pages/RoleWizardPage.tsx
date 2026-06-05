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

const STEP_LABELS = ['Role', 'Integrations', 'Generate', 'Review'] as const

const PRIORITY_TAG: Record<string, string> = {
  low: 'tag',
  medium: 'tag accent',
  high: 'tag warn',
  critical: 'tag err',
}

// ── Wizard shell ──

function WizardShell({
  step,
  children,
  wide,
}: {
  step: 1 | 2 | 3 | 4
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="onb">
      <div className="onb-glow" />
      <div className={`onb-card pop-in${wide ? ' wide' : ''}`}>
        {/* Step indicator */}
        <div className="onb-steps">
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4
            const done = n < step
            const active = n === step
            return (
              <div key={label} style={{ display: 'contents' }}>
                <div className={`onb-step${done ? ' done' : ''}${active ? ' active' : ''}`}>
                  <div className="num">
                    {done ? <Icon icon="lucide:check" className="text-[14px]" /> : n}
                  </div>
                  <div className="lbl">{label}</div>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`onb-line${done ? ' done' : ''}`} />
                )}
              </div>
            )
          })}
        </div>
        <div className="divider" />
        {children}
      </div>
    </div>
  )
}

// ── Step 1: Role Selection ──

function RoleSelectionStep({ onSelect }: { onSelect: (role: RoleDefinition, customDesc?: string) => void }) {
  const [selectedId, setSelectedId] = useState<UserRole | null>(null)
  const [customDesc, setCustomDesc] = useState('')
  const selected = ROLES.find((r) => r.id === selectedId)

  return (
    <WizardShell step={1} wide>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
          Set up your workspace
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          Select your role and we'll generate tasks and workflows tailored to your work.
        </div>
      </div>

      <div className="grid-cards gc-3">
        {ROLES.map((role) => {
          const isSelected = selectedId === role.id
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedId(role.id)}
              className={`tile hover${isSelected ? ' selected' : ''}`}
              style={{ padding: 14 }}
            >
              <div className="tile-head">
                <div className="tile-logo">
                  <Icon icon={role.icon} className="text-[18px]" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tile-nm">{role.label}</div>
                  <div className="tile-desc">{role.description}</div>
                </div>
              </div>
              {role.taskHints.length > 0 && isSelected && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-2)' }}>
                  {role.taskHints.slice(0, 3).map((h, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 10.5,
                        color: 'var(--muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <span style={{ color: 'var(--accent-2)', marginRight: 4 }}>—</span>
                      {h.split(' — ')[0]}
                    </div>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedId === 'custom' && (
        <div style={{ marginTop: 14 }}>
          <label
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              display: 'block',
              marginBottom: 6,
            }}
          >
            Describe your role and the workflows you need
          </label>
          <textarea
            value={customDesc}
            onChange={(e) => setCustomDesc(e.target.value)}
            placeholder="e.g. I'm a marketing manager who needs to track campaign tasks in Jira, send weekly reports to Slack, and monitor content deadlines..."
            rows={3}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)',
              color: 'var(--ink)',
              fontSize: 12.5,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 22 }}>
        <button
          className="btn ghost"
          onClick={() => useAppStore.getState().completeWorkspaceSetup('skipped')}
        >
          Skip for now
        </button>
        <span style={{ marginLeft: 'auto' }} />
        <button
          className="btn primary"
          disabled={!selected || (selectedId === 'custom' && !customDesc.trim())}
          onClick={() => selected && onSelect(selected, selectedId === 'custom' ? customDesc : undefined)}
        >
          Continue
          <Icon icon="lucide:arrow-right" className="text-[15px]" />
        </button>
      </div>
    </WizardShell>
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

// ── Integration row helper ──

function IntegrationTile({
  icon,
  name,
  desc,
  proBadge,
  connected,
  connecting,
  canConnect,
  disabledReason,
  onConnect,
  children,
}: {
  icon: string
  name: string
  desc: string
  proBadge?: boolean
  connected: boolean
  connecting?: boolean
  canConnect: boolean
  disabledReason?: string
  onConnect?: () => void
  children?: React.ReactNode
}) {
  return (
    <div className={`tile${connected ? ' selected' : ''}`} style={{ padding: 14 }}>
      <div className="row" style={{ gap: 12 }}>
        <div className="tile-logo">
          <Icon icon={icon} className="text-[20px]" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <div className="tile-nm">{name}</div>
            {proBadge && <span className="tag pro">PRO</span>}
          </div>
          <div className="tile-desc">{desc}</div>
        </div>
        {connected ? (
          <span className="tag ok">
            <Icon icon="lucide:check" className="text-[11px]" /> connected
          </span>
        ) : disabledReason ? (
          <span className="muted" style={{ fontSize: 11 }}>{disabledReason}</span>
        ) : !canConnect ? (
          <button className="btn sm" disabled>Upgrade</button>
        ) : (
          <button className="btn sm" onClick={onConnect} disabled={connecting}>
            {connecting ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin text-[12px]" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Step 2: Integration Check ──

function IntegrationCheckStep({ onContinue, onBack }: {
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
      <WizardShell step={2}>
        <div className="row" style={{ justifyContent: 'center', padding: '32px 0' }}>
          <Icon icon="lucide:loader-2" className="animate-spin text-[22px]" style={{ color: 'var(--accent-2)' }} />
        </div>
      </WizardShell>
    )
  }

  return (
    <WizardShell step={2}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
          Your integrations
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          Connect services to power your workflows. You can add more later in Settings.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <IntegrationTile
          icon="logos:jira"
          name="Jira"
          desc="Atlassian issue tracking"
          proBadge
          connected={jiraConnected}
          connecting={jiraConnecting}
          canConnect={isPro}
          onConnect={handleJiraConnect}
        />

        <IntegrationTile
          icon="logos:github-icon"
          name="GitHub"
          desc="Issues, PRs, code search"
          connected={githubConnected}
          canConnect={!!activeProjectPath}
          disabledReason={!activeProjectPath ? 'Open a project first' : undefined}
          onConnect={() => setShowGithubSetup((v) => !v)}
        >
          {showGithubSetup && !githubConnected && activeProjectPath && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
              <p className="muted" style={{ fontSize: 11, margin: '0 0 8px' }}>
                Create a Personal Access Token at GitHub → Settings → Developer settings → Tokens
                (classic) with <span style={{ color: 'var(--ink-2)' }}>repo</span> scope.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <div className="cli-box" style={{ flex: 1, margin: 0 }}>
                  <Icon icon="lucide:key-round" className="text-[14px]" style={{ color: 'var(--muted)' }} />
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  />
                </div>
                <button
                  onClick={handleGithubConnect}
                  disabled={!githubToken.trim() || githubConnecting}
                  className="btn primary sm"
                >
                  {githubConnecting ? (
                    <Icon icon="lucide:loader-2" className="animate-spin text-[12px]" />
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </div>
          )}
        </IntegrationTile>

        <IntegrationTile
          icon="logos:slack-icon"
          name="Slack"
          desc="Team notifications"
          connected={slackConnected}
          canConnect={!!activeProjectPath}
          disabledReason={!activeProjectPath ? 'Open a project first' : undefined}
          onConnect={() => setShowSlackSetup((v) => !v)}
        >
          {showSlackSetup && !slackConnected && activeProjectPath && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
              <p className="muted" style={{ fontSize: 11, margin: '0 0 8px' }}>
                Create a Slack app at api.slack.com/apps, add{' '}
                <span style={{ color: 'var(--ink-2)' }}>chat:write</span> +{' '}
                <span style={{ color: 'var(--ink-2)' }}>channels:read</span> scopes, then install
                to your workspace.
              </p>
              <div className="cli-box" style={{ margin: '0 0 8px' }}>
                <Icon icon="lucide:key-round" className="text-[14px]" style={{ color: 'var(--muted)' }} />
                <input
                  type="password"
                  value={slackBotToken}
                  onChange={(e) => setSlackBotToken(e.target.value)}
                  placeholder="xoxb-xxxxxxxxxxxx"
                />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <div className="cli-box" style={{ flex: 1, margin: 0 }}>
                  <Icon icon="lucide:hash" className="text-[14px]" style={{ color: 'var(--muted)' }} />
                  <input
                    type="text"
                    value={slackTeamId}
                    onChange={(e) => setSlackTeamId(e.target.value)}
                    placeholder="Team ID (e.g. T01234567)"
                  />
                </div>
                <button
                  onClick={handleSlackConnect}
                  disabled={!slackBotToken.trim() || !slackTeamId.trim() || slackConnecting}
                  className="btn primary sm"
                >
                  {slackConnecting ? (
                    <Icon icon="lucide:loader-2" className="animate-spin text-[12px]" />
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </div>
          )}
        </IntegrationTile>
      </div>

      <p className="muted" style={{ fontSize: 11, textAlign: 'center', margin: '14px 0 0' }}>
        {connected.length > 0
          ? `Workflows will use ${connected.join(' + ')}.`
          : 'No integrations connected. Workflows will use data processing and AI analysis.'}
      </p>

      <div className="row" style={{ gap: 10, marginTop: 22 }}>
        <button className="btn ghost" onClick={onBack}>
          <Icon icon="lucide:arrow-left" className="text-[15px]" />
          Back
        </button>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn primary" onClick={() => onContinue(connected)}>
          Generate workspace
          <Icon icon="lucide:sparkles" className="text-[15px]" />
        </button>
      </div>
    </WizardShell>
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
    <WizardShell step={3}>
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent-line)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 14px',
          }}
        >
          <Icon icon="lucide:loader-2" className="animate-spin text-[22px]" style={{ color: 'var(--accent-2)' }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
          Generating your workspace
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{phase}</div>
        <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 14 }}>
          <span className="li-dot dot-run" style={{ width: 7, height: 7 }} />
          <span className="li-dot dot-run" style={{ width: 7, height: 7, animationDelay: '0.2s' }} />
          <span className="li-dot dot-run" style={{ width: 7, height: 7, animationDelay: '0.4s' }} />
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 18 }}>
          Creating {role.label} tasks with workflow templates...
        </p>
      </div>
    </WizardShell>
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
    <WizardShell step={4} wide>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
          Your workspace is ready
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          {items.length} tasks generated for {role.label}. Toggle off any you don't need.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
        {items.map((task, idx) => {
          const isExpanded = expanded === idx
          return (
            <div
              key={idx}
              className={`tile${task.enabled ? '' : ''}`}
              style={{ padding: 14, opacity: task.enabled ? 1 : 0.55 }}
            >
              <div className="row" style={{ gap: 12 }}>
                <button
                  type="button"
                  onClick={() => toggleItem(idx)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    border: task.enabled ? 'none' : '1.5px solid var(--line-3)',
                    background: task.enabled ? 'var(--accent)' : 'transparent',
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {task.enabled && (
                    <Icon icon="lucide:check" className="text-[11px]" style={{ color: '#fff' }} />
                  )}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="tile-nm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.title}
                    </div>
                    <span className={PRIORITY_TAG[task.priority] || PRIORITY_TAG.medium}>
                      {task.priority}
                    </span>
                  </div>
                  <div className="tile-desc" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.description}
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flex: 'none' }}>
                  <span className="muted" style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
                    {task.workflow.nodes.length} nodes
                  </span>
                  <button
                    className="btn icon sm ghost"
                    onClick={() => setExpanded(isExpanded ? null : idx)}
                  >
                    <Icon
                      icon={isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                      className="text-[14px]"
                    />
                  </button>
                </div>
              </div>

              {isExpanded && task.summary.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                      marginBottom: 8,
                    }}
                  >
                    Workflow steps
                  </div>
                  {task.summary.map((s, i) => (
                    <div key={i} className="row" style={{ gap: 8, padding: '2px 0' }}>
                      <span
                        className="muted"
                        style={{ fontFamily: 'var(--mono)', fontSize: 10, width: 16, flex: 'none' }}
                      >
                        {i + 1}.
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="row" style={{ gap: 10, marginTop: 22 }}>
        <button className="btn ghost" onClick={onBack}>
          <Icon icon="lucide:arrow-left" className="text-[15px]" />
          Back
        </button>
        <button className="btn ghost" onClick={onRegenerate}>
          <Icon icon="lucide:refresh-cw" className="text-[15px]" />
          Regenerate
        </button>
        <span style={{ marginLeft: 'auto' }} />
        <button
          className="btn primary"
          disabled={enabledCount === 0}
          onClick={() => onApply(items.filter((t) => t.enabled))}
        >
          <Icon icon="lucide:rocket" className="text-[15px]" />
          Set up workspace ({enabledCount} task{enabledCount !== 1 ? 's' : ''})
        </button>
      </div>
    </WizardShell>
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
    setStep(2)
  }, [])

  const handleRegenerate = useCallback(() => {
    setError(null)
    setGeneratedTasks([])
    setStep(3)
  }, [])

  const handleApply = useCallback(async (tasks: GeneratedTask[]) => {
    const dir = await api.dialog.openDirectory()
    if (dir) {
      await useProjectStore.getState().openProject(dir)
    }

    const taskStore = useTaskStore.getState()

    if (taskStore.currentProjectPath) {
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
    } else {
      const pending = tasks.map((task) => ({
        id: crypto.randomUUID(),
        projectPath: '',
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
        runs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
      await api.settings.set('v2_tasks_pending', pending)
    }

    await useAppStore.getState().completeWorkspaceSetup(selectedRole?.id)
    useAppStore.getState().setActiveView('workflows')
  }, [selectedRole])

  return (
    <>
      {error && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 'var(--r-sm)',
            background: 'rgba(251,111,111,0.12)',
            border: '1px solid rgba(251,111,111,0.3)',
            color: 'var(--err)',
            fontSize: 12,
            maxWidth: 520,
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <Icon icon="lucide:alert-circle" className="text-[14px]" style={{ marginTop: 2 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
          >
            <Icon icon="lucide:x" className="text-[12px]" />
          </button>
        </div>
      )}

      {step === 1 && <RoleSelectionStep onSelect={handleRoleSelect} />}
      {step === 2 && selectedRole && (
        <IntegrationCheckStep
          role={selectedRole}
          onContinue={handleIntegrationsContinue}
          onBack={() => setStep(1)}
        />
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
    </>
  )
}
