/**
 * AskUserQuestionBlock — restyled as a prototype `.msg-tile` with `.opt-btn`
 * choices. Behavior preserved 1:1 — uses respondToQuestion / answeredQuestionIds
 * from the conversation store.
 */
import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useConversationStore } from '../../store/useConversationStore'
import type { ToolUseBlock, AskUserQuestionItem } from '../../types'

interface Props {
  block: ToolUseBlock
}

export function AskUserQuestionBlock({ block }: Props) {
  const questions = (block.input.questions as AskUserQuestionItem[]) || []
  const askUserQuestion = useConversationStore((s) => s.askUserQuestion)
  const answeredQuestionIds = useConversationStore((s) => s.answeredQuestionIds)
  const respondToQuestion = useConversationStore((s) => s.respondToQuestion)

  const isActive = askUserQuestion?.toolUseId === block.id
  const wasAnswered = answeredQuestionIds.has(block.id)

  const wasEverActive = useRef(false)
  useEffect(() => {
    if (isActive) wasEverActive.current = true
  }, [isActive])
  const wasSkipped = wasEverActive.current && !isActive && !wasAnswered

  const [submitted, setSubmitted] = useState(false)

  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {}
    for (const q of questions) init[q.question] = []
    return init
  })

  const canInteract = isActive && !submitted

  const handleSelect = (question: string, label: string, multiSelect: boolean) => {
    if (!canInteract) return
    setSelections((prev) => {
      const current = prev[question] || []
      if (multiSelect) {
        const next = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current, label]
        return { ...prev, [question]: next }
      }
      return { ...prev, [question]: [label] }
    })
  }

  const handleSubmit = () => {
    const answers: Record<string, string> = {}
    for (const [question, selected] of Object.entries(selections)) {
      answers[question] = selected.join(', ')
    }
    setSubmitted(true)
    respondToQuestion(answers)
  }

  const allAnswered = questions.every((q) => (selections[q.question] || []).length > 0)

  let headerText: string
  let tileVariant: string
  let icon: ReactNode
  if (isActive && !submitted) {
    headerText = 'Claude has a question'
    tileVariant = 'accent'
    icon = (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent-2)' }}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  } else if (wasAnswered || submitted) {
    headerText = 'Answered'
    tileVariant = 'ok'
    icon = (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--ok)' }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  } else if (wasSkipped) {
    headerText = 'Claude continued without waiting'
    tileVariant = ''
    icon = <span className="muted">—</span>
  } else {
    headerText = 'Question'
    tileVariant = ''
    icon = (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--muted)' }}>
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }

  return (
    <div className={'msg-tile' + (tileVariant ? ' ' + tileVariant : '')}>
      <div className="msg-tile-head">
        {icon}
        <span>{headerText}</span>
      </div>
      <div className="msg-tile-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q, qi) => (
          <div key={qi}>
            {q.header && (
              <span className="tag accent" style={{ marginBottom: 6 }}>{q.header}</span>
            )}
            <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 8 }}>{q.question}</div>
            <div className="opt-list">
              {q.options.map((opt, oi) => {
                const selected = (selections[q.question] || []).includes(opt.label)
                const okVariant = (wasAnswered || submitted) ? 'ok' : ''
                return (
                  <button
                    type="button"
                    key={oi}
                    onClick={() => handleSelect(q.question, opt.label, q.multiSelect)}
                    disabled={!canInteract}
                    className={'opt-btn' + (selected ? ' selected ' + okVariant : '')}
                  >
                    <span className={'opt-mark' + (q.multiSelect ? '' : ' radio')}>
                      {selected && q.multiSelect && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="opt-body">
                      <span className="opt-label">{opt.label}</span>
                      {opt.description && <span className="opt-desc">{opt.description}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {canInteract && (
        <div className="msg-tile-foot">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="btn sm primary"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  )
}
