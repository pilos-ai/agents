import { useState } from 'react'

interface Props {
  text: string
}

export function ThinkingBlock({ text }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 text-neutral-500 hover:text-neutral-300 transition-colors text-xs"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="italic">Thinking...</span>
        <span className="text-neutral-600">({text.length} chars)</span>
      </button>

      {expanded && (
        <div className="ml-5 mt-1 px-3 py-2 rounded-md bg-neutral-900/50 border border-neutral-800 text-neutral-400 text-xs whitespace-pre-wrap max-h-60 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  )
}
