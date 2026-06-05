/**
 * FileDiffBlock — unified diff rendered with the prototype's `.code-block`
 * styling plus the `.diff-line.add/.del/.hunk` token variants.
 */
import { createTwoFilesPatch } from 'diff'

interface Props {
  filePath: string
  oldContent: string
  newContent: string
}

export function FileDiffBlock({ filePath, oldContent, newContent }: Props) {
  const diff = createTwoFilesPatch(filePath, filePath, oldContent, newContent, '', '', {
    context: 3,
  })

  const lines = diff.split('\n')

  return (
    <div className="msg-tile">
      <div className="msg-tile-head">
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent-2)' }}>diff</span>
        <span className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 500 }}>{filePath}</span>
      </div>
      <div className="code-block no-pad">
        {lines.map((line, i) => {
          let cls = 'tline diff-line'
          if (line.startsWith('+') && !line.startsWith('+++')) cls += ' add'
          else if (line.startsWith('-') && !line.startsWith('---')) cls += ' del'
          else if (line.startsWith('@@')) cls += ' hunk'
          return <div key={i} className={cls}>{line || ' '}</div>
        })}
      </div>
    </div>
  )
}
