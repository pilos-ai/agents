import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '../common/Icon'
import { GradientAvatar } from './components/GradientAvatar'
import { AGENT_TEMPLATE_CATEGORIES, AGENT_COLORS, DEFAULT_CAPABILITIES } from '../../data/agent-templates'
import { api } from '../../api'
import { extractJson } from '../../utils/workflow-ai'
import { useLicenseStore } from '../../store/useLicenseStore'
import type { AgentDefinition, ClaudeEvent } from '../../types'

interface AddAgentDialogProps {
  open: boolean
  onClose: () => void
  onAdd: (agent: AgentDefinition) => void
  existingIds: string[]
}

type Tab = 'templates' | 'custom'

const COLOR_OPTIONS = Object.keys(AGENT_COLORS)

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

export function AddAgentDialog({ open, onClose, onAdd, existingIds }: AddAgentDialogProps) {
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
      setTab('templates')
      setAiPrompt('')
      setAiError('')
      setIsGenerating(false)
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [open])

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
    const agent: AgentDefinition = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      role: customRole.trim(),
      icon: customIcon,
      color: customColor,
      personality: customPersonality.trim(),
      expertise: customExpertise.split(',').map((s) => s.trim()).filter(Boolean),
      capabilities: { ...DEFAULT_CAPABILITIES },
    }
    onAdd(agent)
    onClose()
    // Reset form
    setCustomName('')
    setCustomRole('')
    setCustomIcon('lucide:bot')
    setCustomColor('blue')
    setCustomPersonality('')
    setCustomExpertise('')
  }

  const lowerSearch = search.toLowerCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-pilos-bg border border-pilos-border rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pilos-border">
          <h2 className="text-sm font-bold text-white">Add Agent</h2>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white rounded transition-colors">
            <Icon icon="lucide:x" className="text-sm" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-pilos-border px-5">
          <button
            onClick={() => setTab('templates')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === 'templates' ? 'text-blue-400 border-blue-400' : 'text-zinc-500 border-transparent hover:text-white'
            }`}
          >
            Templates
          </button>
          <button
            onClick={() => setTab('custom')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === 'custom' ? 'text-blue-400 border-blue-400' : 'text-zinc-500 border-transparent hover:text-white'
            }`}
          >
            Custom Agent
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {tab === 'templates' ? (
            <div className="p-5">
              {/* Search */}
              <div className="relative mb-4">
                <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-xs" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search templates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-pilos-card border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
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
                  <div key={cat.name} className="mb-5">
                    <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">{cat.name}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {filtered.map((template) => {
                        const alreadyAdded = existingIds.includes(template.id)
                        return (
                          <button
                            key={template.id}
                            onClick={() => !alreadyAdded && handleAddTemplate(template)}
                            disabled={alreadyAdded}
                            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                              alreadyAdded
                                ? 'border-pilos-border/50 opacity-40 cursor-not-allowed'
                                : 'border-pilos-border hover:border-zinc-600 hover:bg-zinc-800/50'
                            }`}
                          >
                            <GradientAvatar gradient={template.color} icon={template.icon} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-white truncate">{template.name}</span>
                                {alreadyAdded && (
                                  <Icon icon="lucide:check" className="text-[10px] text-green-400 flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-[10px] text-zinc-500 truncate">{template.role}</p>
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
            <div className="p-5 space-y-4 max-w-md">
              {/* AI Generate Section */}
              {isPro ? (
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon icon="lucide:sparkles" className="text-blue-400 text-xs" />
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">AI Generate</span>
                  </div>
                  <div className="flex gap-2">
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
                      className="flex-1 px-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/50 disabled:opacity-50"
                    />
                    {isGenerating ? (
                      <button
                        onClick={handleCancelGenerate}
                        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        <Icon icon="lucide:square" className="text-[10px]" />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={handleGenerate}
                        disabled={!aiPrompt.trim()}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0"
                      >
                        <Icon icon="lucide:sparkles" className="text-[10px]" />
                        Generate
                      </button>
                    )}
                  </div>
                  {/* Suggestions */}
                  {!aiPrompt && !isGenerating && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {AI_SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => setAiPrompt(s)}
                          className="px-2 py-0.5 text-[10px] text-zinc-500 hover:text-blue-400 bg-zinc-800/50 hover:bg-blue-500/10 rounded transition-colors truncate max-w-[280px]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {isGenerating && (
                    <div className="flex items-center gap-2 text-[10px] text-blue-400">
                      <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                      Generating agent definition...
                    </div>
                  )}
                  {aiError && (
                    <p className="text-[10px] text-red-400">{aiError}</p>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-zinc-800/30 border border-pilos-border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Icon icon="lucide:sparkles" className="text-zinc-600 text-xs" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">AI Generate</span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/15 text-amber-400 rounded ml-auto">PRO</span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">Upgrade to Pro to generate agent configurations with AI.</p>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1 block">Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. QA, DevOps, Data Engineer"
                  className="w-full px-3 py-2 bg-pilos-card border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1 block">Role</label>
                <input
                  type="text"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  placeholder="e.g. Quality Assurance Engineer"
                  className="w-full px-3 py-2 bg-pilos-card border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
                />
              </div>

              {/* Color */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map((c) => {
                    const styles = AGENT_COLORS[c]
                    return (
                      <button
                        key={c}
                        onClick={() => setCustomColor(c)}
                        className={`w-7 h-7 rounded-lg border-2 transition-all ${styles.bgLight} ${
                          customColor === c ? 'border-white scale-110' : 'border-transparent hover:border-zinc-600'
                        }`}
                        title={c}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Personality */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1 block">Personality / System Prompt</label>
                <textarea
                  value={customPersonality}
                  onChange={(e) => setCustomPersonality(e.target.value)}
                  placeholder="Describe how this agent should behave..."
                  rows={3}
                  className="w-full px-3 py-2 bg-pilos-card border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/50 resize-none"
                />
              </div>

              {/* Expertise */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1 block">Expertise (comma-separated)</label>
                <input
                  type="text"
                  value={customExpertise}
                  onChange={(e) => setCustomExpertise(e.target.value)}
                  placeholder="e.g. testing, automation, CI/CD"
                  className="w-full px-3 py-2 bg-pilos-card border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500/50"
                />
              </div>

              {/* Preview */}
              {customName && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-pilos-border bg-pilos-card/50">
                  <GradientAvatar gradient={customColor} icon={customIcon} size="sm" />
                  <div>
                    <span className="text-xs font-bold text-white">{customName}</span>
                    <p className="text-[10px] text-zinc-500">{customRole || 'Custom Agent'}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === 'custom' && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-pilos-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-zinc-500 hover:text-white text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCustom}
              disabled={!customName.trim() || !customRole.trim()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all"
            >
              Add Agent
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
