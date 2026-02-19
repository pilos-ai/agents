import { useConversationStore } from '../../store/useConversationStore'

interface DetectedOption {
  label: string
  description: string
  recommended: boolean
}

/**
 * Detect option-like patterns in assistant messages:
 * - **Option Name** — description
 * - **Option Name** (recommended) — description
 * - 1. **Option Name** — description
 * - - **Option Name** — description
 * - 1. A simple todo app
 * - - A dashboard
 */
export function detectOptions(text: string): DetectedOption[] {
  const options: DetectedOption[] = []
  const lines = text.split('\n')

  // Matches: **Option** — desc, 1. **Option** (note) — desc, - **Option** - desc
  const boldOptionRegex = /^\s*(?:[-*•]|\d+[.)]\s*)?\s*\*\*(.+?)\*\*\s*(?:\(([^)]*)\)\s*)?(?:[—–\-:]\s*(.*))?$/
  // Matches plain list items: "1. Some option", "- Some option", "• Some option"
  const plainListRegex = /^\s*(?:(\d+)[.)]\s+|[-*•]\s+)(.+)$/

  let consecutiveOptions = 0
  const candidates: DetectedOption[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const boldMatch = boldOptionRegex.exec(trimmed)

    if (boldMatch) {
      consecutiveOptions++
      const annotation = (boldMatch[2] || '').toLowerCase()
      candidates.push({
        label: boldMatch[1].trim(),
        description: (boldMatch[3] || '').trim(),
        recommended: /recommend|prefer|suggest|default|best/i.test(annotation),
      })
    } else {
      const plainMatch = plainListRegex.exec(trimmed)
      // Only consider plain list items that are short (likely options, not paragraphs)
      if (plainMatch && plainMatch[2].length <= 80 && !plainMatch[2].includes('```')) {
        consecutiveOptions++
        const label = plainMatch[2].trim()
          .replace(/[—–\-]\s.*$/, '') // Strip trailing description after dash
          .replace(/\s*\(.*\)\s*$/, '') // Strip trailing parenthetical
          .trim()
        const annotation = (plainMatch[2].match(/\(([^)]*)\)/)?.[1] || '').toLowerCase()
        candidates.push({
          label,
          description: '',
          recommended: /recommend|prefer|suggest|default|best/i.test(annotation),
        })
      } else if (trimmed === '') {
        // Allow blank lines between options
      } else {
        // Non-option line breaks the streak
        if (consecutiveOptions >= 2) {
          options.push(...candidates)
        }
        consecutiveOptions = 0
        candidates.length = 0
      }
    }
  }

  // Check remaining candidates
  if (consecutiveOptions >= 2) {
    options.push(...candidates)
  }

  return options
}

interface Props {
  options: DetectedOption[]
}

export function OptionButtons({ options }: Props) {
  const sendMessage = useConversationStore((s) => s.sendMessage)
  const isWaiting = useConversationStore((s) => s.isWaitingForResponse)

  if (options.length === 0 || isWaiting) return null

  return (
    <div className="flex flex-wrap gap-2 mt-2 ml-1">
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => sendMessage(opt.label)}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
            opt.recommended
              ? 'bg-blue-600/30 text-blue-300 border border-blue-400/50 hover:bg-blue-600/50 hover:border-blue-400/70'
              : 'bg-neutral-700/40 text-neutral-300 border border-neutral-600/40 hover:bg-neutral-700/60 hover:border-neutral-500/50'
          }`}
        >
          {opt.recommended && (
            <span className="text-yellow-400 mr-1.5">&#9733;</span>
          )}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
