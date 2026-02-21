// Maps short hex agent/task IDs (like "a11c196") to friendly names
// and back again so users can reference agents by name

const FRIENDLY_NAMES = [
  'Atlas', 'Bolt', 'Cipher', 'Dash', 'Echo',
  'Flux', 'Ghost', 'Haze', 'Ion', 'Jade',
  'Knox', 'Lynx', 'Muse', 'Neon', 'Onyx',
  'Pixel', 'Quill', 'Rune', 'Sage', 'Tide',
  'Unity', 'Volt', 'Wren', 'Xenon', 'Yew', 'Zen',
]

// Bidirectional mapping — persists across renders within the same session
const idToName = new Map<string, string>()
const nameToId = new Map<string, string>()
let nextIndex = 0

function getNameForId(id: string): string {
  let name = idToName.get(id)
  if (!name) {
    name = FRIENDLY_NAMES[nextIndex % FRIENDLY_NAMES.length]
    if (nextIndex >= FRIENDLY_NAMES.length) {
      name += ` ${Math.floor(nextIndex / FRIENDLY_NAMES.length) + 1}`
    }
    idToName.set(id, name)
    nameToId.set(name.toLowerCase(), id)
    nextIndex++
  }
  return name
}

// Matches hex IDs that look like agent/task references (6-10 hex chars)
const AGENT_ID_PATTERN = /\b([a-f0-9]{6,10})\b/g

// Context patterns that indicate the hex string is an agent ID
const CONTEXT_MARKERS = /\b(?:agents?|tasks?|waiting\s+(?:on|for)|completed|done|running|finished|started|spawned|launched)\b/i

/** Replace hex agent IDs with friendly names for display */
export function replaceAgentIds(text: string): string {
  return text.split('\n').map((line) => {
    if (!CONTEXT_MARKERS.test(line)) return line
    return line.replace(AGENT_ID_PATTERN, (match) => {
      // Skip all-letter hex strings that could be English words (e.g. "facade")
      if (/^[a-f]+$/.test(match)) return match
      return getNameForId(match)
    })
  }).join('\n')
}

/** Replace friendly names back to hex IDs before sending to Claude CLI */
export function restoreAgentIds(text: string): string {
  if (nameToId.size === 0) return text

  // Build a regex that matches any known friendly name (case-insensitive, word boundary)
  const names = Array.from(nameToId.keys()).map((n) =>
    n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  if (names.length === 0) return text

  const pattern = new RegExp(`\\b(${names.join('|')})\\b`, 'gi')
  return text.replace(pattern, (match) => {
    return nameToId.get(match.toLowerCase()) || match
  })
}
