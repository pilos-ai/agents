import { create } from 'zustand'
import { api } from '../api'
import { useProjectStore } from './useProjectStore'
import { useLicenseStore } from './useLicenseStore'
import type { ReportFormat, ReporterCommit, ReporterMode, GenerateReportResult } from '../types'

export type ReporterSource = 'uncommitted' | 'date'

export type { ReporterMode } from '../types'

/** Pick a usable mode: honor the desired one if available, else hosted > cli > byok. */
function usableMode(
  desired: ReporterMode,
  avail: { cliAvailable: boolean; hostedAvailable: boolean },
): ReporterMode {
  const ok = (m: ReporterMode) => (m === 'hosted' ? avail.hostedAvailable : m === 'cli' ? avail.cliAvailable : true)
  if (ok(desired)) return desired
  if (avail.hostedAvailable) return 'hosted'
  if (avail.cliAvailable) return 'cli'
  return 'byok'
}

export interface RepoEntry {
  path: string
  name: string
  selected: boolean
}

const REPORTER_PREFS_KEY = 'pilos:reporter-prefs'

interface ReporterPrefs {
  format: ReportFormat
  model: string
  omitTimes: boolean
  source: ReporterSource
  mode: ReporterMode
  metadataOnly: boolean
}

const DEFAULT_PREFS: ReporterPrefs = {
  format: 'standup',
  model: 'claude-opus-4-8',
  omitTimes: false,
  source: 'uncommitted',
  mode: 'hosted', // hosted proxy is the primary path; falls back if unavailable
  metadataOnly: false,
}

function loadPrefs(): ReporterPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS }
  try {
    const raw = localStorage.getItem(REPORTER_PREFS_KEY)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(p: ReporterPrefs) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(REPORTER_PREFS_KEY, JSON.stringify(p)) } catch { /* best-effort */ }
}

// Repos the user explicitly removed. Persisted so they stay gone across
// restarts and aren't re-seeded from the open-projects list.
const REPORTER_DISMISSED_KEY = 'pilos:reporter-dismissed'

function loadDismissed(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(REPORTER_DISMISSED_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveDismissed(paths: string[]) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(REPORTER_DISMISSED_KEY, JSON.stringify(paths)) } catch { /* best-effort */ }
}

// Hosted free-tier daily quota. The client counter is OPTIMISTIC/informational;
// the server is authoritative (P2). BYOK/CLI are always unlimited.
export const HOSTED_FREE_DAILY = 5
const HOSTED_USAGE_KEY = 'pilos:reporter-usage'
function utcDay(): string { return new Date().toISOString().slice(0, 10) }

function loadHostedUsedToday(): number {
  if (typeof localStorage === 'undefined') return 0
  try {
    const raw = localStorage.getItem(HOSTED_USAGE_KEY)
    if (!raw) return 0
    const { day, count } = JSON.parse(raw)
    return day === utcDay() && typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

function bumpHostedUsed(): number {
  const next = loadHostedUsedToday() + 1
  try { localStorage.setItem(HOSTED_USAGE_KEY, JSON.stringify({ day: utcDay(), count: next })) } catch { /* best-effort */ }
  return next
}

/** Available models for report generation (label shown in the selector). */
export const REPORTER_MODELS: { value: string; label: string }[] = [
  { value: 'claude-opus-4-8', label: 'Opus 4.8 — most capable' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — faster / cheaper' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 — fastest' },
]

export const REPORTER_MODES: { value: ReporterMode; label: string; desc: string }[] = [
  { value: 'hosted', label: 'Pilos Cloud', desc: 'No setup — generate via Pilos (5/day free, Pro = unlimited)' },
  { value: 'byok', label: 'Your Anthropic key', desc: 'Bring your own API key — unlimited, code stays on your machine' },
  { value: 'cli', label: 'Claude CLI', desc: 'Use your Claude Code subscription — unlimited, fully local' },
]

export const REPORT_FORMATS: { value: ReportFormat; label: string; desc: string }[] = [
  { value: 'standup', label: 'Daily Standup', desc: 'What I did · Blockers · Tomorrow' },
  { value: 'detailed', label: 'Detailed Work Report', desc: 'Full task breakdown with technical details' },
  { value: 'manager', label: 'Manager Summary', desc: 'Business impact, for non-technical readers' },
  { value: 'timesheet', label: 'Timesheet', desc: 'Hour-by-hour, for tracking & billing' },
]

interface ReporterStore {
  repos: RepoEntry[]
  dismissed: string[]
  source: ReporterSource
  date: string // YYYY-MM-DD
  format: ReportFormat
  model: string
  omitTimes: boolean
  mode: ReporterMode
  metadataOnly: boolean
  cliAvailable: boolean
  hostedAvailable: boolean
  keyPresent: boolean
  generating: boolean
  report: GenerateReportResult | null
  commits: ReporterCommit[]
  error: string | null
  previewText: string | null
  previewMeta: { redacted: number; chars: number } | null
  previewLoading: boolean
  hostedUsedToday: number

  init: () => Promise<void>
  refreshKeyPresent: () => Promise<void>
  refreshAvailability: () => Promise<void>
  setApiKey: (key: string) => Promise<boolean>
  clearApiKey: () => Promise<void>
  syncReposFromProjects: () => void
  toggleRepo: (path: string) => void
  removeRepo: (path: string) => void
  addRepoFolder: () => Promise<void>
  setSource: (s: ReporterSource) => void
  setDate: (d: string) => void
  setFormat: (f: ReportFormat) => void
  setModel: (m: string) => void
  setOmitTimes: (v: boolean) => void
  setMode: (m: ReporterMode) => void
  setMetadataOnly: (v: boolean) => void
  loadPreview: () => Promise<void>
  closePreview: () => void
  generate: () => Promise<void>
}

/** Today's date as YYYY-MM-DD in the user's LOCAL timezone (not UTC). */
export function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

/** Human date string for the report header ("Friday, June 13, 2026"). */
function reportDateStr(source: ReporterSource, date: string): string {
  const base = source === 'uncommitted' ? new Date() : new Date(date + 'T00:00:00')
  return base.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

/** Selected repo paths, or null with an error set if none. */
function selectedPaths(repos: RepoEntry[]): string[] {
  return repos.filter((r) => r.selected).map((r) => r.path)
}

const prefs = loadPrefs()

export const useReporterStore = create<ReporterStore>((set, get) => ({
  repos: [],
  dismissed: loadDismissed(),
  source: prefs.source,
  date: todayISO(),
  format: prefs.format,
  model: prefs.model,
  omitTimes: prefs.omitTimes,
  mode: prefs.mode,
  metadataOnly: prefs.metadataOnly,
  cliAvailable: false,
  hostedAvailable: false,
  keyPresent: false,
  generating: false,
  report: null,
  commits: [],
  error: null,
  previewText: null,
  previewMeta: null,
  previewLoading: false,
  hostedUsedToday: loadHostedUsedToday(),

  init: async () => {
    get().syncReposFromProjects()
    await Promise.all([get().refreshKeyPresent(), get().refreshAvailability()])
  },

  refreshKeyPresent: async () => {
    try {
      set({ keyPresent: await api.reporter.keyHas() })
    } catch {
      set({ keyPresent: false })
    }
  },

  // Detect which transports are available (CLI installed, hosted proxy live) and
  // settle on a usable mode if the persisted choice can't be served right now.
  refreshAvailability: async () => {
    let cliAvailable = false
    let hostedAvailable = false
    try { cliAvailable = !!(await api.cli?.check?.())?.available } catch { /* ignore */ }
    try { hostedAvailable = await api.reporter.hostedAvailable() } catch { /* ignore */ }
    // Re-read the day-scoped quota so the counter resets after a UTC-midnight boundary.
    set((s) => ({ cliAvailable, hostedAvailable, hostedUsedToday: loadHostedUsedToday(), mode: usableMode(s.mode, { cliAvailable, hostedAvailable }) }))
  },

  setApiKey: async (key) => {
    const ok = await api.reporter.keySet(key)
    set({ keyPresent: ok })
    return ok
  },

  clearApiKey: async () => {
    await api.reporter.keyClear()
    set({ keyPresent: false })
  },

  // Seed the repo list from the app's open projects, preserving existing
  // selection + any folders the user added manually.
  syncReposFromProjects: () => {
    const open = useProjectStore.getState().openProjects
    const activePath = useProjectStore.getState().activeProjectPath
    set((s) => {
      const hidden = new Set(s.dismissed)
      const bySelected = new Map(s.repos.map((r) => [r.path, r.selected]))
      const projectEntries: RepoEntry[] = open
        .filter((p) => !hidden.has(p.projectPath))
        .map((p) => ({
          path: p.projectPath,
          name: p.projectName,
          selected: bySelected.get(p.projectPath) ?? (p.projectPath === activePath),
        }))
      // Keep manually-added repos that aren't open projects (and aren't dismissed).
      const openPaths = new Set(open.map((p) => p.projectPath))
      const extras = s.repos.filter((r) => !openPaths.has(r.path) && !hidden.has(r.path))
      return { repos: [...projectEntries, ...extras] }
    })
  },

  toggleRepo: (path) => set((s) => ({
    repos: s.repos.map((r) => (r.path === path ? { ...r, selected: !r.selected } : r)),
  })),

  // Remove a repo from the list. Recorded in `dismissed` (persisted) so it
  // isn't re-seeded from the open-projects list on the next sync.
  removeRepo: (path) => set((s) => {
    const dismissed = s.dismissed.includes(path) ? s.dismissed : [...s.dismissed, path]
    saveDismissed(dismissed)
    return { repos: s.repos.filter((r) => r.path !== path), dismissed }
  }),

  addRepoFolder: async () => {
    const picked = await api.dialog.openPath({ directory: true })
    if (!picked) return
    // Adding a folder un-dismisses it (overrides a previous removal).
    if (get().dismissed.includes(picked)) {
      const dismissed = get().dismissed.filter((p) => p !== picked)
      saveDismissed(dismissed)
      set({ dismissed })
    }
    if (get().repos.some((r) => r.path === picked)) {
      // Already visible — just make sure it's selected.
      set((s) => ({ repos: s.repos.map((r) => (r.path === picked ? { ...r, selected: true } : r)) }))
      return
    }
    const isRepo = await api.reporter.isGitRepo(picked)
    if (!isRepo) {
      set({ error: `${picked} is not a git repository.` })
      return
    }
    const name = picked.split('/').filter(Boolean).pop() || picked
    set((s) => ({ repos: [...s.repos, { path: picked, name, selected: true }], error: null }))
  },

  setSource: (source) => { set({ source }); savePrefs({ ...loadPrefs(), source }) },
  setDate: (date) => set({ date }),
  setFormat: (format) => { set({ format }); savePrefs({ ...loadPrefs(), format }) },
  setModel: (model) => { set({ model }); savePrefs({ ...loadPrefs(), model }) },
  setOmitTimes: (omitTimes) => { set({ omitTimes }); savePrefs({ ...loadPrefs(), omitTimes }) },
  setMode: (mode) => { set({ mode }); savePrefs({ ...loadPrefs(), mode }) },
  setMetadataOnly: (metadataOnly) => { set({ metadataOnly }); savePrefs({ ...loadPrefs(), metadataOnly }) },

  // Show exactly what would be sent to Claude (post-redaction), without generating.
  loadPreview: async () => {
    const { repos, source, date, format, omitTimes, metadataOnly } = get()
    const repoPaths = selectedPaths(repos)
    if (repoPaths.length === 0) { set({ error: 'Select at least one repository.' }); return }
    set({ previewLoading: true, previewText: null, previewMeta: null, error: null })
    try {
      const commits = await api.reporter.getCommits(
        source === 'uncommitted' ? { repoPaths, mode: 'uncommitted' } : { repoPaths, mode: 'date', date },
      )
      const res = await api.reporter.preview({ commits, dateStr: reportDateStr(source, date), format, omitTimes, metadataOnly })
      set({ previewText: res.prompt, previewMeta: { redacted: res.redacted, chars: res.chars }, previewLoading: false })
    } catch (err) {
      set({ previewLoading: false, error: err instanceof Error ? err.message : 'Preview failed.' })
    }
  },

  closePreview: () => set({ previewText: null, previewMeta: null }),

  generate: async () => {
    const { repos, source, date, format, model, omitTimes, metadataOnly, mode, cliAvailable, hostedAvailable } = get()
    const repoPaths = selectedPaths(repos)
    if (repoPaths.length === 0) {
      set({ error: 'Select at least one repository.' })
      return
    }
    // Resolve the transport now (the persisted choice may be unavailable).
    const effectiveMode = usableMode(mode, { cliAvailable, hostedAvailable })
    const lic = useLicenseStore.getState()
    const isPro = lic.tier === 'pro' || lic.tier === 'teams'
    // Hosted free tier is metered (BYOK/CLI/Pro are unlimited). Client check is a
    // courtesy gate; the server enforces authoritatively (P2).
    const hostedLimited = effectiveMode === 'hosted' && !isPro
    // Recompute from localStorage — the in-memory count goes stale across a UTC-midnight boundary.
    const usedNow = loadHostedUsedToday()
    if (hostedLimited && usedNow >= HOSTED_FREE_DAILY) {
      set({ hostedUsedToday: usedNow, error: `You've used your ${HOSTED_FREE_DAILY} free reports today — upgrade to Pro for unlimited, or switch to your own API key / Claude CLI.` })
      return
    }
    set({ generating: true, error: null, hostedUsedToday: usedNow })
    try {
      const commits = await api.reporter.getCommits(
        source === 'uncommitted'
          ? { repoPaths, mode: 'uncommitted' }
          : { repoPaths, mode: 'date', date },
      )
      const report = await api.reporter.generate({
        commits, dateStr: reportDateStr(source, date), format, model, omitTimes, metadataOnly,
        mode: effectiveMode,
        licenseKey: lic.licenseKey || undefined,
        email: lic.email || undefined,
      })
      // Count a successful hosted free generation against the daily quota.
      const usedToday = hostedLimited && !report.error ? bumpHostedUsed() : get().hostedUsedToday
      set({ commits, report, generating: false, error: report.error ?? null, hostedUsedToday: usedToday })
    } catch (err) {
      set({ generating: false, error: err instanceof Error ? err.message : 'Failed to generate report.' })
    }
  },
}))
