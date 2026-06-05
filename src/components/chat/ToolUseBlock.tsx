/**
 * ToolUseBlock — pilos-prototype styled tool invocation indicator.
 *
 * Every tool renders as a compact `.tool-chip` by default (matching the
 * prototype's collapsed look in screen_chat.jsx). Tools with rich content
 * (Edit / Write / Bash / arbitrary tools) expose a chevron to expand into
 * the `.msg-tile` detail view with diff / preview / command.
 *
 * Interactive tools (AskUserQuestion / ExitPlanMode) delegate to their own
 * components which use the `.msg-tile` markup directly (not collapsible).
 */
import { useState, type ReactNode } from 'react'
import type { ToolUseBlock as ToolUseBlockType } from '../../types'
import { CodeBlock } from './CodeBlock'
import { AskUserQuestionBlock } from './AskUserQuestionBlock'
import { ExitPlanModeBlock } from './ExitPlanModeBlock'

interface Props {
  block: ToolUseBlockType
}

export function ToolUseBlock({ block }: Props) {
  // Interactive tools render full UI, never as chips
  if (block.name === 'AskUserQuestion') return <AskUserQuestionBlock block={block} />
  if (block.name === 'ExitPlanMode') return <ExitPlanModeBlock block={block} />

  return <ToolChip block={block} />
}

// ── Universal chip with optional expand ──

function ToolChip({ block }: { block: ToolUseBlockType }) {
  const [expanded, setExpanded] = useState(false)
  const { label, summary, detail } = describeTool(block)
  const expandable = !!detail

  return (
    <div className="msg-tools" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <button
        type="button"
        onClick={() => expandable && setExpanded((v) => !v)}
        className={'tool-chip' + (expandable ? ' expand' : '') + (expanded ? ' open' : '')}
        title={summary || label}
        style={expandable ? undefined : { cursor: 'default' }}
      >
        <span className="ok">
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l4 4 10-10" />
          </svg>
        </span>
        <span>{label}</span>
        {summary && (
          <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 460, whiteSpace: 'nowrap' }}>
            · {summary}
          </span>
        )}
        {expandable && (
          <svg className="chev" width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ marginLeft: 4, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>
      {expandable && expanded && <div style={{ width: '100%', marginTop: 6 }}>{detail}</div>}
    </div>
  )
}

// ── Per-tool descriptor ──
// Returns chip label, the summary text shown beside it, and the expanded detail node.

function describeTool(block: ToolUseBlockType): { label: string; summary: string; detail: ReactNode | null } {
  const input = block.input
  switch (block.name) {
    case 'Bash': {
      const command = (input.command as string) || ''
      const description = (input.description as string) || ''
      return {
        label: '$ Bash',
        summary: description || shortenForChip(command, 80),
        detail: <CommandDetail command={command} />,
      }
    }
    case 'Edit': {
      const filePath = (input.file_path as string) || ''
      const oldString = (input.old_string as string) || ''
      const newString = (input.new_string as string) || ''
      return {
        label: 'edit',
        summary: tailPath(filePath),
        detail: <EditDetail oldString={oldString} newString={newString} />,
      }
    }
    case 'Write': {
      const filePath = (input.file_path as string) || ''
      const content = (input.content as string) || ''
      return {
        label: 'write',
        summary: tailPath(filePath),
        detail: <WriteDetail filePath={filePath} content={content} />,
      }
    }
    case 'Read':
      return { label: 'read', summary: tailPath((input.file_path as string) || ''), detail: null }
    case 'Glob':
      return { label: 'glob', summary: (input.pattern as string) || '', detail: null }
    case 'Grep':
      return { label: 'grep', summary: (input.pattern as string) || '', detail: null }
    case 'Task':
      return { label: 'task', summary: shortenForChip((input.description as string) || '', 60), detail: null }
    case 'WebFetch':
      return { label: 'web', summary: (input.url as string) || '', detail: null }
    case 'WebSearch':
      return { label: 'search', summary: (input.query as string) || '', detail: null }
    default:
      // Unknown / MCP tools — show name and let user expand if input is non-trivial
      return {
        label: block.name,
        summary: '',
        detail: hasMeaningfulInput(input) ? <JsonDetail input={input} /> : null,
      }
  }
}

// ── Expanded detail views ──

function CommandDetail({ command }: { command: string }) {
  return (
    <div className="code-block" style={{ margin: 0 }}>
      <div className="tline" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        <span className="cs">$</span> {command}
      </div>
    </div>
  )
}

function EditDetail({ oldString, newString }: { oldString: string; newString: string }) {
  const oldLines = oldString ? oldString.split('\n') : []
  const newLines = newString ? newString.split('\n') : []
  return (
    <div className="code-block no-pad" style={{ margin: 0 }}>
      {oldLines.map((line, i) => (
        <div key={`old-${i}`} className="tline diff-line del">
          <span className="sigil">-</span>{line || ' '}
        </div>
      ))}
      {newLines.map((line, i) => (
        <div key={`new-${i}`} className="tline diff-line add">
          <span className="sigil">+</span>{line || ' '}
        </div>
      ))}
    </div>
  )
}

function WriteDetail({ filePath, content }: { filePath: string; content: string }) {
  const ext = filePath.split('.').pop() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', json: 'json',
    md: 'markdown', css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml',
  }
  const language = langMap[ext] || ''
  const lines = content.split('\n')
  const previewLines = lines.slice(0, 12)
  const remaining = lines.length - previewLines.length
  const body = previewLines.join('\n') + (remaining > 0 ? `\n// … ${remaining} more line${remaining > 1 ? 's' : ''}` : '')
  return <CodeBlock language={language} code={body} />
}

function JsonDetail({ input }: { input: Record<string, unknown> }) {
  return <CodeBlock language="json" code={JSON.stringify(input, null, 2)} />
}

// ── Helpers ──

function tailPath(p: string, depth = 3): string {
  if (!p) return ''
  const parts = p.split('/')
  return parts.length > depth ? parts.slice(-depth).join('/') : p
}

function shortenForChip(s: string, max: number): string {
  if (!s) return ''
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine
}

function hasMeaningfulInput(input: Record<string, unknown>): boolean {
  const keys = Object.keys(input || {})
  return keys.length > 0 && !(keys.length === 1 && keys[0] === 'description')
}
