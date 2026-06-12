import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '../common/Icon'
import { IconPicker } from '../common/IconPicker'
import { GradientAvatar } from './components/GradientAvatar'
import { AGENT_TEMPLATE_CATEGORIES, AGENT_COLORS, DEFAULT_CAPABILITIES } from '../../data/agent-templates'
import { api } from '../../api'
import { extractJson } from '../../utils/workflow-ai'
import { useLicenseStore } from '../../store/useLicenseStore'
import type { AgentDefinition, AgentCapabilities, PermissionLevel, ClaudeEvent } from '../../types'

interface AddAgentDialogProps {
  open: boolean
  onClose: () => void
  onAdd: (agent: AgentDefinition) => void
  existingIds: string[]
  /** When provided, the dialog opens in edit mode and pre-fills its custom
   *  form from this agent. On save it calls `onUpdate` (the project store's
   *  `updateProjectAgent`) instead of `onAdd`. When omitted, the dialog
   *  behaves exactly as before (create flow). */
  agent?: AgentDefinition | null
  onUpdate?: (id: string, updates: Partial<AgentDefinition>) => void
}

type Tab = 'templates' | 'custom'

const COLOR_OPTIONS = Object.keys(AGENT_COLORS)

// Per-agent capability editor options (restored from the pre-v2 ConfigPage AgentForm).
const TOOL_OPTIONS: { id: string; label: string }[] = [
  { id: 'fs_access', label: 'File system' },
  { id: 'git_ops', label: 'Git operations' },
  { id: 'web_search', label: 'Web search' },
  { id: 'code_exec', label: 'Code execution' },
  { id: 'mcp_servers', label: 'MCP servers' },
  { id: 'browser', label: 'Browser' },
]
const PERMISSION_OPTIONS: { value: PermissionLevel; label: string; desc: string }[] = [
  { value: 'restricted', label: 'Restricted', desc: 'read-only, asks before changes' },
  { value: 'standard', label: 'Standard', desc: 'asks before risky actions' },
  { value: 'elevated', label: 'Elevated', desc: 'runs most actions without asking' },
]

const AI_SUGGESTIONS = [
  'A security auditor that reviews code for vulnerabilities',
  'A documentation writer that creates clear API docs',
  'A DevOps engineer for CI/CD and infrastructure',
  'A data analyst that creates reports and dashboards',
]

function buildAgentPrompt(description: string): string {
  const validColors = COLOR_OPTIONS.join(', ')
  return `Generate an AI agent definition based on this description: "${description}"

OUTPUT ONLY THE RAW JSON OBJECT. No markdown fences, no explanation.

JSON schema:
{
  "name": "Short name (1-3 words, e.g. 'QA', 'DevOps', 'Data Engineer')",
  "role": "Full role title (e.g. 'Quality Assurance Engineer')",
  "personality": "2-4 sentences describing how this agent should behave, its approach, and communication style. Write in second person ('You are...')",
  "expertise": ["keyword1", "keyword2", "keyword3", "keyword4"],
  "color": "one of: ${validColors}",
  "icon": "a lucide icon name like 'lucide:shield-check' or 'lucide:database' that fits the role"
}

Rules:
- name should be concise (like a job title abbreviation)
- personality should be specific and actionable, not generic
- expertise should be 3-6 lowercase keywords
- color should match the agent's domain (e.g. green for DevOps, red for security, blue for engineering)
- icon must use the 'lucide:' prefix`
}

export function AddAgentDialog({ open, onClose, onAdd, existingIds, agent, onUpdate }: AddAgentDialogProps) {
  const isEdit = !!agent
  const [tab, setTab] = useState<Tab>('templates')
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Custom agent form
  const [customName, setCustomName] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [customIcon, setCustomIcon] = useState('lucide:bot')
  const [customColor, setCustomColor] = useState('blue')
  const [customPersonality, setCustomPersonality] = useState('')
  const [customExpertise, setCustomExpertise] = useState('')

  // Per-agent capabilities (tool access, permissions, limits, memory…). Restored editor.
  const [customCaps, setCustomCaps] = useState<AgentCapabilities>({ ...DEFAULT_CAPABILITIES })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const patchCaps = (p: Partial<AgentCapabilities>) => setCustomCaps((c) => ({ ...c, ...p }))
  const toggleTool = (id: string) =>
    setCustomCaps((c) => ({ ...c, tools: c.tools.includes(id) ? c.tools.filter((t) => t !== id) : [...c.tools, id] }))

  // License check
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'

  // AI generation
  const [aiPrompt, setAiPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState('')
  const sessionIdRef = useRef<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (open) {
      setSearch('')
      setAiPrompt('')
      setAiError('')
      setIsGenerating(false)
      if (agent) {
        // Edit mode: jump straight to the custom form pre-filled from the agent.
        setTab('custom')
        setCustomName(agent.name)
        setCustomRole(agent.role)
        setCustomIcon(agent.icon || 'lucide:bot')
        setCustomColor(agent.color || 'blue')
        setCustomPersonality(agent.personality || '')
        setCustomExpertise((agent.expertise || []).join(', '))
        setCustomCaps({ ...DEFAULT_CAPABILITIES, ...(agent.capabilities || {}) })
        setShowAdvanced(false)
      } else {
        setTab('templates')
        setCustomCaps({ ...DEFAULT_CAPABILITIES })
        setShowAdvanced(false)
        setTimeout(() => searchRef.current?.focus(), 100)
      }
    }
  }, [open, agent])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) api.claude.abort(sessionIdRef.current)
      if (unsubRef.current) unsubRef.current()
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isGenerating) {
          handleCancelGenerate()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, isGenerating])

  const handleCancelGenerate = useCallback(() => {
    if (sessionIdRef.current) {
      api.claude.abort(sessionIdRef.current)
      sessionIdRef.current = null
    }
    if (unsubRef.current) {
      unsubRef.current()
      unsubRef.current = null
    }
    setIsGenerating(false)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!aiPrompt.trim() || isGenerating) return

    setIsGenerating(true)
    setAiError('')

    const sessionId = `agent-gen-${crypto.randomUUID()}`
    sessionIdRef.current = sessionId

    let resultText = ''

    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      if (event.sessionId !== sessionId) return

      if (event.type === 'assistant') {
        const msg = event.message as { content?: Array<{ type: string; text?: string }> }
        if (msg?.content) {
          resultText = msg.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text || '')
            .join('')
        }
      }

      if (event.type === 'content_block_delta') {
        const delta = (event as Record<string, unknown>).delta as { type: string; text?: string } | undefined
        if (delta?.type === 'text_delta' && delta.text) {
          resultText += delta.text
        }
      }

      if (event.type === 'result') {
        try {
          const cleaned = extractJson(resultText)
          const generated = JSON.parse(cleaned)

          // Fill form fields
          if (generated.name) setCustomName(generated.name)
          if (generated.role) setCustomRole(generated.role)
          if (generated.personality) setCustomPersonality(generated.personality)
          if (generated.icon) setCustomIcon(generated.icon)
          if (generated.color && COLOR_OPTIONS.includes(generated.color)) {
            setCustomColor(generated.color)
          }
          if (Array.isArray(generated.expertise)) {
            setCustomExpertise(generated.expertise.join(', '))
          }
        } catch {
          setAiError('Failed to parse AI response. You can fill in the fields manually.')
        }

        setIsGenerating(false)
        sessionIdRef.current = null
        if (unsubRef.current) {
          unsubRef.current()
          unsubRef.current = null
        }
      }
    })

    unsubRef.current = unsub

    try {
      await api.claude.startSession(sessionId, {
        prompt: buildAgentPrompt(aiPrompt.trim()),
        resume: false,
        model: 'haiku',
        permissionMode: 'plan',
      })
    } catch {
      setAiError('Failed to start AI generation.')
      setIsGenerating(false)
      sessionIdRef.current = null
    }
  }, [aiPrompt, isGenerating])

  if (!open) return null

  const handleAddTemplate = (template: AgentDefinition) => {
    onAdd({ ...template })
    onClose()
  }

  const handleAddCustom = () => {
    if (!customName.trim() || !customRole.trim()) return
    const expertise = customExpertise.split(',').map((s) => s.trim()).filter(Boolean)

    if (isEdit && agent && onUpdate) {
      // Edit mode: patch the existing agent in place, preserving its id and
      // model override. Capabilities are now editable and persisted.
      onUpdate(agent.id, {
        name: customName.trim(),
        role: customRole.trim(),
        icon: customIcon,
        color: customColor,
        personality: customPersonality.trim(),
        expertise,
        capabilities: customCaps,
      })
      onClose()
      return
    }

    const newAgent: AgentDefinition = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      role: customRole.trim(),
      icon: customIcon,
      color: customColor,
      personality: customPersonality.trim(),
      expertise,
      capabilities: customCaps,
    }
    onAdd(newAgent)
    onClose()
    // Reset form
    setCustomName('')
    setCustomRole('')
    setCustomIcon('lucide:bot')
    setCustomColor('blue')
    setCustomPersonality('')
    setCustomExpertise('')
    setCustomCaps({ ...DEFAULT_CAPABILITIES })
    setShowAdvanced(false)
  }

  const lowerSearch = search.toLowerCase()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative', width: 640, maxHeight: '80vh',
          background: 'var(--win)',
          border: '1px solid var(--line-3)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-pop)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line-2)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{isEdit ? 'Edit Agent' : 'Add Agent'}</h2>
          <button type="button" onClick={onClose} className="mini-ico">
            <Icon icon="lucide:x" style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Tabs — hidden in edit mode (a single agent is being edited) */}
        {!isEdit && (
          <div className="seg" style={{ margin: '10px 18px 4px', alignSelf: 'flex-start' }}>
            <button type="button" onClick={() => setTab('templates')} className={tab === 'templates' ? 'on' : ''}>Templates</button>
            <button type="button" onClick={() => setTab('custom')} className={tab === 'custom' ? 'on' : ''}>Custom Agent</button>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
          {tab === 'templates' ? (
            <div style={{ padding: 18 }}>
              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 16 }}>
                <Icon icon="lucide:search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 12 }} />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search templates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="control"
                  style={{ paddingLeft: 30 }}
                />
              </div>

              {/* Categories */}
              {AGENT_TEMPLATE_CATEGORIES.map((cat) => {
                const filtered = cat.templates.filter(
                  (t) =>
                    (t.name.toLowerCase().includes(lowerSearch) ||
                      t.role.toLowerCase().includes(lowerSearch) ||
                      t.expertise.some((e) => e.toLowerCase().includes(lowerSearch)))
                )
                if (filtered.length === 0) return null

                return (
                  <div key={cat.name} style={{ marginBottom: 18 }}>
                    <h3 className="section-label" style={{ marginBottom: 8 }}>{cat.name}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {filtered.map((template) => {
                        const alreadyAdded = existingIds.includes(template.id)
                        return (
                          <button
                            type="button"
                            key={template.id}
                            onClick={() => !alreadyAdded && handleAddTemplate(template)}
                            disabled={alreadyAdded}
                            className={'tile' + (alreadyAdded ? '' : ' hover')}
                            style={{
                              padding: 12, display: 'flex', alignItems: 'center', gap: 12,
                              opacity: alreadyAdded ? 0.4 : 1,
                              cursor: alreadyAdded ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <GradientAvatar gradient={template.color} icon={template.icon} size="sm" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.name}</span>
                                {alreadyAdded && (
                                  <Icon icon="lucide:check" style={{ fontSize: 10, color: 'var(--ok)', flexShrink: 0 }} />
                                )}
                              </div>
                              <p className="muted" style={{ fontSize: 10.5, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.role}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: 18, maxWidth: 460 }}>
              {/* AI Generate Section */}
              {isPro ? (
                <div className="msg-tile accent" style={{ marginBottom: 14 }}>
                  <div className="msg-tile-head">
                    <Icon icon="lucide:sparkles" style={{ fontSize: 12, color: 'var(--accent-2)' }} />
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Generate</span>
                  </div>
                  <div className="msg-tile-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleGenerate()
                          }
                        }}
                        placeholder="Describe the agent you need..."
                        disabled={isGenerating}
                        className="control"
                        style={{ flex: 1 }}
                      />
                      {isGenerating ? (
                        <button type="button" onClick={handleCancelGenerate} className="btn sm">
                          <Icon icon="lucide:square" style={{ fontSize: 10 }} />
                          Stop
                        </button>
                      ) : (
                        <button type="button" onClick={handleGenerate} disabled={!aiPrompt.trim()} className="btn sm primary">
                          <Icon icon="lucide:sparkles" style={{ fontSize: 10 }} />
                          Generate
                        </button>
                      )}
                    </div>
                    {!aiPrompt && !isGenerating && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {AI_SUGGESTIONS.map((s) => (
                          <button
                            type="button"
                            key={s}
                            onClick={() => setAiPrompt(s)}
                            className="btn sm ghost"
                            style={{ fontSize: 10, height: 22, padding: '0 8px' }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    {isGenerating && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--accent-2)' }}>
                        <div style={{ width: 12, height: 12, border: '2px solid rgba(96,165,250,0.3)', borderTopColor: 'var(--accent-2)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        Generating agent definition...
                      </div>
                    )}
                    {aiError && <p style={{ fontSize: 10.5, color: 'var(--err)', margin: 0 }}>{aiError}</p>}
                  </div>
                </div>
              ) : (
                <div className="tile" style={{ padding: 12, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon icon="lucide:sparkles" style={{ fontSize: 12, color: 'var(--muted)' }} />
                    <span className="section-label" style={{ margin: 0 }}>AI Generate</span>
                    <span className="tag pro" style={{ marginLeft: 'auto' }}>PRO</span>
                  </div>
                  <p className="muted" style={{ fontSize: 10.5, marginTop: 6, marginBottom: 0 }}>Upgrade to Pro to generate agent configurations with AI.</p>
                </div>
              )}

              {/* Name */}
              <div className="field">
                <label>Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. QA, DevOps, Data Engineer"
                  className="control"
                />
              </div>

              {/* Role */}
              <div className="field">
                <label>Role</label>
                <input
                  type="text"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  placeholder="e.g. Quality Assurance Engineer"
                  className="control"
                />
              </div>

              {/* Icon */}
              <div className="field">
                <label>Icon</label>
                <IconPicker value={customIcon} onChange={setCustomIcon} />
              </div>

              {/* Color */}
              <div className="field">
                <label>Color</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLOR_OPTIONS.map((c) => {
                    void AGENT_COLORS[c]
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setCustomColor(c)}
                        className={'cav cav-grad-' + c}
                        style={{
                          width: 28, height: 28, borderRadius: 8, padding: 0,
                          border: customColor === c ? '2px solid var(--ink)' : '2px solid transparent',
                          transform: customColor === c ? 'scale(1.08)' : 'none',
                          transition: 'transform 0.15s, border-color 0.15s',
                          cursor: 'pointer',
                        }}
                        title={c}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Personality */}
              <div className="field">
                <label>Personality / System Prompt</label>
                <textarea
                  value={customPersonality}
                  onChange={(e) => setCustomPersonality(e.target.value)}
                  placeholder="Describe how this agent should behave..."
                  rows={3}
                  className="control"
                />
              </div>

              {/* Expertise */}
              <div className="field">
                <label>Expertise (comma-separated)</label>
                <input
                  type="text"
                  value={customExpertise}
                  onChange={(e) => setCustomExpertise(e.target.value)}
                  placeholder="e.g. testing, automation, CI/CD"
                  className="control"
                />
              </div>

              {/* Advanced capabilities — restored per-agent permission/capability editor */}
              <div className="field">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="btn sm ghost"
                  style={{ width: '100%', justifyContent: 'space-between' }}
                >
                  <span>Advanced capabilities</span>
                  <Icon icon={showAdvanced ? 'lucide:chevron-up' : 'lucide:chevron-down'} style={{ fontSize: 13 }} />
                </button>
              </div>

              {showAdvanced && (
                <>
                  <div className="field">
                    <label>Tool access</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {TOOL_OPTIONS.map((t) => {
                        const on = customCaps.tools.includes(t.id)
                        return (
                          <button
                            type="button"
                            key={t.id}
                            onClick={() => toggleTool(t.id)}
                            className={'tag' + (on ? ' accent' : '')}
                            style={{ cursor: 'pointer', opacity: on ? 1 : 0.5 }}
                          >
                            {t.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="field">
                    <label>Permission level</label>
                    <select
                      className="control"
                      value={customCaps.permissionLevel}
                      onChange={(e) => patchCaps({ permissionLevel: e.target.value as PermissionLevel })}
                    >
                      {PERMISSION_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Max tokens per request</label>
                    <input
                      type="number" className="control" min={256} max={200000} value={customCaps.maxTokensPerRequest}
                      onChange={(e) => patchCaps({ maxTokensPerRequest: Number(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="field">
                    <label>Context window size</label>
                    <input
                      type="number" className="control" min={1000} max={1000000} value={customCaps.contextWindowSize}
                      onChange={(e) => patchCaps({ contextWindowSize: Number(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="field">
                    <label>Conversation history limit (0 = unlimited)</label>
                    <input
                      type="number" className="control" min={0} max={1000} value={customCaps.conversationHistoryLimit}
                      onChange={(e) => patchCaps({ conversationHistoryLimit: Number(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="field">
                    <label>Temperature · {customCaps.temperature.toFixed(2)}</label>
                    <input
                      type="range" min={0} max={1} step={0.05} value={customCaps.temperature} style={{ width: '100%' }}
                      onChange={(e) => patchCaps({ temperature: Number(e.target.value) })}
                    />
                  </div>

                  <div className="field">
                    <label>File access paths (comma-separated, empty = unrestricted)</label>
                    <input
                      type="text" className="control" placeholder="e.g. ./src, ./docs"
                      value={customCaps.allowedPaths.join(', ')}
                      onChange={(e) => patchCaps({ allowedPaths: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                    />
                  </div>

                  <div className="field">
                    <label>Allowed MCP servers (comma-separated, empty = all)</label>
                    <input
                      type="text" className="control" placeholder="e.g. jira, github"
                      value={customCaps.allowedMcpServers.join(', ')}
                      onChange={(e) => patchCaps({ allowedMcpServers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                    />
                  </div>

                  <div className="field">
                    <label>Custom instructions (per-agent, like CLAUDE.md)</label>
                    <textarea
                      className="control" rows={2} placeholder="Instructions appended to this agent's system prompt..."
                      value={customCaps.customInstructions}
                      onChange={(e) => patchCaps({ customInstructions: e.target.value })}
                    />
                  </div>

                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      Persistent memory
                      <input type="checkbox" checked={customCaps.memoryEnabled} onChange={(e) => patchCaps({ memoryEnabled: e.target.checked })} />
                    </label>
                  </div>
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      Auto-summarize long conversations
                      <input type="checkbox" checked={customCaps.memorySummarizationEnabled} onChange={(e) => patchCaps({ memorySummarizationEnabled: e.target.checked })} />
                    </label>
                  </div>
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      Auto-approve read-only operations
                      <input type="checkbox" checked={customCaps.autoApproveReadOnly} onChange={(e) => patchCaps({ autoApproveReadOnly: e.target.checked })} />
                    </label>
                  </div>
                </>
              )}

              {/* Preview */}
              {customName && (
                <div className="tile" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
                  <GradientAvatar gradient={customColor} icon={customIcon} size="sm" />
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{customName}</span>
                    <p className="muted" style={{ fontSize: 10.5, margin: 0 }}>{customRole || 'Custom Agent'}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line-2)' }}>
            <button type="button" onClick={onClose} className="btn sm ghost">Cancel</button>
            <button
              type="button"
              onClick={handleAddCustom}
              disabled={!customName.trim() || !customRole.trim()}
              className="btn primary"
            >
              {isEdit ? 'Save' : 'Add Agent'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
