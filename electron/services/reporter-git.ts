/**
 * Reporter git service — reads commits and uncommitted changes from local
 * repositories by shelling out to `git`. Ported from the standalone reporter's
 * backend/src/services/local-git.ts. Runs in the Electron main process (full
 * fs + child_process access), so it needs no separate backend.
 *
 * This is the "read files" surface of the Reporter feature: it reads local git
 * history/diffs for repo paths the user explicitly selects.
 *
 * SECURITY: every git call goes through execFile with an argv array — never a
 * shell string. Repo content (filenames, commit shas) and renderer-supplied
 * values (dates) are passed as literal arguments, so they can never be parsed
 * by /bin/sh (no command substitution / metacharacter injection). Paths are
 * additionally placed after a `--` separator so a leading-dash filename can't
 * be mistaken for a git option.
 */
import { execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execFileAsync = promisify(execFile)
const MAX_BUFFER = 1024 * 1024 * 16

// Resolve a git binary: explicit override → PATH → common macOS location.
function resolveGitPath(): string {
  if (process.env.GIT_PATH) return process.env.GIT_PATH
  try {
    execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
    return 'git'
  } catch {
    return '/opt/homebrew/bin/git'
  }
}

const GIT_PATH = resolveGitPath()

/** Run a git command via argv (no shell). Returns stdout. */
async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(GIT_PATH, args, { cwd: repoPath, maxBuffer: MAX_BUFFER })
  return stdout
}

export interface CommitFile {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

export interface CommitStats {
  additions: number
  deletions: number
  total: number
}

export interface CommitInfo {
  repo: string
  repoFullName: string
  sha: string
  message: string
  date: string
  files: CommitFile[]
  stats: CommitStats
}

/** True if `repoPath` is a readable git repository. */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await fs.access(repoPath)
    await git(repoPath, ['rev-parse', '--git-dir'])
    return true
  } catch {
    return false
  }
}

// Map a `git ... --name-status` code (M/A/D/R100/C75/T…) to our status label.
function statusFromCode(code: string): string {
  if (code.startsWith('A')) return 'added'
  if (code.startsWith('D')) return 'removed'
  if (code.startsWith('R')) return 'renamed'
  if (code.startsWith('C')) return 'renamed'
  return 'modified'
}

async function getCommitDetails(repoPath: string, repoName: string, sha: string): Promise<CommitInfo> {
  const messageAndDate = await git(repoPath, ['show', '-s', '--format=%s%n%b%n---SEPARATOR---%n%ai', sha])
  const [messageRaw, dateRaw] = messageAndDate.split('---SEPARATOR---')
  const message = (messageRaw || '').trim()
  const date = new Date((dateRaw || '').trim()).toISOString()

  // Exact filename → status map for this commit (single call, no substring matching).
  const statusByFile = new Map<string, string>()
  try {
    const nameStatus = await git(repoPath, ['show', '--name-status', '--format=', sha])
    for (const line of nameStatus.trim().split('\n').filter(Boolean)) {
      const parts = line.split('\t')
      if (parts.length < 2) continue
      // For renames/copies the destination path is the last field.
      const file = parts[parts.length - 1]
      statusByFile.set(file, statusFromCode(parts[0]))
    }
  } catch { /* leave map empty → default 'modified' */ }

  const statsOutput = await git(repoPath, ['show', '--numstat', '--format=', sha])

  const files: CommitFile[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const line of statsOutput.trim().split('\n').filter(Boolean)) {
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0
    const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0
    const filename = parts[2]
    totalAdditions += additions
    totalDeletions += deletions

    const status = statusByFile.get(filename) ?? 'modified'

    let patch: string | undefined
    try {
      patch = await git(repoPath, ['show', sha, '--', filename])
    } catch { /* binary/deleted — no patch */ }

    files.push({ filename, status, additions, deletions, changes: additions + deletions, patch })
  }

  return {
    repo: repoName,
    repoFullName: repoPath,
    sha,
    message,
    date,
    files,
    stats: { additions: totalAdditions, deletions: totalDeletions, total: totalAdditions + totalDeletions },
  }
}

async function getRepoCommits(repoPath: string, repoName: string, startDate: string, endDate: string): Promise<CommitInfo[]> {
  try {
    // --since=/--until= use the attached form so a value can never be parsed as a flag.
    const stdout = await git(repoPath, ['log', '--pretty=format:%H', `--since=${startDate}`, `--until=${endDate}`])
    if (!stdout.trim()) return []
    const commits: CommitInfo[] = []
    for (const sha of stdout.trim().split('\n').filter(Boolean)) {
      try {
        commits.push(await getCommitDetails(repoPath, repoName, sha))
      } catch (err) {
        console.warn(`[reporter-git] failed details for ${sha}:`, err)
      }
    }
    return commits
  } catch (err) {
    console.warn(`[reporter-git] failed commits for ${repoPath}:`, err)
    return []
  }
}

/** Commits across `repoPaths` within an ISO date range. */
export async function getCommitsForDateRange(repoPaths: string[], startDate: string, endDate: string): Promise<CommitInfo[]> {
  const all: CommitInfo[] = []
  for (const repoPath of repoPaths) {
    const repoName = path.basename(repoPath)
    all.push(...await getRepoCommits(repoPath, repoName, startDate, endDate))
  }
  return all
}

/** Commits across `repoPaths` for a single calendar day (local time). */
export async function getCommitsForDate(repoPaths: string[], date: string): Promise<CommitInfo[]> {
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end = new Date(date); end.setHours(23, 59, 59, 999)
  return getCommitsForDateRange(repoPaths, start.toISOString(), end.toISOString())
}

async function getRepoUncommitted(repoPath: string, repoName: string): Promise<CommitInfo | null> {
  const statusOutput = await git(repoPath, ['status', '--porcelain'])
  if (!statusOutput.trim()) return null

  // Exact path → status code map from porcelain (handles "R old -> new").
  const statusByFile = new Map<string, string>()
  for (const line of statusOutput.split('\n').filter(Boolean)) {
    const code = line.slice(0, 2)
    let rest = line.slice(3)
    const arrow = rest.indexOf(' -> ')
    if (arrow !== -1) rest = rest.slice(arrow + 4) // destination path for renames
    statusByFile.set(rest, code)
  }

  const diffOutput = await git(repoPath, ['diff', 'HEAD', '--numstat'])

  const files: CommitFile[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const line of diffOutput.trim().split('\n').filter(Boolean)) {
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0
    const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0
    const filename = parts[2]
    totalAdditions += additions
    totalDeletions += deletions

    let status = 'modified'
    const code = statusByFile.get(filename)
    if (code) {
      if (code.includes('A')) status = 'added'
      else if (code.includes('D')) status = 'removed'
      else if (code.includes('R')) status = 'renamed'
      else if (code.includes('M')) status = 'modified'
    }

    let patch: string | undefined
    try {
      patch = await git(repoPath, ['diff', 'HEAD', '--', filename])
    } catch { /* skip */ }

    files.push({ filename, status, additions, deletions, changes: additions + deletions, patch })
  }

  if (files.length === 0) return null
  return {
    repo: repoName,
    repoFullName: repoPath,
    sha: 'uncommitted',
    message: 'Uncommitted changes',
    date: new Date().toISOString(),
    files,
    stats: { additions: totalAdditions, deletions: totalDeletions, total: totalAdditions + totalDeletions },
  }
}

/** Uncommitted (working-tree) changes across `repoPaths`. */
export async function getUncommittedChanges(repoPaths: string[]): Promise<CommitInfo[]> {
  const all: CommitInfo[] = []
  for (const repoPath of repoPaths) {
    try {
      const repoName = path.basename(repoPath)
      const changes = await getRepoUncommitted(repoPath, repoName)
      if (changes) all.push(changes)
    } catch (err) {
      console.warn(`[reporter-git] failed uncommitted for ${repoPath}:`, err)
    }
  }
  return all
}
