import { AGENT_COLORS } from '../../data/agent-templates'
import type { AgentDefinition } from '../../types'

interface AgentSkillsPanelProps {
  agents: AgentDefinition[]
  onClose: () => void
}

export function AgentSkillsPanel({ agents, onClose }: AgentSkillsPanelProps) {
  return (
    <div className="mb-2 rounded-xl border border-neutral-700/60 bg-neutral-900/95 backdrop-blur-sm shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-700/50 bg-neutral-800/40">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <span className="text-xs font-semibold text-neutral-200 tracking-wide uppercase">Team Skills</span>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer p-0.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tip */}
      <div className="px-4 py-2 border-b border-neutral-700/30 bg-blue-500/5">
        <p className="text-[11px] text-neutral-400">
          Type <kbd className="px-1 py-0.5 bg-neutral-700 text-neutral-300 rounded text-[10px] font-mono">@</kbd> followed by an agent name to route your message to that agent.
        </p>
      </div>

      {/* Agent list */}
      <div className="max-h-64 overflow-y-auto divide-y divide-neutral-800/50">
        {agents.map((agent) => {
          const colors = AGENT_COLORS[agent.color] || AGENT_COLORS.blue
          return (
            <div key={agent.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-neutral-800/30 transition-colors">
              {/* Color dot + name */}
              <div className="shrink-0 mt-0.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${colors.bgLight} ${colors.text}`}>
                  {agent.name[0]}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-xs font-semibold ${colors.text}`}>@{agent.name}</span>
                  <span className="text-[10px] text-neutral-500">{agent.role}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {agent.expertise.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${colors.bgLight} ${colors.text} border ${colors.border}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer tip */}
      <div className="px-4 py-2 border-t border-neutral-700/30 bg-neutral-800/20">
        <p className="text-[10px] text-neutral-500">
          All agents respond by default. Use <kbd className="px-1 py-0.5 bg-neutral-700/60 text-neutral-400 rounded font-mono">@Name</kbd> to direct a specific agent's attention.
        </p>
      </div>
    </div>
  )
}
