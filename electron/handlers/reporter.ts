/**
 * Reporter IPC handlers — the Electron-main "backend" for the Work Day Reporter.
 * Replaces the standalone reporter's Express backend: local git reads +
 * Claude report generation, all in-process. The Anthropic API key never leaves
 * the main process.
 */
import { ipcMain } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import {
  getCommitsForDate,
  getCommitsForDateRange,
  getUncommittedChanges,
  isGitRepo,
  type CommitInfo,
} from '../services/reporter-git'
import { getApiKey, setApiKey, clearApiKey, hasApiKey } from '../services/anthropic-key'
import { redactSecrets } from '../services/secret-redaction'
import { generateViaCli, generateViaProxy, previewViaProxy, hostedAvailable, QuotaExceededError } from '../services/reporter-transports'

export type ReportFormat = 'standup' | 'detailed' | 'manager' | 'timesheet'
/** How a report is generated. hosted = Pilos proxy; byok = user key; cli = Claude CLI. */
export type ReporterMode = 'hosted' | 'byok' | 'cli'

export interface ReportStats {
  totalCommits: number
  filesChanged: number
  additions: number
  deletions: number
}

export interface GenerateReportResult {
  summary: string
  stats: ReportStats
  error?: string
}

const DEFAULT_MODEL = 'claude-opus-4-8'
// Allow-list at the trust boundary — the renderer-supplied model reaches `claude
// --model <model>` (argv) and the SDK/proxy; reject anything not known.
const ALLOWED_MODELS = new Set(['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'])
const safeModel = (m?: string) => (m && ALLOWED_MODELS.has(m) ? m : DEFAULT_MODEL)

function computeStats(commits: CommitInfo[]): ReportStats {
  return {
    totalCommits: commits.filter((c) => c.sha !== 'uncommitted').length || commits.length,
    filesChanged: new Set(commits.flatMap((c) => c.files.map((f) => f.filename))).size,
    additions: commits.reduce((s, c) => s + c.stats.additions, 0),
    deletions: commits.reduce((s, c) => s + c.stats.deletions, 0),
  }
}

// Top-20 changed files with a trimmed patch snippet — keeps prompts within budget.
// metadataOnly omits the code snippets entirely (only stats/paths/status leave the device).
// counter, when passed, accumulates how many secrets were redacted from the snippets.
function prepareFileChanges(commits: CommitInfo[], metadataOnly = false, counter?: { n: number }): string {
  const fileMap = new Map<string, { status: Set<string>; additions: number; deletions: number; repos: Set<string>; patches: string[] }>()
  for (const commit of commits) {
    for (const file of commit.files) {
      const entry = fileMap.get(file.filename) ?? { status: new Set(), additions: 0, deletions: 0, repos: new Set(), patches: [] }
      entry.status.add(file.status)
      entry.additions += file.additions
      entry.deletions += file.deletions
      entry.repos.add(commit.repo)
      if (file.patch && file.patch.length < 2000) entry.patches.push(file.patch)
      fileMap.set(file.filename, entry)
    }
  }
  const sorted = [...fileMap.entries()].sort((a, b) => (b[1].additions + b[1].deletions) - (a[1].additions + a[1].deletions))
  const top = sorted.slice(0, 20)
  let result = ''
  top.forEach(([filename, data], i) => {
    result += `\n${i + 1}. ${filename}\n`
    result += `   Status: ${[...data.status].join(', ')}\n`
    result += `   Changes: +${data.additions} -${data.deletions}\n`
    result += `   Repository: ${[...data.repos].join(', ')}\n`
    if (!metadataOnly && data.patches[0] && data.patches[0].length < 1000) {
      // Truncate FIRST, then redact — so the secret count reflects only what is
      // actually sent (lines beyond 20 never leave the device).
      const allLines = data.patches[0].split('\n')
      const red = redactSecrets(allLines.slice(0, 20).join('\n'))
      if (counter) counter.n += red.count
      result += `   Code Changes:\n` + red.text.split('\n').map((l) => `   ${l}`).join('\n') + '\n'
      if (allLines.length > 20) result += `   ... (truncated)\n`
    }
  })
  if (sorted.length > 20) result += `\n... and ${sorted.length - 20} more files\n`
  return result
}

function buildPrompt(format: ReportFormat, dateStr: string, stats: ReportStats, fileChanges: string, commits: CommitInfo[], omitTimes: boolean, counter?: { n: number }): string {
  const commitLines = commits.map((c) => {
    const red = redactSecrets(c.message.split('\n')[0])
    if (counter) counter.n += red.count
    return `- ${c.repo}: ${red.text}`
  }).join('\n')
  const baseInfo = `
WORK STATISTICS:
- Total Commits: ${stats.totalCommits}
- Files Changed: ${stats.filesChanged}
- Lines Added: ${stats.additions}
- Lines Deleted: ${stats.deletions}

FILE CHANGES:
${fileChanges}

COMMIT MESSAGES:
${commitLines}
`
  const noTime = omitTimes
    ? '\n\nIMPORTANT: Do NOT include any time estimates, hours, durations, clock times, or a date/time header anywhere in the report. Describe the work without referencing how long it took.'
    : ''

  switch (format) {
    case 'standup':
      return `You are writing a daily standup report for ${dateStr}. Analyze the following code changes and create a SHORT, CONCISE standup message.
${baseInfo}

Generate a brief standup report with EXACTLY this structure:

**What I Did Today:**
- [Task 1]${omitTimes ? '' : ' (time estimate)'}
- [Task 2]${omitTimes ? '' : ' (time estimate)'}
- [Task 3]${omitTimes ? '' : ' (time estimate)'}

**Blockers:**
- [List any issues or none]

**Tomorrow:**
- [What continues tomorrow]

REQUIREMENTS:
- Keep it SHORT - max 3-5 bullet points per section
- Use first person ("I fixed...", "I implemented...")
- Be specific but concise
- Focus on main accomplishments only${noTime}`

    case 'manager':
      return `You are writing an executive summary for a manager about work completed on ${dateStr}. Focus on business impact and high-level accomplishments.
${baseInfo}

Generate a manager-friendly report with:

**Summary:**
[2-3 sentences about what was accomplished and the business value]

**Key Accomplishments:**
- [Achievement 1 - focus on WHAT and WHY, not technical how]
- [Achievement 2]
- [Achievement 3]

**Impact:**
[Brief statement about what parts of the product/business were improved]

**Status:**
[Overall progress and any concerns]

REQUIREMENTS:
- NO technical jargon or code details
- Focus on business value and user impact
- Keep it concise and scannable
- Use clear, simple language
- Emphasize outcomes, not activities${noTime}`

    case 'timesheet':
      return `You are creating a detailed timesheet for ${dateStr}. Break down work into specific time blocks that add up to ~8 hours.
${baseInfo}

Generate a detailed timesheet format:

**Date:** ${dateStr}

**Time Log:**

9:00 AM - 10:30 AM (1.5h)
- [Specific task/activity]
- Files: [key files worked on]

[Continue with more time blocks...]

**Summary:**
- Main Tasks: [list 3-4 main tasks]
- Categories: [Development/Testing/Review/etc]

REQUIREMENTS:
- Be VERY specific about time blocks
- Times should add up to approximately 8 hours
- Mention specific files and components worked on
- Use realistic time estimates based on complexity of changes${noTime}`

    case 'detailed':
    default:
      return `You are a professional work report writer. Analyze the following code changes from ${dateStr} and generate a comprehensive daily work summary message.
${baseInfo}

Generate a professional daily work report that could be sent to a manager or team. The report should:

1. **Start with a brief summary** (2-3 sentences) describing the day's work focus and main accomplishments

2. **Today's Work (Organized by Task)**
   For each major task/feature/fix worked on:
   - Give it a clear title/name
   - Briefly describe what was done (2-4 sentences)
   - Mention which files were modified and why${omitTimes ? '' : '\n   - Estimate time spent (distribute across an ~8 hour workday based on complexity)'}
   - Note status (Completed/In Progress/Testing)

3. **Technical Changes Summary**
   - List key technical improvements or changes
   - Mention any important patterns, refactoring, or architectural decisions

4. **Challenges & Solutions** (if applicable)

5. **Next Steps** (if relevant)

FORMAT REQUIREMENTS:
- Write in first person ("I worked on...", "I implemented...", "I fixed...")
- Make it sound natural and professional
- Be specific about what was done, not just "updated files"
- Focus on business value and functional changes
- Use clear, concise language suitable for both technical and non-technical readers${noTime}`
  }
}

// Non-AI fallback so the reporter still produces something without a working key.
function basicReport(commits: CommitInfo[], stats: ReportStats): string {
  const repos = [...new Set(commits.map((c) => c.repo))]
  let report = `Work Summary\n\nTotal Commits: ${stats.totalCommits}\nFiles Changed: ${stats.filesChanged}\nLines Added: ${stats.additions}\nLines Deleted: ${stats.deletions}\n\nRepositories:\n`
  for (const repo of repos) {
    const repoCommits = commits.filter((c) => c.repo === repo)
    report += `\n${repo} (${repoCommits.length} commits):\n`
    for (const c of repoCommits) report += `  - ${c.message.split('\n')[0]}\n`
  }
  return report
}

interface GenerateOpts {
  commits: CommitInfo[]
  dateStr: string
  format: ReportFormat
  model: string
  omitTimes: boolean
  mode: ReporterMode
  metadataOnly?: boolean
  licenseKey?: string
  email?: string
  machineId?: string
}

// Redact secrets from commit messages + patches before they leave the device
// (the privacy boundary for the hosted Pilos Cloud path). Returns the count too.
function redactCommits(commits: CommitInfo[]): { commits: CommitInfo[]; redacted: number } {
  let redacted = 0
  const out = commits.map((c) => {
    const m = redactSecrets(c.message); redacted += m.count
    const files = c.files.map((f) => {
      if (!f.patch) return f
      const r = redactSecrets(f.patch); redacted += r.count
      return { ...f, patch: r.text }
    })
    return { ...c, message: m.text, files }
  })
  return { commits: out, redacted }
}

// Assemble the prompt that will be sent — exposed so the renderer can preview it.
function assemblePrompt(o: Pick<GenerateOpts, 'commits' | 'dateStr' | 'format' | 'omitTimes' | 'metadataOnly'>): { prompt: string; stats: ReportStats; redacted: number } {
  const stats = computeStats(o.commits)
  const counter = { n: 0 }
  const fileChanges = prepareFileChanges(o.commits, !!o.metadataOnly, counter)
  const prompt = buildPrompt(o.format, o.dateStr, stats, fileChanges, o.commits, o.omitTimes, counter)
  return { prompt, stats, redacted: counter.n }
}

function mapGenerateError(err: unknown, mode: ReporterMode): string {
  if (err instanceof QuotaExceededError) return 'Daily report limit reached — upgrade to Pro for unlimited, or use your own API key / Claude CLI.'
  if (err instanceof Anthropic.AuthenticationError) return 'Invalid Claude API key — showing a basic summary.'
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status}) — showing a basic summary.`
  if (err instanceof Error && err.message === 'HOSTED_NOT_AVAILABLE') return "Hosted reports aren't available yet — switch to your own API key or the Claude CLI."
  if (mode === 'cli') return 'Claude CLI report failed — is the CLI installed and logged in? Showing a basic summary.'
  console.error('[reporter] generate failed:', err)
  return 'Failed to generate report — showing a basic summary.'
}

async function generateReport(o: GenerateOpts): Promise<GenerateReportResult> {
  const stats = computeStats(o.commits)
  if (!o.commits || o.commits.length === 0) {
    return { summary: 'No commits found for this date.', stats }
  }

  const { prompt } = assemblePrompt(o)
  const model = o.model || DEFAULT_MODEL
  const maxTokens = o.format === 'standup' ? 2000 : 6000

  try {
    let summary: string
    if (o.mode === 'cli') {
      summary = await generateViaCli(prompt, model)
    } else if (o.mode === 'hosted') {
      // Pilos Cloud builds the prompt + calls Claude; we send only redacted git data.
      summary = await generateViaProxy({
        commits: redactCommits(o.commits).commits,
        format: o.format, dateStr: o.dateStr,
        omitTimes: o.omitTimes, metadataOnly: o.metadataOnly, model,
        licenseKey: o.licenseKey, email: o.email, machineId: o.machineId,
      })
    } else {
      // byok — user's own Anthropic key, direct.
      const apiKey = getApiKey()
      if (!apiKey) {
        return { summary: basicReport(o.commits, stats), stats, error: 'No Claude API key set — add a key, or switch to the Claude CLI / hosted mode.' }
      }
      const client = new Anthropic({ apiKey })
      const message = await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
      const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
      summary = textBlock?.text ?? basicReport(o.commits, stats)
    }
    return { summary, stats }
  } catch (err) {
    return { summary: basicReport(o.commits, stats), stats, error: mapGenerateError(err, o.mode) }
  }
}

// Accept only safe, well-formed date strings (YYYY-MM-DD or ISO). Guards
// against malformed renderer input reaching git / `new Date()`. git calls are
// already shell-safe (execFile argv), so this is defense-in-depth + avoids throws.
function isValidDateInput(s: string | undefined): s is string {
  if (typeof s !== 'string' || s.length > 40 || !/^[0-9T:.\-+Z ]+$/.test(s)) return false
  return !Number.isNaN(new Date(s).getTime())
}

export function registerReporterHandlers() {
  // ── Git ──────────────────────────────────────────────────────────────────
  ipcMain.handle('reporter:isGitRepo', (_e, repoPath: string) => isGitRepo(repoPath))

  ipcMain.handle(
    'reporter:getCommits',
    (_e, opts: { repoPaths: string[]; mode: 'date' | 'range' | 'uncommitted'; date?: string; startDate?: string; endDate?: string }) => {
      const { repoPaths, mode } = opts
      const paths = Array.isArray(repoPaths) ? repoPaths.filter((p) => typeof p === 'string' && p.length > 0) : []
      if (paths.length === 0) return []
      if (mode === 'uncommitted') return getUncommittedChanges(paths)
      if (mode === 'range') {
        if (!isValidDateInput(opts.startDate) || !isValidDateInput(opts.endDate)) return []
        return getCommitsForDateRange(paths, opts.startDate!, opts.endDate!)
      }
      if (!isValidDateInput(opts.date)) return []
      return getCommitsForDate(paths, opts.date!)
    },
  )

  // ── Preview (exactly what will be sent, post-redaction) ────────────────────
  // Mirrors generation: the prompt comes from Pilos Cloud (server-side templates).
  // Falls back to the local builder if the backend is unreachable (offline).
  ipcMain.handle(
    'reporter:preview',
    async (_e, opts: { commits: CommitInfo[]; dateStr: string; format: ReportFormat; omitTimes?: boolean; metadataOnly?: boolean }) => {
      const { commits, redacted } = redactCommits(opts.commits)
      if (hostedAvailable()) {
        try {
          const r = await previewViaProxy({
            commits, format: opts.format, dateStr: opts.dateStr,
            omitTimes: opts.omitTimes, metadataOnly: opts.metadataOnly,
          })
          return { prompt: r.prompt, redacted, chars: r.chars }
        } catch { /* fall back to local builder */ }
      }
      const { prompt } = assemblePrompt({
        commits: opts.commits, dateStr: opts.dateStr, format: opts.format,
        omitTimes: !!opts.omitTimes, metadataOnly: !!opts.metadataOnly,
      })
      return { prompt, redacted, chars: prompt.length }
    },
  )

  // ── Generation ───────────────────────────────────────────────────────────
  ipcMain.handle('reporter:hostedAvailable', () => hostedAvailable())

  ipcMain.handle(
    'reporter:generate',
    (_e, opts: {
      commits: CommitInfo[]; dateStr: string; format: ReportFormat; model?: string; omitTimes?: boolean
      mode?: ReporterMode; metadataOnly?: boolean; licenseKey?: string; email?: string; machineId?: string
    }) =>
      generateReport({
        commits: opts.commits,
        dateStr: opts.dateStr,
        format: opts.format,
        model: safeModel(opts.model),
        omitTimes: !!opts.omitTimes,
        mode: opts.mode || 'hosted',
        metadataOnly: !!opts.metadataOnly,
        licenseKey: opts.licenseKey,
        email: opts.email,
        machineId: opts.machineId,
      }),
  )

  // ── API key ──────────────────────────────────────────────────────────────
  ipcMain.handle('reporter:key:has', () => hasApiKey())
  ipcMain.handle('reporter:key:set', (_e, key: string) => { setApiKey(key); return hasApiKey() })
  ipcMain.handle('reporter:key:clear', () => { clearApiKey() })
}
