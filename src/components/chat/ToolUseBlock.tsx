import { useState } from 'react'
import type { ToolUseBlock as ToolUseBlockType } from '../../types'
import { CodeBlock } from './CodeBlock'

interface Props {
  block: ToolUseBlockType
}

const TOOL_ICONS: Record<string, string> = {
  Bash: '$ ',
  Read: '📄 ',
  Edit: '✏️ ',
  Write: '📝 ',
  Glob: '🔍 ',
  Grep: '🔎 ',
  Task: '📋 ',
  WebFetch: '🌐 ',
  WebSearch: '🔍 ',
}

export function ToolUseBlock({ block }: Props) {
  const [expanded, setExpanded] = useState(false)
  const icon = TOOL_ICONS[block.name] || '🔧 '

  const summary = getToolSummary(block)

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-neutral-800/40 hover:bg-neutral-800/60 rounded-md text-left transition-colors border border-neutral-700/50"
      >
        <svg
          className={`w-3 h-3 text-neutral-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        <span className="text-xs">
          <span className="text-neutral-300">{icon}{block.name}</span>
          {summary && (
            <span className="text-neutral-500 ml-2">{summary}</span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 ml-5">
          <CodeBlock language="json" code={JSON.stringify(block.input, null, 2)} />
        </div>
      )}
    </div>
  )
}

function getToolSummary(block: ToolUseBlockType): string {
  const input = block.input
  switch (block.name) {
    case 'Bash':
      return (input.command as string)?.slice(0, 60) || ''
    case 'Read':
      return (input.file_path as string) || ''
    case 'Edit':
      return (input.file_path as string) || ''
    case 'Write':
      return (input.file_path as string) || ''
    case 'Glob':
      return (input.pattern as string) || ''
    case 'Grep':
      return (input.pattern as string) || ''
    default:
      return ''
  }
}
