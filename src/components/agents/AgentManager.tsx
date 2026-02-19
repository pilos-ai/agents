import { useState } from 'react'
import type { AgentDefinition } from '../../types'
import { AGENT_TEMPLATES, AGENT_COLORS, TEAM_PRESETS } from '../../data/agent-templates'
import { AgentEditModal } from './AgentEditModal'

interface Props {
  agents: AgentDefinition[]
  onSetAgents: (agents: AgentDefinition[]) => void
  onAddAgent: (agent: AgentDefinition) => void
  onRemoveAgent: (id: string) => void
  onUpdateAgent: (id: string, updates: Partial<AgentDefinition>) => void
}

export function AgentManager({ agents, onSetAgents, onAddAgent, onRemoveAgent, onUpdateAgent }: Props) {
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null)

  const usedIds = new Set(agents.map((a) => a.id))
  const availableTemplates = AGENT_TEMPLATES.filter((t) => !usedIds.has(t.id))

  const handlePreset = (presetName: string) => {
    const ids = TEAM_PRESETS[presetName]
    if (!ids) return
    const presetAgents = ids
      .map((id) => AGENT_TEMPLATES.find((t) => t.id === id))
      .filter((t): t is AgentDefinition => !!t)
    onSetAgents(presetAgents)
  }

  const handleEditSave = (updated: AgentDefinition) => {
    onUpdateAgent(updated.id, updated)
    setEditingAgent(null)
  }

  return (
    <div className="space-y-3">
      {/* Presets */}
      <div>
        <label className="block text-xs text-neutral-400 mb-1.5">Quick Presets</label>
        <div className="flex gap-2">
          {Object.keys(TEAM_PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => handlePreset(name)}
              className="px-3 py-1 text-xs rounded-md border border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:border-blue-500/50 hover:text-blue-400 transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Current agents */}
      {agents.length > 0 && (
        <div className="space-y-2">
          {agents.map((agent) => {
            const colors = AGENT_COLORS[agent.color] || AGENT_COLORS.blue
            return (
              <div
                key={agent.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg border ${colors.border} ${colors.bgLight}`}
              >
                <span className="text-lg">{agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${colors.text}`}>{agent.name}</div>
                  <div className="text-xs text-neutral-500 truncate">{agent.role}</div>
                </div>
                <button
                  onClick={() => setEditingAgent(agent)}
                  className="text-neutral-500 hover:text-neutral-300 transition-colors"
                  title="Edit"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={() => onRemoveAgent(agent.id)}
                  className="text-neutral-500 hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add agent button */}
      {availableTemplates.length > 0 && (
        <div>
          {showTemplatePicker ? (
            <div className="grid grid-cols-2 gap-2">
              {availableTemplates.map((template) => {
                const colors = AGENT_COLORS[template.color] || AGENT_COLORS.blue
                return (
                  <button
                    key={template.id}
                    onClick={() => {
                      onAddAgent(template)
                      setShowTemplatePicker(false)
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border border-neutral-700 bg-neutral-800/50 hover:${colors.border} hover:${colors.bgLight} transition-colors text-left`}
                  >
                    <span className="text-base">{template.emoji}</span>
                    <div>
                      <div className="text-xs font-medium text-neutral-200">{template.name}</div>
                      <div className="text-[10px] text-neutral-500">{template.role}</div>
                    </div>
                  </button>
                )
              })}
              <button
                onClick={() => setShowTemplatePicker(false)}
                className="flex items-center justify-center p-2 rounded-lg border border-neutral-700 bg-neutral-800/50 text-neutral-500 hover:text-neutral-300 transition-colors text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTemplatePicker(true)}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-blue-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Agent
            </button>
          )}
        </div>
      )}

      {agents.length === 0 && (
        <p className="text-xs text-neutral-500 italic">
          No agents configured. Choose a preset or add agents individually.
        </p>
      )}

      {/* Edit modal */}
      {editingAgent && (
        <AgentEditModal
          agent={editingAgent}
          onSave={handleEditSave}
          onClose={() => setEditingAgent(null)}
        />
      )}
    </div>
  )
}
