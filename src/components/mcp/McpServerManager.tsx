import { useState, useEffect } from 'react'
import type { McpServer, McpServerTemplate } from '../../types'
import { MCP_SERVER_TEMPLATES, MCP_CATEGORIES } from '../../data/mcp-server-templates'
import { McpServerEditModal } from './McpServerEditModal'
import { useLicenseStore } from '../../store/useLicenseStore'
import { ProBadge } from '../common/ProBadge'
import { loadProModule } from '../../lib/pro'
import { McpIcon } from './McpIcon'

interface Props {
  servers: McpServer[]
  onAdd: (server: McpServer) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: Partial<McpServer>) => void
  onToggle: (id: string) => void
}

export function McpServerManager({ servers, onAdd, onRemove, onUpdate, onToggle }: Props) {
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServer | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [premiumTemplates, setPremiumTemplates] = useState<McpServerTemplate[]>([])

  const flags = useLicenseStore((s) => s.flags)
  const atLimit = servers.length >= flags.maxMcpServers

  // Load premium templates for pro/teams users
  useEffect(() => {
    if (flags.tier !== 'pro' && flags.tier !== 'teams') {
      setPremiumTemplates([])
      return
    }
    loadProModule().then((pro) => {
      if (!pro) return
      const templates = pro.getPremiumMcpTemplates() as McpServerTemplate[]
      setPremiumTemplates(templates)
    })
  }, [flags.tier])

  const allTemplates = [...MCP_SERVER_TEMPLATES, ...premiumTemplates]
  const existingIds = new Set(servers.map((s) => s.id))
  // Drop already-configured servers, and collapse duplicates by name (e.g. a
  // built-in Postgres + a premium Postgres) — first occurrence wins.
  const seenNames = new Set<string>()
  const availableTemplates = allTemplates.filter((t) => {
    if (existingIds.has(t.id)) return false
    const key = t.name.trim().toLowerCase()
    if (seenNames.has(key)) return false
    seenNames.add(key)
    return true
  })
  const allCategories = Array.from(new Set([...MCP_CATEGORIES, ...premiumTemplates.map((t) => t.category)]))

  const handleTemplateAdd = (templateId: string) => {
    const template = allTemplates.find((t) => t.id === templateId)
    if (!template) return

    if (template.requiredEnvVars.length === 0) {
      onAdd({
        id: template.id,
        name: template.name,
        icon: template.icon,
        description: template.description,
        enabled: true,
        config: structuredClone(template.config),
      })
      setShowTemplatePicker(false)
    } else {
      setEditingServer({
        id: template.id,
        name: template.name,
        icon: template.icon,
        description: template.description,
        enabled: true,
        config: structuredClone(template.config),
      })
      setShowTemplatePicker(false)
    }
  }

  const handleEditSave = (updated: McpServer) => {
    if (existingIds.has(updated.id)) {
      onUpdate(updated.id, updated)
    } else {
      onAdd(updated)
    }
    setEditingServer(null)
    setShowNewModal(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Server list */}
      {servers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {servers.map((server) => (
            <div
              key={server.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 10, borderRadius: 8,
                border: '1px solid var(--line)',
                background: server.enabled ? 'var(--surface)' : 'var(--panel)',
                opacity: server.enabled ? 1 : 0.55,
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                <McpIcon icon={server.icon} className="w-5 h-5" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{server.name}</span>
                  <span className="tag" style={{ fontFamily: 'var(--mono)' }}>{server.config.type}</span>
                </div>
                <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.description}</div>
              </div>
              <button
                type="button"
                onClick={() => onToggle(server.id)}
                className={'switch' + (server.enabled ? ' on' : '')}
                style={{ width: 30, height: 17 }}
                title={server.enabled ? 'Disable' : 'Enable'}
              >
                <span className="knob" style={{ width: 12, height: 12, transform: server.enabled ? 'translateX(13px)' : 'none' }} />
              </button>
              <button
                type="button"
                onClick={() => setEditingServer(server)}
                className="btn sm ghost icon"
                title="Edit"
              >
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onRemove(server.id)}
                className="btn sm ghost icon"
                style={{ color: 'var(--err)' }}
                title="Remove"
              >
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Template picker */}
      {showTemplatePicker && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: 'var(--panel)' }}>
          {allCategories.map((category) => {
            const templates = availableTemplates.filter((t) => t.category === category)
            if (templates.length === 0) return null
            return (
              <div key={category} style={{ marginBottom: 12 }}>
                <div className="section-label" style={{ marginBottom: 8 }}>{category}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleTemplateAdd(template.id)}
                      className="tile hover"
                      style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                        <McpIcon icon={template.icon} className="w-4 h-4" />
                      </div>
                      <div style={{ minWidth: 0, textAlign: 'left' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{template.name}</div>
                        <div className="muted" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => setShowTemplatePicker(false)}
            className="btn sm ghost"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Action buttons */}
      {!showTemplatePicker && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {atLimit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--muted)' }}>
              <span>MCP server limit reached ({flags.maxMcpServers})</span>
              <ProBadge label="Upgrade to unlock unlimited MCP servers" />
            </div>
          ) : (
            <>
              {availableTemplates.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowTemplatePicker(true)}
                  className="btn sm"
                >
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add from Template
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="btn sm ghost"
              >
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Custom
              </button>
            </>
          )}
        </div>
      )}

      {servers.length === 0 && !showTemplatePicker && (
        <p className="muted" style={{ fontSize: 11.5, fontStyle: 'italic', margin: 0 }}>
          No MCP servers configured. Add servers to enable Claude to interact with external tools.
        </p>
      )}

      {/* Edit modal */}
      {editingServer && (
        <McpServerEditModal
          server={editingServer}
          onSave={handleEditSave}
          onClose={() => setEditingServer(null)}
        />
      )}

      {/* New custom modal */}
      {showNewModal && (
        <McpServerEditModal
          server={null}
          onSave={handleEditSave}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  )
}
