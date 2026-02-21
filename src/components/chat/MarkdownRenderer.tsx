import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import { replaceAgentIds } from '../../utils/agent-names'

interface Props {
  content: string
}

export function MarkdownRenderer({ content }: Props) {
  const processed = useMemo(() => replaceAgentIds(content), [content])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match && !className

          if (isInline) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
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
