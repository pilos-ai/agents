/**
 * Agents page — pixel-faithful port of pilos-handoff/app/screen_agents.jsx.
 *
 * Layout: header with "New agent" CTA + a 3-column grid of agent tiles. Each
 * tile shows code+role+model+skills+actions. Wired to the real per-project
 * agent storage in `useProjectStore`.
 *
 * Editing is delegated to the existing `AddAgentDialog`: "New agent" opens it
 * in create mode, while per-agent "Edit" opens the same dialog in edit mode
 * (pre-filled from the selected agent) and saves via `updateProjectAgent`.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { AddAgentDialog } from '../AddAgentDialog'
import { GradientAvatar } from '../components/GradientAvatar'
import { useProjectStore } from '../../../store/useProjectStore'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { useAnalyticsStore } from '../../../store/useAnalyticsStore'
import { IconAgents, IconPlus, IconCopy, IconTrash, IconCpu, IconCheckSm, IconPen } from '../PilosIcons'
import { Icon } from '../../common/Icon'
import type { AgentDefinition } from '../../../types'

function AgentTile({
  agent,
  runs,
  tokens,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  agent: AgentDefinition
  runs: number
  tokens: number
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const code = agent.name.slice(0, 3).toUpperCase()
  const model = (agent.capabilities as { model?: string } | undefined)?.model || 'claude-sonnet-4.6'

  return (
    <div className="tile hover">
      <div className="tile-head">
        <div style={{ position: 'relative' }}>
          <GradientAvatar gradient={agent.color} icon={agent.icon} size="md" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tile-nm">
            {agent.name}
            <span className="tag" style={{ fontFamily: 'var(--mono)' }}>{code}</span>
          </div>
          <div className="tile-desc">{agent.role}</div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconCpu size={13} style={{ color: 'var(--muted)' }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{model}</span>
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {agent.expertise.slice(0, 4).map((s) => (
          <span key={s} className="tag accent">{s}</span>
        ))}
        {agent.expertise.length > 4 && (
          <span className="tag">+{agent.expertise.length - 4}</span>
        )}
      </div>
      <div className="tile-foot">
        <span className="tag">
          <span className="li-dot dot-ok" style={{ width: 6, height: 6 }} />
          {runs} runs · {Math.round(tokens / 1000)}k tok
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm ghost" onClick={onDuplicate} aria-label="Duplicate">
            <IconCopy size={13} />
          </button>
          <button className="btn sm ghost" onClick={onEdit} aria-label="Edit">
            <IconPen size={13} />
            Edit
          </button>
          <button
            className="btn sm ghost"
            onClick={onDelete}
            style={{ color: 'var(--err)' }}
            aria-label="Delete"
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AgentsPage() {
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const activeProject = useProjectStore((s) => {
    const path = s.activeProjectPath
    return s.openProjects.find((p) => p.projectPath === path)
  })
  const addAgent = useProjectStore((s) => s.addProjectAgent)
  const removeAgent = useProjectStore((s) => s.removeProjectAgent)
  const updateAgent = useProjectStore((s) => s.updateProjectAgent)
  const flags = useLicenseStore((s) => s.flags)
  const entries = useAnalyticsStore((s) => s.entries)

  const agents = activeProject?.agents || []
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  // When set, the dialog opens in edit mode for this agent.
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null)

  // Stats per agent
  const statsByAgent = useMemo(() => {
    const map = new Map<string, { runs: number; tokens: number }>()
    for (const e of entries) {
      const name = e.agentName || ''
      const prev = map.get(name) || { runs: 0, tokens: 0 }
      prev.runs++
      prev.tokens += e.tokens
      map.set(name, prev)
    }
    return map
  }, [entries])

  const atLimit = Number.isFinite(flags.maxAgents) && agents.length >= flags.maxAgents
  const canAddAgent = !!activeProject && !atLimit

  const openAddDialog = useCallback(() => {
    if (canAddAgent) {
      setEditingAgent(null)
      setAddDialogOpen(true)
    }
  }, [canAddAgent])

  const openEditDialog = useCallback((agent: AgentDefinition) => {
    setEditingAgent(agent)
    setAddDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setAddDialogOpen(false)
    setEditingAgent(null)
  }, [])

  // Listen for the global "New Agent" event (titlebar / palette can dispatch)
  useEffect(() => {
    window.addEventListener('pilos:new-agent', openAddDialog)
    return () => window.removeEventListener('pilos:new-agent', openAddDialog)
  }, [openAddDialog])

  if (!activeProjectPath || !activeProject) {
    return (
      <div className="main">
        <div className="main-head">
          <div className="main-title">
            <IconAgents size={17} style={{ color: 'var(--ink-3)' }} />
            Agents
          </div>
        </div>
        <div className="main-body" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <Icon icon="lucide:bot" style={{ fontSize: 32, color: 'var(--faint)', display: 'inline-block', marginBottom: 10 }} />
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', margin: 0 }}>No project open</h3>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Open a project to configure agents</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="main">
      <div className="main-head">
        <div className="main-title">
          <IconAgents size={17} style={{ color: 'var(--ink-3)' }} />
          Agents
        </div>
        <div className="main-sub">· {agents.length} configured</div>
        <div className="main-actions">
          {atLimit && (
            <span className="muted" style={{ fontSize: 11 }}>
              Agent limit reached ({flags.maxAgents})
            </span>
          )}
          <button
            className="btn sm primary"
            onClick={openAddDialog}
            disabled={!canAddAgent}
          >
            <IconPlus size={14} />
            New agent
          </button>
        </div>
      </div>

      <div className="main-body scroll">
        <div className="pad">
          {agents.length === 0 ? (
            <div className="tile" style={{ textAlign: 'center', padding: 36 }}>
              <IconAgents size={32} style={{ color: 'var(--faint)', display: 'inline-block', marginBottom: 8 }} />
              <h3 style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>No agents yet</h3>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Add an agent template to get started.
              </p>
              <button
                className="btn primary"
                onClick={openAddDialog}
                disabled={!canAddAgent}
                style={{ marginTop: 14 }}
              >
                <IconPlus size={14} />
                Add agent
              </button>
            </div>
          ) : (
            <div className="grid-cards gc-3">
              {agents.map((agent) => {
                const stat = statsByAgent.get(agent.name) || { runs: 0, tokens: 0 }
                return (
                  <AgentTile
                    key={agent.id}
                    agent={agent}
                    runs={stat.runs}
                    tokens={stat.tokens}
                    onEdit={() => openEditDialog(agent)}
                    onDuplicate={() => {
                      const dup: AgentDefinition = {
                        ...agent,
                        id: crypto.randomUUID(),
                        name: agent.name + ' Copy',
                      }
                      addAgent(dup)
                    }}
                    onDelete={() => removeAgent(agent.id)}
                  />
                )
              })}
            </div>
          )}

          <div className="divider" />
          <div className="muted" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconCheckSm size={13} style={{ color: 'var(--ok)' }} />
            Changes save automatically per project.
          </div>
        </div>
      </div>

      <AddAgentDialog
        open={addDialogOpen}
        onClose={closeDialog}
        onAdd={(a) => addAgent(a)}
        existingIds={agents.map((a) => a.id)}
        agent={editingAgent}
        onUpdate={(id, updates) => updateAgent(id, updates)}
      />
    </div>
  )
}
