/**
 * CodeBlock — pilos-prototype syntax-tokenised code box.
 *
 * Renders `<div className="code-block"><div className="tline"><span class="ck|cs|cc|cf"/></div>...</div>`
 * matching pilos-handoff/app/screen_chat.jsx CodeBlock (lines 31–36) and the
 * prototype's `.code-block` styling. We keep using react-syntax-highlighter
 * (already a dependency) for tokenisation, but supply a custom renderer that
 * maps Prism token types to the prototype's class names instead of inline
 * theme colours:
 *   keyword → ck   string → cs   comment → cc   function → cf
 *
 * Pro tier still gets the copy button (now positioned as an inline `.btn.sm.ghost`).
 */
import { useState } from 'react'
import { Prism as SyntaxHighlighter, createElement } from 'react-syntax-highlighter'
import { useLicenseStore } from '../../store/useLicenseStore'
import { ProBadge } from '../common/ProBadge'

interface Props {
  language: string
  code: string
}

// Map Prism token types → prototype class names.
const TOKEN_CLASS: Record<string, string> = {
  keyword: 'ck',
  boolean: 'ck',
  important: 'ck',
  atrule: 'ck',
  rule: 'ck',
  string: 'cs',
  char: 'cs',
  url: 'cs',
  regex: 'cs',
  comment: 'cc',
  prolog: 'cc',
  doctype: 'cc',
  cdata: 'cc',
  function: 'cf',
  'class-name': 'cf',
  tag: 'cf',
  'attr-name': 'cf',
  builtin: 'cf',
  selector: 'cf',
}

type Node = {
  type: 'element' | 'text'
  tagName?: string
  properties?: { className?: string[] }
  children?: Node[]
  value?: string
}

function mapNode(node: Node): Node {
  if (node.type === 'text') return node
  if (node.type === 'element' && node.properties?.className) {
    const tokenClasses = node.properties.className
    // Prism wraps tokens as <span class="token keyword">…</span>. Pick the first
    // recognised type and replace with the prototype's single class.
    let mapped: string | null = null
    for (const cls of tokenClasses) {
      if (cls === 'token') continue
      if (TOKEN_CLASS[cls]) { mapped = TOKEN_CLASS[cls]; break }
    }
    return {
      ...node,
      properties: { className: mapped ? [mapped] : [] },
      children: node.children ? node.children.map(mapNode) : undefined,
    }
  }
  if (node.children) {
    return { ...node, children: node.children.map(mapNode) }
  }
  return node
}

// Custom renderer for react-syntax-highlighter. It receives the parsed rows
// (one per source line) and we output the prototype's `.code-block > .tline`
// structure.
function tlineRenderer({ rows }: { rows: Node[] }) {
  return (
    <>
      {rows.map((row, i) => (
        <div className="tline" key={i}>
          {row.children?.length
            ? row.children.map((child, j) =>
                createElement({
                  node: mapNode(child) as any,
                  stylesheet: {},
                  useInlineStyles: false,
                  key: `c${i}-${j}`,
                })
              )
            : ' '}
        </div>
      ))}
    </>
  )
}

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false)
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'

  const handleCopy = async () => {
    if (!isPro) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Header strip: language + copy. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--muted)', padding: '6px 4px 0',
      }}>
        <span>{language || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!isPro}
          className="btn sm ghost"
          style={{ height: 20, padding: '0 6px', fontSize: 10.5, opacity: isPro ? 1 : 0.55, cursor: isPro ? 'pointer' : 'not-allowed' }}
          title={isPro ? 'Copy' : 'Pro feature'}
        >
          {isPro ? (copied ? 'Copied' : 'Copy') : (<>Copy<ProBadge /></>)}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        // Custom renderer outputs prototype structure; we pass an empty style
        // so the highlighter doesn't try to inline-style our spans.
        useInlineStyles={false}
        style={{}}
        PreTag={(props) => <div {...(props as any)} className="code-block" />}
        CodeTag={(props) => <>{(props as any).children}</>}
        renderer={tlineRenderer as any}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
