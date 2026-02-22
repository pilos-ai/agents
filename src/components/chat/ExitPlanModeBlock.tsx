import { useConversationStore } from '../../store/useConversationStore'
import type { ToolUseBlock } from '../../types'

interface Props {
  block: ToolUseBlock
}

export function ExitPlanModeBlock({ block }: Props) {
  const exitPlanMode = useConversationStore((s) => s.exitPlanMode)
  const respondToPlanExit = useConversationStore((s) => s.respondToPlanExit)

  const isActive = exitPlanMode?.toolUseId === block.id

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-900/20 border-b border-emerald-500/20">
        <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
        <span className="text-sm font-medium text-emerald-300">
          {isActive ? 'Plan ready for review' : 'Plan reviewed'}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {isActive ? (
          <>
            <p className="text-sm text-neutral-300 mb-3">
              Claude has finished planning and is waiting for your approval before proceeding with the implementation.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => respondToPlanExit(true)}
                className="px-4 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors"
              >
                Approve Plan
              </button>
              <button
                onClick={() => respondToPlanExit(false)}
                className="px-4 py-1.5 text-sm font-medium bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-md transition-colors"
              >
                Revise
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500">Plan has been reviewed.</p>
        )}
      </div>
    </div>
  )
}
