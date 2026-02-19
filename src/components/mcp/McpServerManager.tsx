import { useState } from 'react'
import type { McpServer } from '../../types'
import { MCP_SERVER_TEMPLATES, MCP_CATEGORIES } from '../../data/mcp-server-templates'
import { McpServerEditModal } from './McpServerEditModal'

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

  const existingIds = new Set(servers.map((s) => s.id))
  const availableTemplates = MCP_SERVER_TEMPLATES.filter((t) => !existingIds.has(t.id))

  const handleTemplateAdd = (templateId: string) => {
    const template = MCP_SERVER_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return

    // Templates with no required env vars — add directly
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
      // Open edit modal pre-filled with template
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
    <div className="space-y-3">
      {/* Server list */}
      {servers.length > 0 && (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                server.enabled
                  ? 'border-neutral-700 bg-neutral-800/50'
                  : 'border-neutral-800 bg-neutral-900/50 opacity-50'
              }`}
            >
              <span className="text-lg shrink-0">{server.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-200">{server.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-400">
                    {server.config.type}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 truncate">{server.description}</div>
              </div>
              {/* Toggle */}
              <button
                onClick={() => onToggle(server.id)}
                className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${
                  server.enabled ? 'bg-green-600' : 'bg-neutral-600'
                }`}
                title={server.enabled ? 'Disable' : 'Enable'}
              >
                <span
                  className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                    server.enabled ? 'left-[16px]' : 'left-[2px]'
                  }`}
                />
              </button>
              {/* Edit */}
              <button
                onClick={() => setEditingServer(server)}
                className="text-neutral-500 hover:text-neutral-300 transition-colors shrink-0"
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              {/* Remove */}
              <button
                onClick={() => onRemove(server.id)}
                className="text-neutral-500 hover:text-red-400 transition-colors shrink-0"
                title="Remove"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Template picker */}
      {showTemplatePicker && (
        <div className="border border-neutral-700 rounded-lg p-3 space-y-3 bg-neutral-800/30">
          {MCP_CATEGORIES.map((category) => {
            const templates = availableTemplates.filter((t) => t.category === category)
            if (templates.length === 0) return null
            return (
              <div key={category}>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
                  {category}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateAdd(template.id)}
                      className="flex items-center gap-2 p-2 rounded-lg border border-neutral-700 bg-neutral-800/50 hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors text-left"
                    >
                      <span className="text-base">{template.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-neutral-200">{template.name}</div>
                        <div className="text-[10px] text-neutral-500 truncate">{template.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          <button
            onClick={() => setShowTemplatePicker(false)}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Action buttons */}
      {!showTemplatePicker && (
        <div className="flex gap-3">
          {availableTemplates.length > 0 && (
            <button
              onClick={() => setShowTemplatePicker(true)}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-blue-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add from Template
            </button>
          )}
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-blue-400 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Custom
          </button>
        </div>
      )}

      {servers.length === 0 && !showTemplatePicker && (
        <p className="text-xs text-neutral-500 italic">
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
