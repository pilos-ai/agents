import { useState, useEffect, useRef } from 'react'
import type { AgentDefinition, McpServer } from '../../types'
import { AGENT_TEMPLATES, AGENT_COLORS, TEAM_PRESETS, AGENT_TEMPLATE_CATEGORIES } from '../../data/agent-templates'
import { AgentEditModal } from './AgentEditModal'
import { useLicenseStore } from '../../store/useLicenseStore'
import { ProBadge } from '../common/ProBadge'
import { loadProModule } from '../../lib/pro'

interface Props {
  agents: AgentDefinition[]
  onSetAgents: (agents: AgentDefinition[]) => void
  onAddAgent: (agent: AgentDefinition) => void
  onRemoveAgent: (id: string) => void
  onUpdateAgent: (id: string, updates: Partial<AgentDefinition>) => void
  onAddMcpServer?: (server: McpServer) => void
  existingMcpServerIds?: Set<string>
}

// Color mapping for premium agent categories
const PREMIUM_CATEGORY_COLORS: Record<string, string> = {
  engineering: 'cyan',
  product: 'green',
  design: 'pink',
  data: 'indigo',
  devops: 'orange',
  security: 'red',
}

interface PremiumAgentGroup {
  category: string
  agents: AgentDefinition[]
}

export function AgentManager({ agents, onSetAgents, onAddAgent, onRemoveAgent, onUpdateAgent, onAddMcpServer, existingMcpServerIds }: Props) {
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [premiumGroups, setPremiumGroups] = useState<PremiumAgentGroup[]>([])

  const flags = useLicenseStore((s) => s.flags)
  const tier = useLicenseStore((s) => s.tier)
  const atLimit = agents.length >= flags.maxAgents

  const usedIds = new Set(agents.map((a) => a.id))

  // Store premium agent → MCP server mapping for auto-add
  const premiumAgentMcpMap = useRef<Map<string, string[]>>(new Map())
  const premiumMcpTemplateMap = useRef<Map<string, { id: string; name: string; icon: string; description: string; config: any }>>(new Map())

  // Load premium agents + MCP templates when tier changes
  useEffect(() => {
    if (tier === 'free') {
      setPremiumGroups([])
      premiumAgentMcpMap.current.clear()
      premiumMcpTemplateMap.current.clear()
      return
    }

    loadProModule().then(async (pro) => {
      if (!pro) return
      const plan = tier as 'pro' | 'teams'

      // Load premium agents
      const grouped = pro.getPremiumAgentsByCategory(plan)
      const groups: PremiumAgentGroup[] = Object.entries(grouped).map(([category, premAgents]) => ({
        category,
        agents: premAgents.map((pa) => ({
          id: pa.id,
          name: pa.name,
          emoji: pa.icon,
          color: PREMIUM_CATEGORY_COLORS[pa.category] || 'amber',
          role: pa.description,
          personality: pa.systemPrompt,
          expertise: pa.tools,
        })),
      }))
      setPremiumGroups(groups)

      // Build agent → recommended MCP server mapping
      const allAgents = await pro.getPremiumAgents(plan)
      premiumAgentMcpMap.current.clear()
      for (const pa of allAgents) {
        if (pa.recommendedMcpServers.length > 0) {
          premiumAgentMcpMap.current.set(pa.id, pa.recommendedMcpServers)
        }
      }

      // Load premium MCP templates for auto-add
      const mcpTemplates = pro.getPremiumMcpTemplates()
      premiumMcpTemplateMap.current.clear()
      for (const t of mcpTemplates) {
        premiumMcpTemplateMap.current.set(t.id, {
          id: t.id,
          name: t.name,
          icon: t.icon,
          description: t.description,
          config: t.config,
        })
      }
    })
  }, [tier])

  // Auto-add recommended MCP servers when a premium agent is added
  const autoAddMcpServers = (agentId: string) => {
    if (!onAddMcpServer) return
    const serverIds = premiumAgentMcpMap.current.get(agentId)
    if (!serverIds) return
    for (const serverId of serverIds) {
      if (existingMcpServerIds?.has(serverId)) continue
      const template = premiumMcpTemplateMap.current.get(serverId)
      if (!template) continue
      // Only auto-add servers with no required env vars (zero-config)
      const hasRequiredEnv = template.config.env && Object.values(template.config.env).some((v) => v === '')
      if (hasRequiredEnv) continue
      onAddMcpServer({
        id: template.id,
        name: template.name,
        icon: template.icon,
        description: template.description,
        enabled: true,
        config: structuredClone(template.config),
      })
    }
  }

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

  const handleCreateSave = (newAgent: AgentDefinition) => {
    onAddAgent(newAgent)
    setShowCreateModal(false)
  }

  return (
    <div className="space-y-3">
      {/* Presets */}
      <div>
        <label className="block text-xs text-neutral-400 mb-1.5">Quick Presets</label>
        <div className="flex flex-wrap gap-2">
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

      {/* Template picker (categorized) */}
      {showTemplatePicker && (
        <div className="border border-neutral-700 rounded-lg p-3 space-y-3 bg-neutral-800/30 max-h-[50vh] overflow-y-auto">
          {AGENT_TEMPLATE_CATEGORIES.map((category) => {
            const available = category.templates.filter((t) => !usedIds.has(t.id))
            if (available.length === 0) return null
            return (
              <div key={category.name}>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
                  {category.name}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {available.map((template) => {
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
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-neutral-200">{template.name}</div>
                          <div className="text-[10px] text-neutral-500 truncate">{template.role}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Premium agent templates (Pro/Teams only) */}
          {premiumGroups.length > 0 && (
            <>
              <div className="border-t border-amber-500/20 pt-3 mt-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Premium Templates</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">PRO</span>
                </div>
              </div>
              {premiumGroups.map((group) => {
                const available = group.agents.filter((a) => !usedIds.has(a.id))
                if (available.length === 0) return null
                return (
                  <div key={group.category}>
                    <label className="block text-[10px] font-medium text-amber-500/60 uppercase tracking-wider mb-1.5">
                      {group.category}
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {available.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => {
                            onAddAgent(template)
                            autoAddMcpServers(template.id)
                            setShowTemplatePicker(false)
                          }}
                          className="flex items-center gap-2 p-2 rounded-lg border border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 hover:bg-amber-500/10 transition-colors text-left"
                        >
                          <span className="text-base">{template.emoji}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-amber-200">{template.name}</div>
                            <div className="text-[10px] text-neutral-500 truncate">{template.role}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}

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
        <div className="flex gap-3 items-center">
          {atLimit ? (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span>Agent limit reached ({flags.maxAgents})</span>
              <ProBadge label="Upgrade to unlock unlimited agents" />
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowTemplatePicker(true)}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-blue-400 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add from Template
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-blue-400 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create Custom
              </button>
            </>
          )}
        </div>
      )}

      {agents.length === 0 && !showTemplatePicker && (
        <p className="text-xs text-neutral-500 italic">
          No agents configured. Choose a preset, add from templates, or create a custom agent.
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

      {/* Create custom modal */}
      {showCreateModal && (
        <AgentEditModal
          agent={null}
          onSave={handleCreateSave}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}
