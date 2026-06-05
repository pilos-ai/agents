/**
 * ThinkingBlock — collapsed "Thinking…" tile that lives inside a .ctext flow.
 * Restyled to the prototype's subtle muted card with italic body + tdots
 * animation in the header (matches the chat typing indicator vocabulary).
 */
import { useState } from 'react'

interface Props {
  text: string
}

export function ThinkingBlock({ text }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="thinking-box">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8, color: 'inherit', font: 'inherit',
        }}
      >
        <span className="head">
          Thinking
          <span className="tdots"><span /><span /><span /></span>
        </span>
        <span style={{ fontStyle: 'normal', color: 'var(--faint)', fontSize: 11 }}>
          {text.length} chars · {expanded ? 'hide' : 'show'}
        </span>
      </button>
      {expanded && (
        <span className="thinking-body">{text}</span>
      )}
    </div>
  )
}
