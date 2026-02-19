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
    <div className="my-2 rounded-md overflow-hidden border border-neutral-700/50">
      <div className="px-3 py-1.5 bg-neutral-800 text-neutral-300 text-xs font-medium flex items-center gap-2">
        <span>✏️</span>
        <span>{filePath}</span>
      </div>
      <div className="overflow-x-auto">
        <pre className="text-xs leading-5 p-0 m-0">
          {lines.map((line, i) => {
            let className = 'px-3 '
            if (line.startsWith('+') && !line.startsWith('+++')) {
              className += 'bg-green-950/40 text-green-300'
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              className += 'bg-red-950/40 text-red-300'
            } else if (line.startsWith('@@')) {
              className += 'bg-blue-950/30 text-blue-400'
            } else {
              className += 'text-neutral-400'
            }
            return (
              <div key={i} className={className}>
                {line}
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}
