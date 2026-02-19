import { useState } from 'react'
import type { AgentDefinition } from '../../types'
import { AGENT_COLORS } from '../../data/agent-templates'

interface Props {
  agent: AgentDefinition
  onSave: (agent: AgentDefinition) => void
  onClose: () => void
}

const COLOR_OPTIONS = Object.keys(AGENT_COLORS) as string[]

export function AgentEditModal({ agent, onSave, onClose }: Props) {
  const [name, setName] = useState(agent.name)
  const [emoji, setEmoji] = useState(agent.emoji)
  const [color, setColor] = useState(agent.color)
  const [role, setRole] = useState(agent.role)
  const [personality, setPersonality] = useState(agent.personality)
  const [expertiseStr, setExpertiseStr] = useState(agent.expertise.join(', '))

  const handleSave = () => {
    onSave({
      ...agent,
      name: name.trim(),
      emoji: emoji.trim(),
      color,
      role: role.trim(),
      personality: personality.trim(),
      expertise: expertiseStr.split(',').map((s) => s.trim()).filter(Boolean),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-[420px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
          <h3 className="text-sm font-semibold">Edit Agent</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-neutral-400 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-neutral-800 text-sm text-neutral-100 rounded-md px-3 py-1.5 border border-neutral-700 outline-none focus:border-blue-500"
              />
            </div>
            <div className="w-16">
              <label className="block text-xs text-neutral-400 mb-1">Emoji</label>
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-full bg-neutral-800 text-sm text-center rounded-md px-2 py-1.5 border border-neutral-700 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Color</label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((c) => {
                const colors = AGENT_COLORS[c]
                return (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${colors.bgLight} ${
                      color === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    title={c}
                  >
                    <span className={`text-xs ${colors.text}`}>{c[0].toUpperCase()}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Role</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-neutral-800 text-sm text-neutral-100 rounded-md px-3 py-1.5 border border-neutral-700 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Personality</label>
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              rows={3}
              className="w-full bg-neutral-800 text-sm text-neutral-100 rounded-md px-3 py-1.5 border border-neutral-700 outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Expertise (comma-separated)</label>
            <input
              value={expertiseStr}
              onChange={(e) => setExpertiseStr(e.target.value)}
              className="w-full bg-neutral-800 text-sm text-neutral-100 rounded-md px-3 py-1.5 border border-neutral-700 outline-none focus:border-blue-500"
              placeholder="e.g. implementation, debugging, code review"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-neutral-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-md transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
