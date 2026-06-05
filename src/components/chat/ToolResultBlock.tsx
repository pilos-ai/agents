/**
 * ToolResultBlock — short result inline shown as a `.tool-chip`; long results
 * are expandable into a prototype `.code-block`. Errors auto-expand with the
 * `.err` chip variant.
 */
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
    <div className="msg-tools">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={'tool-chip expand' + (expanded ? ' open' : '') + (isError ? ' err' : '')}
      >
        {isError ? (
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <span className="ok">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
        <span>{isError ? 'Error' : 'Result'}</span>
        {hasMore && <span className="muted">· {lineCount} lines</span>}
        {!expanded && content && (
          <span className="muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preview.slice(0, PREVIEW_CHARS)}
          </span>
        )}
      </button>
      {expanded && content && (
        <div style={{ flexBasis: '100%' }}>
          <CodeBlock language="" code={content} />
        </div>
      )}
    </div>
  )
}
