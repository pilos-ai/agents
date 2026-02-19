import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface Props {
  language: string
  code: string
}

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group rounded-md overflow-hidden my-2">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800 text-neutral-400 text-xs">
        <span>{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Code */}
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '0.75rem 1rem',
          fontSize: '0.8125rem',
          lineHeight: '1.5',
          background: '#1a1a2e',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
