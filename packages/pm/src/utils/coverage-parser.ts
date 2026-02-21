import type { CoverageResult } from '../types'

/**
 * Parses Claude's ```coverage response blocks into structured data.
 *
 * Expected format:
 * ```coverage
 * criterion: 1
 * covered: true
 * files: src/components/Login.tsx, src/api/auth.ts
 * explanation: Login form component handles email/password input
 * ```
 */
export function parseCoverageBlocks(text: string): CoverageResult[] {
  const results: CoverageResult[] = []
  const regex = /```coverage\s*\n([\s\S]*?)```/g
  let match

  while ((match = regex.exec(text)) !== null) {
    const block = match[1]
    const result = parseSingleBlock(block)
    if (result) results.push(result)
  }

  return results
}

function parseSingleBlock(block: string): CoverageResult | null {
  const lines = block.trim().split('\n')
  let criterionIndex = -1
  let isCovered = false
  let files: string[] = []
  let explanation = ''

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('criterion:')) {
      criterionIndex = parseInt(trimmed.slice(10).trim(), 10) - 1 // Convert to 0-based
    } else if (trimmed.startsWith('covered:')) {
      isCovered = trimmed.slice(8).trim().toLowerCase() === 'true'
    } else if (trimmed.startsWith('files:')) {
      files = trimmed.slice(6).trim().split(',').map((f) => f.trim()).filter(Boolean)
    } else if (trimmed.startsWith('explanation:')) {
      explanation = trimmed.slice(12).trim()
    }
  }

  if (criterionIndex < 0) return null

  return { criterionIndex, isCovered, files, explanation }
}
