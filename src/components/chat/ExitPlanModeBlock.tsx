/**
 * ExitPlanModeBlock — prototype `.msg-tile` for plan review.
 * Renders the plan via MarkdownRenderer inside the body and exposes the
 * Approve / Suggest Changes buttons in the footer. Same store wiring
 * (respondToPlanExit) as before.
 */
import { useState } from 'react'
import { useConversationStore } from '../../store/useConversationStore'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { ToolUseBlock } from '../../types'

interface Props {
  block: ToolUseBlock
}

export function ExitPlanModeBlock({ block }: Props) {
  const exitPlanMode = useConversationStore((s) => s.exitPlanMode)
  const respondToPlanExit = useConversationStore((s) => s.respondToPlanExit)
  const [feedback, setFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)

  const isActive = exitPlanMode?.toolUseId === block.id
  const hasFeedback = feedback.trim().length > 0
  const planMarkdown = (block.input.plan as string) || ''

  return (
    <div className="msg-tile ok">
      <div className="msg-tile-head">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--ok)' }}>
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
        <span>{isActive ? 'Plan ready for review' : 'Plan reviewed'}</span>
      </div>
      <div className="msg-tile-body">
        {planMarkdown ? (
          <div className="ctext">
            <MarkdownRenderer content={planMarkdown} />
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            Claude has finished planning and is waiting for your approval before proceeding.
          </p>
        )}

        {isActive && showFeedback && (
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label>Feedback for plan</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe what to change in the plan..."
              className="control"
              rows={3}
              autoFocus
            />
          </div>
        )}
      </div>
      {isActive && (
        <div className="msg-tile-foot">
          <button
            type="button"
            onClick={() => respondToPlanExit(true, hasFeedback ? feedback.trim() : undefined)}
            className="btn sm primary"
          >
            {hasFeedback ? 'Approve with Suggestions' : 'Approve Plan'}
          </button>
          {!showFeedback ? (
            <button
              type="button"
              onClick={() => setShowFeedback(true)}
              className="btn sm ghost"
            >
              Edit Plan
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (hasFeedback) respondToPlanExit(false, feedback.trim())
                else respondToPlanExit(false)
              }}
              className="btn sm"
              style={{ color: 'var(--warn)', borderColor: 'rgba(245,158,11,0.3)' }}
            >
              Suggest Changes
            </button>
          )}
        </div>
      )}
    </div>
  )
}
