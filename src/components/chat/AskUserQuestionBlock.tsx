import { useState, useEffect, useRef } from 'react'
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

  // Track whether this block was ever the active question
  // If it was active but now isn't, and wasn't answered, it was skipped
  const wasEverActive = useRef(false)
  useEffect(() => {
    if (isActive) wasEverActive.current = true
  }, [isActive])
  const wasSkipped = wasEverActive.current && !isActive && !wasAnswered

  // Track local submitted state (for immediate feedback before store updates)
  const [submitted, setSubmitted] = useState(false)

  // Track selections: question text -> selected option label(s)
  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {}
    for (const q of questions) {
      init[q.question] = []
    }
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

  // Determine header text and style
  let headerText: string
  let headerColor: string
  let borderColor: string
  let bgColor: string

  if (isActive && !submitted) {
    headerText = 'Claude has a question'
    headerColor = 'text-blue-300'
    borderColor = 'border-blue-500/30'
    bgColor = 'bg-blue-950/20'
  } else if (wasAnswered || submitted) {
    headerText = 'Answered'
    headerColor = 'text-emerald-400'
    borderColor = 'border-emerald-500/20'
    bgColor = 'bg-emerald-950/10'
  } else if (wasSkipped) {
    headerText = 'Claude continued without waiting'
    headerColor = 'text-neutral-500'
    borderColor = 'border-neutral-700/30'
    bgColor = 'bg-neutral-900/30'
  } else {
    // Historic (loaded from DB, not from this session)
    headerText = 'Question'
    headerColor = 'text-neutral-500'
    borderColor = 'border-neutral-700/30'
    bgColor = 'bg-neutral-900/30'
  }

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${borderColor}`}>
        {(isActive && !submitted) ? (
          <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ) : (wasAnswered || submitted) ? (
          <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
        <span className={`text-sm font-medium ${headerColor}`}>
          {headerText}
        </span>
      </div>

      {/* Questions */}
      <div className="p-4 space-y-4">
        {questions.map((q, qi) => (
          <div key={qi}>
            {q.header && (
              <span className={`inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded mb-1.5 ${
                canInteract ? 'text-blue-400 bg-blue-500/10' : 'text-neutral-500 bg-neutral-700/30'
              }`}>
                {q.header}
              </span>
            )}
            <p className={`text-sm mb-2 ${canInteract ? 'text-neutral-200' : 'text-neutral-400'}`}>{q.question}</p>

            <div className="space-y-1.5">
              {q.options.map((opt, oi) => {
                const selected = (selections[q.question] || []).includes(opt.label)
                return (
                  <button
                    key={oi}
                    onClick={() => handleSelect(q.question, opt.label, q.multiSelect)}
                    disabled={!canInteract}
                    className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                      selected
                        ? (wasAnswered || submitted)
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-blue-500/50 bg-blue-500/15 text-blue-200'
                        : canInteract
                        ? 'border-neutral-700/50 bg-neutral-800/40 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800/60'
                        : 'border-neutral-700/30 bg-neutral-800/20 text-neutral-500'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0">
                        {q.multiSelect ? (
                          <span className={`inline-block w-3.5 h-3.5 rounded border ${
                            selected
                              ? (wasAnswered || submitted) ? 'bg-emerald-500 border-emerald-500' : 'bg-blue-500 border-blue-500'
                              : 'border-neutral-600'
                          }`}>
                            {selected && (
                              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                        ) : (
                          <span className={`inline-block w-3.5 h-3.5 rounded-full border-2 ${
                            selected
                              ? (wasAnswered || submitted) ? 'border-emerald-500 bg-emerald-500 shadow-[inset_0_0_0_2px_rgba(0,0,0,0.3)]' : 'border-blue-500 bg-blue-500 shadow-[inset_0_0_0_2px_rgba(0,0,0,0.3)]'
                              : 'border-neutral-600'
                          }`} />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium">{opt.label}</div>
                        {opt.description && (
                          <div className={`text-xs mt-0.5 ${canInteract ? 'text-neutral-500' : 'text-neutral-600'}`}>{opt.description}</div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Submit */}
      {canInteract && (
        <div className="px-4 pb-3">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              allAnswered
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
            }`}
          >
            Submit
          </button>
        </div>
      )}
    </div>
  )
}
