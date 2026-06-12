import { create } from 'zustand'
import { api } from '../api'
import { useProjectStore } from './useProjectStore'
import type { ReportFormat, ReporterCommit, GenerateReportResult } from '../types'

export type ReporterSource = 'uncommitted' | 'date'

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
}

const DEFAULT_PREFS: ReporterPrefs = {
  format: 'standup',
  model: 'claude-opus-4-8',
  omitTimes: false,
  source: 'uncommitted',
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

/** Available models for report generation (label shown in the selector). */
export const REPORTER_MODELS: { value: string; label: string }[] = [
  { value: 'claude-opus-4-8', label: 'Opus 4.8 — most capable' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — faster / cheaper' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 — fastest' },
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
  keyPresent: boolean
  generating: boolean
  report: GenerateReportResult | null
  commits: ReporterCommit[]
  error: string | null

  init: () => Promise<void>
  refreshKeyPresent: () => Promise<void>
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
  generate: () => Promise<void>
}

/** Today's date as YYYY-MM-DD in the user's LOCAL timezone (not UTC). */
export function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
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
  keyPresent: false,
  generating: false,
  report: null,
  commits: [],
  error: null,

  init: async () => {
    get().syncReposFromProjects()
    await get().refreshKeyPresent()
  },

  refreshKeyPresent: async () => {
    try {
      set({ keyPresent: await api.reporter.keyHas() })
    } catch {
      set({ keyPresent: false })
    }
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

  generate: async () => {
    const { repos, source, date, format, model, omitTimes } = get()
    const repoPaths = repos.filter((r) => r.selected).map((r) => r.path)
    if (repoPaths.length === 0) {
      set({ error: 'Select at least one repository.' })
      return
    }
    set({ generating: true, error: null })
    try {
      const commits = await api.reporter.getCommits(
        source === 'uncommitted'
          ? { repoPaths, mode: 'uncommitted' }
          : { repoPaths, mode: 'date', date },
      )
      const dateStr = source === 'uncommitted'
        ? new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const report = await api.reporter.generate({ commits, dateStr, format, model, omitTimes })
      set({ commits, report, generating: false, error: report.error ?? null })
    } catch (err) {
      set({ generating: false, error: err instanceof Error ? err.message : 'Failed to generate report.' })
    }
  },
}))
