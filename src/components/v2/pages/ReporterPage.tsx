/**
 * ReporterPage — Work Day Reporter.
 *
 * Ports pilos-handoff/app/screen_reports.jsx into the live app. Reads local git
 * (commits or uncommitted changes) for the selected repositories and generates a
 * formatted daily report via the Claude API (key stored encrypted in the main
 * process). Works without the Claude CLI — the only requirement is an API key
 * (and it still produces a basic summary without one).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useReporterStore, REPORT_FORMATS, HOSTED_FREE_DAILY, todayISO } from '../../../store/useReporterStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { useLicenseStore } from '../../../store/useLicenseStore'
import {
  IconReport, IconBolt, IconCopy, IconCheckSm, IconCalendar, IconChevR,
  IconPlus, IconTrash, IconShield,
} from '../PilosIcons'

// Lightweight markdown: preserve newlines (via CSS pre-wrap) and bold **text**.
function renderReport(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith('**') && seg.endsWith('**')
      ? <strong key={i}>{seg.slice(2, -2)}</strong>
      : <span key={i}>{seg}</span>,
  )
}

// Conservative time-stripper for the "copy without time" option. Removes clock
// times (9:00, 14:30 PM) and durations (2h, ~1.5 hours, 30 min) — including a
// leading "~" and surrounding parens/separators — without touching prose.
function stripTimes(text: string): string {
  return text
    // parenthesised duration: "(2h)", "(~1.5 hours)", "(about 30 min)"
    .replace(/\s*\((?:~|about\s+)?\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|min|mins|minute|minutes)\)/gi, '')
    // clock time / range: "9:00", "14:30:00 PM", "9:00–10:30"
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?(?:\s*[–-]\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)?/gi, '')
    // bare duration: "~1.5 hours", "30 min". Requires a boundary before the
    // number and a multi-letter unit, so identifiers like "24h clock" or "s3h"
    // are left untouched (bare single-letter h/m is only stripped inside parens above).
    .replace(/(?<=^|[\s(])~?\d+(?:\.\d+)?\s*(?:hrs?|hours?|mins?|minutes?)\b/gi, '')
    // tidy leftovers: empty parens, dangling separators, doubled spaces
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:)])/g, '$1')
    .replace(/^[ \t]*[–·-]\s*$/gm, '')
}

function ConfigColumn() {
  const repos = useReporterStore((s) => s.repos)
  const toggleRepo = useReporterStore((s) => s.toggleRepo)
  const removeRepo = useReporterStore((s) => s.removeRepo)
  const addRepoFolder = useReporterStore((s) => s.addRepoFolder)
  const source = useReporterStore((s) => s.source)
  const setSource = useReporterStore((s) => s.setSource)
  const date = useReporterStore((s) => s.date)
  const setDate = useReporterStore((s) => s.setDate)
  const format = useReporterStore((s) => s.format)
  const setFormat = useReporterStore((s) => s.setFormat)
  const omitTimes = useReporterStore((s) => s.omitTimes)
  const setOmitTimes = useReporterStore((s) => s.setOmitTimes)
  const metadataOnly = useReporterStore((s) => s.metadataOnly)
  const setMetadataOnly = useReporterStore((s) => s.setMetadataOnly)
  const loadPreview = useReporterStore((s) => s.loadPreview)
  const previewLoading = useReporterStore((s) => s.previewLoading)
  const hostedUsedToday = useReporterStore((s) => s.hostedUsedToday)
  const tier = useLicenseStore((s) => s.tier)
  const generate = useReporterStore((s) => s.generate)
  const generating = useReporterStore((s) => s.generating)

  const selCount = repos.filter((r) => r.selected).length
  // Reports always generate via Pilos Cloud (the backend). Free = N/day, Pro = unlimited.
  const isPro = tier === 'pro' || tier === 'teams'
  const remaining = Math.max(0, HOSTED_FREE_DAILY - hostedUsedToday)

  return (
    <div className="rep-conf">
      <div className="rep-conf-scroll">
        <div style={{ fontSize: 13, fontWeight: 650, padding: '2px 2px 4px' }}>Work Day Reporter</div>

        <div className="pal-sec">Repositories · {selCount} of {repos.length}</div>
        {repos.map((r) => (
          <div key={r.path} className="ckrow" onClick={() => toggleRepo(r.path)}>
            <span className={'ckbox' + (r.selected ? ' on' : '')}><IconCheckSm size={11} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ck-name">{r.name}</div>
              <div className="ck-path">{r.path}</div>
            </div>
            <button
              type="button"
              className="ck-del"
              title="Remove from list"
              aria-label={`Remove ${r.name}`}
              onClick={(e) => { e.stopPropagation(); removeRepo(r.path) }}
            >
              <IconTrash size={13} />
            </button>
          </div>
        ))}
        {repos.length === 0 && (
          <div className="muted" style={{ fontSize: 11.5, padding: '4px 8px' }}>No repositories yet — add a folder below.</div>
        )}
        <button type="button" className="btn sm ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={() => void addRepoFolder()}>
          <IconPlus size={13} /> Add repository folder
        </button>

        <div className="pal-sec">Data source</div>
        {([['uncommitted', 'Local changes', 'Uncommitted file changes, right now'], ['date', 'Git commits', 'Committed work on a chosen day']] as const).map(([k, t, d]) => (
          <div key={k} className={'optrow' + (source === k ? ' on' : '')} onClick={() => setSource(k)}>
            <span className="rdot" />
            <div><div className="ot">{t}</div><div className="od">{d}</div></div>
          </div>
        ))}
        {source === 'date' && (
          <div className="field" style={{ margin: '2px 0 10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconCalendar size={13} /> Date</label>
            <input type="date" className="control" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}

        <div className="pal-sec">Report format</div>
        {REPORT_FORMATS.map((f) => (
          <div key={f.value} className={'optrow' + (format === f.value ? ' on' : '')} onClick={() => setFormat(f.value)}>
            <span className="rdot" />
            <div><div className="ot">{f.label}</div><div className="od">{f.desc}</div></div>
          </div>
        ))}

        <div className="pal-sec">Options</div>
        <div className={'optrow' + (omitTimes ? ' on' : '')} style={{ alignItems: 'flex-start' }} onClick={() => setOmitTimes(!omitTimes)}>
          <span className={'ckbox' + (omitTimes ? ' on' : '')} style={{ flex: 'none', marginTop: 1 }}><IconCheckSm size={11} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="ot">Omit time estimates</div>
            <div className="od">No hours, durations, or clock times in the report</div>
          </div>
        </div>

        <div className={'optrow' + (metadataOnly ? ' on' : '')} style={{ alignItems: 'flex-start' }} onClick={() => setMetadataOnly(!metadataOnly)}>
          <span className={'ckbox' + (metadataOnly ? ' on' : '')} style={{ flex: 'none', marginTop: 1 }}><IconCheckSm size={11} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="ot">Metadata only</div>
            <div className="od">Omit code snippets — send only stats, file names &amp; commit messages</div>
          </div>
        </div>
      </div>

      <div className="rep-conf-foot">
        {!isPro && (
          <div className="rep-quota">
            <span style={{ color: remaining > 0 ? 'var(--ink-2)' : 'var(--warn)' }}>
              {remaining > 0
                ? `${remaining} of ${HOSTED_FREE_DAILY} free Pilos Cloud reports left today`
                : 'Daily free limit reached'}
            </span>
            <button
              type="button"
              className="btn sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => void window.api.dialog.openExternal('https://pilos.net/pricing')}
            >
              Upgrade
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn sm ghost"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
          onClick={() => void loadPreview()}
          disabled={previewLoading || selCount === 0}
        >
          <IconShield size={13} /> {previewLoading ? 'Loading preview…' : 'Preview what gets sent'}
        </button>
        <button
          type="button"
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => void generate()}
          disabled={generating || selCount === 0}
        >
          {generating ? 'Generating…' : <><IconBolt size={14} /> Generate report</>}
        </button>
      </div>
    </div>
  )
}

function CommitDetails() {
  const commits = useReporterStore((s) => s.commits)
  const source = useReporterStore((s) => s.source)
  const [open, setOpen] = useState(true)
  if (commits.length === 0) return null

  const isLocal = source === 'uncommitted'
  const fileCount = new Set(commits.flatMap((c) => c.files.map((f) => f.filename))).size

  return (
    <div className="tile" style={{ marginTop: 14, padding: 0 }}>
      <button type="button" className="rep-acc" onClick={() => setOpen(!open)}>
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', display: 'inline-flex', transition: 'transform 0.2s' }}><IconChevR size={14} /></span>
        {isLocal ? 'Changed files' : 'Commits'}
        <span className="tag" style={{ marginLeft: 'auto' }}>{isLocal ? `${fileCount} files` : `${commits.length} commits`}</span>
      </button>
      {open && (
        <div className="rep-acc-body">
          {isLocal
            ? commits.flatMap((c) => c.files).map((f, i) => (
                <div key={f.filename + i} className="rep-file-row">
                  <span className="file-pill">{f.filename}</span>
                  <span className={'fs-' + f.status}>{f.status}</span>
                  <span className="rep-diff" style={{ marginLeft: 'auto' }}>+{f.additions} −{f.deletions}</span>
                </div>
              ))
            : commits.map((c) => (
                <div key={c.sha} className="rep-file-row">
                  <span className="file-pill" style={{ color: 'var(--accent-2)' }}>{c.sha.slice(0, 7)}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)' }}>{c.message.split('\n')[0]}</span>
                  <span className="rep-diff">+{c.stats.additions} −{c.stats.deletions}</span>
                </div>
              ))}
        </div>
      )}
    </div>
  )
}

function ReportOutput() {
  const generating = useReporterStore((s) => s.generating)
  const report = useReporterStore((s) => s.report)
  const error = useReporterStore((s) => s.error)
  const source = useReporterStore((s) => s.source)
  const format = useReporterStore((s) => s.format)
  const omitTimes = useReporterStore((s) => s.omitTimes)
  const [copied, setCopied] = useState(false)

  // "Copy without time" applies live (no re-generation needed): toggling the
  // config instantly filters times out of both the displayed and copied text.
  const summary = report ? (omitTimes ? stripTimes(report.summary) : report.summary) : ''

  const stats = report?.stats
  const statCells = stats
    ? [
        [source === 'uncommitted' ? 'Uncommitted' : String(stats.totalCommits), source === 'uncommitted' ? 'changeset' : 'commits'],
        [String(stats.filesChanged), 'files changed'],
        [`+${stats.additions.toLocaleString()}`, 'lines added'],
        [`−${stats.deletions.toLocaleString()}`, 'lines deleted'],
      ]
    : []

  const copy = () => {
    if (!report) return
    void navigator.clipboard.writeText(summary).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }).catch(() => {})
  }
  const download = () => {
    if (!report) return
    const blob = new Blob([summary], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `work-report-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const formatLabel = REPORT_FORMATS.find((f) => f.value === format)?.label ?? format

  return (
    <div className="main" style={{ flex: 1 }}>
      <div className="main-head">
        <div className="main-title">
          <IconReport size={17} style={{ color: 'var(--ink-3)' }} />
          Work Report
          <span className="tag ok">offline-ready</span>
          <span className="tag">{source === 'uncommitted' ? 'local changes' : 'git commits'}</span>
          {omitTimes && <span className="tag">no times</span>}
        </div>
        <div className="main-actions">
          <button type="button" className="btn sm" onClick={copy} disabled={!report}>
            {copied ? <IconCheckSm size={14} style={{ color: 'var(--ok)' }} /> : <IconCopy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn sm primary" onClick={download} disabled={!report}>
            <IconReport size={14} /> Download .md
          </button>
        </div>
      </div>

      <div className="main-body scroll">
        <div className="pad" style={{ maxWidth: 880 }}>
          {/* Errors (bad repo folder, failed generate) must show even when no
              report exists yet — render above the empty/generating states. */}
          {error && (
            <div className="rep-keybar" style={{ borderColor: 'var(--warn)', background: 'rgba(246,183,60,0.08)' }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{error}</span>
            </div>
          )}

          {generating ? (
            <div className="rep-gen">
              <div className="tdots"><span /><span /><span /></div>
              Reading git data &amp; assembling report…
            </div>
          ) : !report ? (
            <div className="rep-empty">
              <IconReport size={34} style={{ color: 'var(--faint)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>No report yet</div>
                <div style={{ fontSize: 11.5, marginTop: 4 }}>Pick repositories, a source and a format, then Generate.</div>
              </div>
            </div>
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
                <span className="tag accent">{formatLabel}</span>
              </div>
              {stats && (
                <div className="stat-grid" style={{ marginBottom: 14 }}>
                  {statCells.map(([v, k]) => (
                    <div key={k} className="stat">
                      <div className="sv" style={{ marginTop: 0, fontSize: 22 }}>{v}</div>
                      <div className="sk" style={{ marginTop: 4 }}>{k}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="tile rep-body">{renderReport(summary)}</div>
              <CommitDetails />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// "See exactly what's sent" — shows the assembled, redacted prompt before generating.
function PreviewModal() {
  const previewText = useReporterStore((s) => s.previewText)
  const previewMeta = useReporterStore((s) => s.previewMeta)
  const closePreview = useReporterStore((s) => s.closePreview)
  useEffect(() => {
    if (previewText === null) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreview() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [previewText, closePreview])
  if (previewText === null) return null
  const redacted = previewMeta?.redacted ?? 0
  return (
    <div className="rep-preview-overlay" onClick={closePreview}>
      <div className="rep-preview" onClick={(e) => e.stopPropagation()}>
        <div className="rep-preview-head">
          <IconShield size={15} style={{ color: 'var(--accent-2)' }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Your data sent to Claude</span>
          <span className="tag">{(previewMeta?.chars ?? 0).toLocaleString()} chars</span>
          {redacted > 0 && <span className="tag ok">{redacted} secret{redacted === 1 ? '' : 's'} redacted</span>}
          <button type="button" className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={closePreview}>Close</button>
        </div>
        <div style={{ padding: '8px 16px 0', fontSize: 11.5, color: 'var(--muted)' }}>
          Only this — your git stats, file names &amp; commit messages (secrets removed). Pilos adds the report formatting on the server; no other data leaves your machine.
        </div>
        <pre className="rep-preview-body">{previewText || '(nothing to send — no changes found)'}</pre>
      </div>
    </div>
  )
}

export default function ReporterPage() {
  const init = useReporterStore((s) => s.init)

  useEffect(() => {
    void init()
    // Keep the repo list in sync as the user opens/closes projects.
    const unsub = useProjectStore.subscribe((s, prev) => {
      if (s.openProjects !== prev.openProjects) useReporterStore.getState().syncReposFromProjects()
    })
    return unsub
  }, [init])

  return (
    <div className="rep-wrap">
      <ConfigColumn />
      <ReportOutput />
      <PreviewModal />
    </div>
  )
}
