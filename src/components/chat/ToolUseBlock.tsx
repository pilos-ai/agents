import { useState } from 'react'
import type { ToolUseBlock as ToolUseBlockType } from '../../types'
import { api } from '../../api'
import { CodeBlock } from './CodeBlock'
import { AskUserQuestionBlock } from './AskUserQuestionBlock'
import { ExitPlanModeBlock } from './ExitPlanModeBlock'

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

// Tools that show expanded rich content by default
const EXPANDED_TOOLS = new Set(['Edit', 'Write', 'Bash'])

export function ToolUseBlock({ block }: Props) {
  const isExpanded = EXPANDED_TOOLS.has(block.name)
  const [showRaw, setShowRaw] = useState(false)

  // Interactive tools get their own dedicated components
  if (block.name === 'AskUserQuestion') {
    return <div className="my-1"><AskUserQuestionBlock block={block} /></div>
  }
  if (block.name === 'ExitPlanMode') {
    return <div className="my-1"><ExitPlanModeBlock block={block} /></div>
  }

  return (
    <div className="my-1">
      {block.name === 'Edit' ? (
        <EditBlock block={block} showRaw={showRaw} onToggleRaw={() => setShowRaw(!showRaw)} />
      ) : block.name === 'Write' ? (
        <WriteBlock block={block} showRaw={showRaw} onToggleRaw={() => setShowRaw(!showRaw)} />
      ) : block.name === 'Bash' ? (
        <BashBlock block={block} showRaw={showRaw} onToggleRaw={() => setShowRaw(!showRaw)} />
      ) : (
        <CollapsedBlock block={block} />
      )}
    </div>
  )
}

// ── Edit Block: inline diff + revert ──

function EditBlock({ block, showRaw, onToggleRaw }: { block: ToolUseBlockType; showRaw: boolean; onToggleRaw: () => void }) {
  const filePath = block.input.file_path as string || ''
  const oldString = block.input.old_string as string || ''
  const newString = block.input.new_string as string || ''
  const [revertState, setRevertState] = useState<'idle' | 'loading' | 'reverted' | 'error'>('idle')
  const [revertError, setRevertError] = useState('')

  const handleRevert = async () => {
    if (revertState === 'reverted' || revertState === 'loading') return
    setRevertState('loading')
    try {
      const result = await api.files.revertEdit(filePath, oldString, newString)
      if (result.success) {
        setRevertState('reverted')
      } else {
        setRevertState('error')
        setRevertError(result.error || 'Revert failed')
      }
    } catch {
      setRevertState('error')
      setRevertError('Revert failed')
    }
  }

  const oldLines = oldString ? oldString.split('\n') : []
  const newLines = newString ? newString.split('\n') : []
  const shortPath = filePath.split('/').slice(-3).join('/')

  return (
    <div className="rounded-md overflow-hidden border border-neutral-700/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800">
        <button onClick={onToggleRaw} className="flex items-center gap-2 text-xs text-neutral-300 hover:text-white transition-colors">
          <span>✏️</span>
          <span className="font-medium">Edit</span>
          <span className="text-neutral-400">{shortPath}</span>
        </button>
        <div className="flex items-center gap-2">
          {revertState === 'error' && (
            <span className="text-xs text-red-400">{revertError}</span>
          )}
          <button
            onClick={handleRevert}
            disabled={revertState === 'reverted' || revertState === 'loading'}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              revertState === 'reverted'
                ? 'bg-green-900/40 text-green-400 cursor-default'
                : revertState === 'loading'
                ? 'bg-neutral-700 text-neutral-400 cursor-wait'
                : revertState === 'error'
                ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60'
                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            {revertState === 'reverted' ? 'Reverted' : revertState === 'loading' ? '...' : 'Revert'}
          </button>
        </div>
      </div>

      {/* Diff view */}
      {!showRaw && (oldString || newString) && (
        <div className="overflow-x-auto">
          <pre className="text-xs leading-5 p-0 m-0">
            {oldLines.map((line, i) => (
              <div key={`old-${i}`} className="px-3 bg-red-950/40 text-red-300">
                <span className="select-none text-red-500/60 mr-2">-</span>{line}
              </div>
            ))}
            {newLines.map((line, i) => (
              <div key={`new-${i}`} className="px-3 bg-green-950/40 text-green-300">
                <span className="select-none text-green-500/60 mr-2">+</span>{line}
              </div>
            ))}
          </pre>
        </div>
      )}

      {/* Raw JSON (toggle) */}
      {showRaw && (
        <div className="p-2">
          <CodeBlock language="json" code={JSON.stringify(block.input, null, 2)} />
        </div>
      )}
    </div>
  )
}

// ── Write Block: content preview ──

function WriteBlock({ block, showRaw, onToggleRaw }: { block: ToolUseBlockType; showRaw: boolean; onToggleRaw: () => void }) {
  const filePath = block.input.file_path as string || ''
  const content = block.input.content as string || ''
  const lines = content.split('\n')
  const previewLines = lines.slice(0, 8)
  const remaining = lines.length - previewLines.length
  const shortPath = filePath.split('/').slice(-3).join('/')

  // Guess language from extension
  const ext = filePath.split('.').pop() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', json: 'json',
    md: 'markdown', css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml',
  }
  const language = langMap[ext] || ''

  return (
    <div className="rounded-md overflow-hidden border border-neutral-700/50">
      {/* Header */}
      <div className="px-3 py-1.5 bg-neutral-800">
        <button onClick={onToggleRaw} className="flex items-center gap-2 text-xs text-neutral-300 hover:text-white transition-colors">
          <span>📝</span>
          <span className="font-medium">Write</span>
          <span className="text-neutral-400">{shortPath}</span>
        </button>
      </div>

      {/* Content preview */}
      {!showRaw && (
        <div className="overflow-x-auto">
          <pre className="text-xs leading-5 p-0 m-0">
            {previewLines.map((line, i) => (
              <div key={i} className="px-3 text-neutral-300">
                <span className="select-none text-neutral-600 mr-3 inline-block w-4 text-right">{i + 1}</span>{line}
              </div>
            ))}
            {remaining > 0 && (
              <div className="px-3 py-1 text-neutral-500 italic">
                ... {remaining} more line{remaining > 1 ? 's' : ''}
              </div>
            )}
          </pre>
        </div>
      )}

      {/* Raw JSON (toggle) */}
      {showRaw && (
        <div className="p-2">
          <CodeBlock language="json" code={JSON.stringify(block.input, null, 2)} />
        </div>
      )}
    </div>
  )
}

// ── Bash Block: terminal-styled command ──

function BashBlock({ block, showRaw, onToggleRaw }: { block: ToolUseBlockType; showRaw: boolean; onToggleRaw: () => void }) {
  const command = block.input.command as string || ''
  const description = block.input.description as string || ''

  return (
    <div className="rounded-md overflow-hidden border border-neutral-700/50">
      {/* Command display */}
      <div className="bg-neutral-900 px-3 py-2">
        <button onClick={onToggleRaw} className="w-full text-left">
          <div className="flex items-start gap-2">
            <span className="text-green-400 text-xs font-mono select-none shrink-0">$</span>
            <pre className="text-xs font-mono text-neutral-200 whitespace-pre-wrap break-all m-0">{command}</pre>
          </div>
        </button>
        {description && (
          <div className="text-xs text-neutral-500 mt-1 ml-4">{description}</div>
        )}
      </div>

      {/* Raw JSON (toggle) */}
      {showRaw && (
        <div className="p-2 border-t border-neutral-700/50">
          <CodeBlock language="json" code={JSON.stringify(block.input, null, 2)} />
        </div>
      )}
    </div>
  )
}

// ── Collapsed Block: compact style for Read/Glob/Grep/etc ──

function CollapsedBlock({ block }: { block: ToolUseBlockType }) {
  const [expanded, setExpanded] = useState(false)
  const icon = TOOL_ICONS[block.name] || '🔧 '
  const summary = getToolSummary(block)

  return (
    <>
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
    </>
  )
}

function getToolSummary(block: ToolUseBlockType): string {
  const input = block.input
  switch (block.name) {
    case 'Read':
      return (input.file_path as string) || ''
    case 'Glob':
      return (input.pattern as string) || ''
    case 'Grep':
      return (input.pattern as string) || ''
    case 'Task':
      return (input.description as string)?.slice(0, 60) || ''
    default:
      return ''
  }
}
