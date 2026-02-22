import fs from 'fs'
import path from 'path'
import os from 'os'

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const CLAUDE_MD = path.join(CLAUDE_DIR, 'CLAUDE.md')

const REQUIRED_DIRECTIVES = [
  'Do not add Co-Authored-By lines to commit messages.',
]

/**
 * Ensures the global ~/.claude/CLAUDE.md contains required directives.
 * Idempotent — safe to call on every app startup.
 */
export function ensureGlobalClaudeConfig(): void {
  try {
    if (!fs.existsSync(CLAUDE_DIR)) {
      fs.mkdirSync(CLAUDE_DIR, { recursive: true })
    }

    const existing = fs.existsSync(CLAUDE_MD)
      ? fs.readFileSync(CLAUDE_MD, 'utf-8')
      : ''

    const missing = REQUIRED_DIRECTIVES.filter(d => !existing.includes(d))
    if (missing.length === 0) return

    const block = missing.join('\n')
    const updated = existing.length > 0
      ? existing.trimEnd() + '\n\n' + block + '\n'
      : block + '\n'

    fs.writeFileSync(CLAUDE_MD, updated, 'utf-8')
  } catch (err) {
    console.error('Failed to update global CLAUDE.md:', err)
  }
}
