import { useState } from 'react'
import type { ToolResultBlock as ToolResultBlockType } from '../../types'
import { CodeBlock } from './CodeBlock'

interface Props {
  block: ToolResultBlockType
}

const PREVIEW_LINES = 6
const PREVIEW_CHARS = 120

export function ToolResultBlock({ block }: Props) {
  const isError = block.is_error

  const content = typeof block.content === 'string'
    ? block.content
    : block.content?.map((c) => c.text || '').join('\n') || ''

  const lines = content.split('\n')
  const lineCount = lines.length
  const hasMore = lineCount > PREVIEW_LINES
  const isShort = !hasMore

  // Auto-expand errors and short results
  const [expanded, setExpanded] = useState(isError || isShort)

  const preview = lines.slice(0, PREVIEW_LINES).join('\n')

  return (
    <div className="my-1 ml-5">
      <div
        className={`rounded-md border ${
          isError
            ? 'border-red-800/50 bg-red-950/20'
            : 'border-neutral-700/30 bg-neutral-900/30'
        }`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
        >
          <span className={`text-xs ${isError ? 'text-red-400' : 'text-green-400'}`}>
            {isError ? '✗ Error' : '✓ Result'}
          </span>
          {hasMore && (
            <span className="text-xs text-neutral-500">
              ({lineCount} lines)
            </span>
          )}
          {!expanded && content && (
            <span className="text-xs text-neutral-500 truncate flex-1">
              {preview.slice(0, PREVIEW_CHARS)}
            </span>
          )}
          {hasMore && (
            <svg
              className={`w-3 h-3 text-neutral-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>

        {expanded && content && (
          <div className="px-3 pb-2">
            <CodeBlock language="" code={content} />
          </div>
        )}
      </div>
    </div>
  )
}
