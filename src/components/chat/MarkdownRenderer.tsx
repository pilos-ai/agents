/**
 * MarkdownRenderer — renders markdown inside a `.ctext` flow so it inherits
 * the prototype's text colour / typography. Inline `<code>` adopts the
 * prototype's `.cmsg .ctext code` chip styling; code fences delegate to the
 * restyled CodeBlock.
 */
import { useMemo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import { replaceAgentIds } from '../../utils/agent-names'
import { api } from '../../api'

interface Props {
  content: string
}

export function MarkdownRenderer({ content }: Props) {
  const processed = useMemo(() => replaceAgentIds(content), [content])

  const handleLinkClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const href = e.currentTarget.href
    if (href) api.dialog.openExternal(href)
  }, [])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ href, children, ...props }) {
          return (
            <a
              href={href}
              onClick={handleLinkClick}
              style={{ color: 'var(--accent-2)', textDecoration: 'underline', cursor: 'pointer' }}
              title={href}
              {...props}
            >
              {children}
            </a>
          )
        },
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match && !className

          if (isInline) {
            // .cmsg .ctext code styling kicks in automatically.
            return <code {...props}>{children}</code>
          }

          return (
            <CodeBlock
              language={match?.[1] || ''}
              code={String(children).replace(/\n$/, '')}
            />
          )
        },
      }}
    >
      {processed}
    </ReactMarkdown>
  )
}
