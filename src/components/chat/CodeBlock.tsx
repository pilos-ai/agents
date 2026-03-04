import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useLicenseStore } from '../../store/useLicenseStore'
import { ProBadge } from '../common/ProBadge'

interface Props {
  language: string
  code: string
}

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false)
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'

  const handleCopy = async () => {
    if (!isPro) return
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
          disabled={!isPro}
          className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ${isPro ? 'hover:text-white' : 'cursor-not-allowed opacity-50'}`}
        >
          {isPro ? (copied ? 'Copied!' : 'Copy') : <><span>Copy</span><ProBadge /></>}
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
