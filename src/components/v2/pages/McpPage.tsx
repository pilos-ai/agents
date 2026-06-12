/**
 * MCP page — pixel-faithful port of pilos-handoff/app/screen_mcp.jsx.
 *
 * Layout: 3-column grid of `.tile` cards, each with logo + name + description +
 * switch (`.switch.on`), Edit/Configure buttons. Wired to the real per-project
 * MCP server state in `useProjectStore`. Switch toggles `mcpServer.enabled`.
 *
 * The prototype showed a catalog of available servers too; we keep that idea
 * by combining the project's configured servers with the
 * `MCP_SERVER_TEMPLATES` catalog — adding a template flips it on for the
 * project.
 */
import { useMemo, useState } from 'react'
import { McpIcon } from '../../mcp/McpIcon'
import { useProjectStore } from '../../../store/useProjectStore'
import { MCP_SERVER_TEMPLATES } from '../../../data/mcp-server-templates'
import { IconMcp, IconPlus, IconChevR } from '../PilosIcons'
import { Icon } from '../../common/Icon'
import { McpServerManager } from '../../mcp/McpServerManager'
import type { McpServer } from '../../../types'

type FilterTab = 'All' | 'Connected' | 'Available'

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={'switch' + (on ? ' on' : '')} onClick={onClick} aria-label="Toggle">
      <span className="knob" />
    </button>
  )
}

export default function McpPage() {
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const addProjectMcpServer = useProjectStore((s) => s.addProjectMcpServer)
  const removeProjectMcpServer = useProjectStore((s) => s.removeProjectMcpServer)
  const updateProjectMcpServer = useProjectStore((s) => s.updateProjectMcpServer)
  const toggleProjectMcpServer = useProjectStore((s) => s.toggleProjectMcpServer)

  const activeProject = openProjects.find((p) => p.projectPath === activeProjectPath)
  const mcpServers = activeProject?.mcpServers || []
  const enabledCount = mcpServers.filter((s) => s.enabled).length

  const [filter, setFilter] = useState<FilterTab>('All')
  const [showManager, setShowManager] = useState(false)

  // Combine project's configured servers + remaining template suggestions.
  type Card = { id: string; name: string; description: string; icon: string; configured: McpServer | null }
  const cards: Card[] = useMemo(() => {
    const configuredIds = new Set(mcpServers.map((s) => s.id))
    const configured: Card[] = mcpServers.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      configured: s,
    }))
    const suggestions: Card[] = MCP_SERVER_TEMPLATES
      .filter((t) => !configuredIds.has(t.id) && !mcpServers.some((s) => s.name.toLowerCase() === t.name.toLowerCase()))
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        icon: t.icon,
        configured: null,
      }))
    return [...configured, ...suggestions]
  }, [mcpServers])

  const visible = cards.filter((c) => {
    if (filter === 'All') return true
    if (filter === 'Connected') return c.configured?.enabled
    return !c.configured
  })

  const handleToggle = (card: Card) => {
    if (card.configured) {
      toggleProjectMcpServer(card.configured.id)
    } else {
      // Find the template and add it (enabled by default)
      const tmpl = MCP_SERVER_TEMPLATES.find((t) => t.id === card.id)
      if (!tmpl) return
      if (tmpl.config.type !== 'stdio') return
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
          env: tmpl.config.env,
        },
      })
    }
  }

  if (!activeProjectPath) {
    return (
      <div className="main">
        <div className="main-head">
          <div className="main-title">
            <IconMcp size={17} style={{ color: 'var(--ink-3)' }} />
            MCP Servers
          </div>
        </div>
        <div className="main-body" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <Icon icon="lucide:folder-open" style={{ fontSize: 32, color: 'var(--faint)', display: 'inline-block', marginBottom: 10 }} />
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', margin: 0 }}>No project open</h3>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Open a project to manage MCP servers</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="main">
      <div className="main-head">
        <div className="main-title">
          <IconMcp size={17} style={{ color: 'var(--ink-3)' }} />
          MCP Servers
        </div>
        <div className="main-sub">
          · {enabledCount} connected · {cards.length} available
        </div>
        <div className="main-actions">
          <div className="seg">
            {(['All', 'Connected', 'Available'] as FilterTab[]).map((f) => (
              <button
                key={f}
                className={filter === f ? 'on' : ''}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <button className="btn sm primary" onClick={() => setShowManager((v) => !v)}>
            <IconPlus size={14} />
            Add server
          </button>
        </div>
      </div>

      <div className="main-body scroll">
        <div className="pad">
          {showManager && (
            <div className="tile" style={{ marginBottom: 16 }}>
              <McpServerManager
                servers={mcpServers}
                onAdd={(server: McpServer) => addProjectMcpServer(server)}
                onRemove={(id: string) => removeProjectMcpServer(id)}
                onUpdate={(id: string, updates: Partial<McpServer>) => updateProjectMcpServer(id, updates)}
                onToggle={(id: string) => toggleProjectMcpServer(id)}
              />
            </div>
          )}

          {/* Auto-injected tools note — these activate at runtime and aren't in the list below. */}
          <div
            className="tile"
            style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderColor: 'var(--accent-line)', background: 'var(--accent-soft)' }}
          >
            <Icon icon="lucide:zap" style={{ color: 'var(--accent)', fontSize: 15, flex: 'none', marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>Auto-injected tools</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                Jira MCP is automatically available when connected via Integrations. Computer Use MCP activates when enabled in Settings.
                These don&apos;t appear below — they&apos;re injected at runtime.
              </div>
            </div>
          </div>

          <div className="grid-cards gc-3">
            {visible.map((c) => {
              const on = !!c.configured?.enabled
              return (
                <div key={c.id} className="tile hover">
                  <div className="tile-head">
                    <div className="tile-logo">
                      <McpIcon icon={c.icon} className="w-6 h-6" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tile-nm">{c.name}</div>
                      <div className="tile-desc">{c.description}</div>
                    </div>
                    <Switch on={on} onClick={() => handleToggle(c)} />
                  </div>
                  <div className="tile-foot">
                    <span className={'tag ' + (on ? 'ok' : '')}>
                      {on ? (
                        <>
                          <span className="li-dot dot-ok" style={{ width: 6, height: 6 }} />
                          connected
                        </>
                      ) : c.configured ? (
                        'disabled'
                      ) : (
                        'not connected'
                      )}
                    </span>
                    <button
                      className="btn sm ghost"
                      onClick={() => setShowManager(true)}
                    >
                      Configure
                      <IconChevR size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {visible.length === 0 && (
            <div className="tile" style={{ textAlign: 'center', padding: 32 }}>
              <p className="muted" style={{ fontSize: 12.5 }}>No matching servers</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
