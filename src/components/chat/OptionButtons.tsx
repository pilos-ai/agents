import { useConversationStore } from '../../store/useConversationStore'

interface DetectedOption {
  label: string
  description: string
  recommended: boolean
}

/**
 * Detect option-like patterns in assistant messages.
 * Only triggers when:
 * 1. The list is at the END of the message (trailing list)
 * 2. The text before the list contains a question or choice-presenting phrase
 * 3. Items don't look like code/technical summaries (no heavy backtick usage)
 */
export function detectOptions(text: string): DetectedOption[] {
  const lines = text.split('\n')

  // Matches: **Option** — desc, 1. **Option** (note) — desc, - **Option** - desc
  const boldOptionRegex = /^\s*(?:[-*•]|\d+[.)]\s*)?\s*\*\*(.+?)\*\*\s*(?:\(([^)]*)\)\s*)?(?:[—–\-:]\s*(.*))?$/
  // Matches plain list items: "1. Some option", "- Some option", "• Some option"
  const plainListRegex = /^\s*(?:(\d+)[.)]\s+|[-*•]\s+)(.+)$/

  // Walk backwards from the end to find the trailing list block
  let endIdx = lines.length - 1
  while (endIdx >= 0 && lines[endIdx].trim() === '') endIdx--
  if (endIdx < 0) return []

  let startIdx = endIdx
  while (startIdx >= 0) {
    const trimmed = lines[startIdx].trim()
    if (trimmed === '') { startIdx--; continue }
    if (boldOptionRegex.test(trimmed) || plainListRegex.test(trimmed)) {
      startIdx--
    } else {
      break
    }
  }
  // startIdx is now the last non-list line before the trailing list
  const listStart = startIdx + 1
  if (listStart > endIdx) return [] // No trailing list

  // Need at least 2 list items
  const listLines = lines.slice(listStart, endIdx + 1).filter(l => l.trim() !== '')
  if (listLines.length < 2) return []

  // Check the context before the list — must suggest a choice/question
  const preListText = lines.slice(0, listStart + 1).join('\n').trim()
  // Look at the last non-empty paragraph before the list
  const paragraphs = preListText.split(/\n\s*\n/)
  const lastParagraph = paragraphs[paragraphs.length - 1]?.trim() || ''

  const hasChoiceContext =
    /\?\s*$/.test(lastParagraph) ||
    /\b(which|choose|select|options?|prefer|approach|would you like|pick|here are|do you want)\b/i.test(lastParagraph)

  if (!hasChoiceContext) return []

  // Parse the trailing list items into options
  const options: DetectedOption[] = []
  for (const line of listLines) {
    const trimmed = line.trim()

    // Skip items with heavy backtick usage (code references = not choices)
    const backtickCount = (trimmed.match(/`/g) || []).length
    if (backtickCount >= 4) continue

    const boldMatch = boldOptionRegex.exec(trimmed)
    if (boldMatch) {
      const label = boldMatch[1].trim()
      // Skip labels that are mostly code
      if ((label.match(/`/g) || []).length >= 2 && label.length < 20) continue
      const annotation = (boldMatch[2] || '').toLowerCase()
      options.push({
        label,
        description: (boldMatch[3] || '').trim(),
        recommended: /recommend|prefer|suggest|default|best/i.test(annotation),
      })
    } else {
      const plainMatch = plainListRegex.exec(trimmed)
      if (plainMatch && plainMatch[2].length <= 60 && !plainMatch[2].includes('```')) {
        const rawLabel = plainMatch[2].trim()
        // Skip items that look like code/technical descriptions
        if ((rawLabel.match(/`/g) || []).length >= 2) continue
        if (rawLabel.endsWith(':')) continue // "App.jsx:" is a heading, not an option

        const label = rawLabel
          .replace(/[—–\-]\s.*$/, '')
          .replace(/\s*\(.*\)\s*$/, '')
          .trim()
        if (!label) continue
        const annotation = (plainMatch[2].match(/\(([^)]*)\)/)?.[1] || '').toLowerCase()
        options.push({
          label,
          description: '',
          recommended: /recommend|prefer|suggest|default|best/i.test(annotation),
        })
      }
    }
  }

  return options.length >= 2 ? options : []
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
