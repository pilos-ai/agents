/**
 * Extract a loop interval from natural-language text.
 *
 * Matches phrases like:
 *   "every 5m", "each 30 minutes", "every hour", "each 2 hours"
 *
 * Returns the interval in Claude's `/loop` format (`Nm`, `Nh`, `Nd`) and the
 * source text with the matched phrase removed. Seconds are clamped to a 1m
 * minimum since `/loop` enforces minute granularity.
 */
export interface ParsedLoopInterval {
  interval: string
  cleanText: string
}

type Unit = 'm' | 'h' | 'd'

function normalizeUnit(raw: string): Unit | 's' | null {
  const s = raw.toLowerCase()
  if (s === 's' || s.startsWith('sec')) return 's'
  if (s === 'm' || s.startsWith('min')) return 'm'
  if (s === 'h' || s.startsWith('hr') || s.startsWith('hour')) return 'h'
  if (s === 'd' || s.startsWith('day')) return 'd'
  return null
}

export function parseLoopInterval(text: string): ParsedLoopInterval | null {
  const numeric =
    /\b(?:each|every)\s+(\d+)\s*(s|m|h|d|secs?|seconds?|mins?|minutes?|hrs?|hours?|days?)\b/i
  const numMatch = text.match(numeric)
  if (numMatch) {
    const [full, numStr, unitStr] = numMatch
    const n = parseInt(numStr, 10)
    const unit = normalizeUnit(unitStr)
    if (unit) {
      const interval = unit === 's' ? '1m' : `${n}${unit}`
      return {
        interval,
        cleanText: text.replace(full, '').replace(/\s+/g, ' ').trim(),
      }
    }
  }

  const unitOnly = /\b(?:each|every)\s+(minute|hour|day)s?\b/i
  const uMatch = text.match(unitOnly)
  if (uMatch) {
    const [full, unitStr] = uMatch
    const unit = normalizeUnit(unitStr)
    if (unit && unit !== 's') {
      return {
        interval: `1${unit}`,
        cleanText: text.replace(full, '').replace(/\s+/g, ' ').trim(),
      }
    }
  }

  return null
}

export const LOOP_INTERVAL_PRESETS: { value: string | null; label: string; desc?: string }[] = [
  { value: null, label: 'Dynamic', desc: 'Model picks pace' },
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hours' },
  { value: '1d', label: '1 day' },
]
