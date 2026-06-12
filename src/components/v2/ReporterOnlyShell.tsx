/**
 * ReporterOnlyShell — the minimal app shell shown when the Claude CLI isn't
 * available but the user chose "use the Reporter only".
 *
 * The full Pilos shell (chat, workflows, terminal, agents…) all sit on top of
 * the Claude Code CLI. The Work Day Reporter does not — it talks to the Claude
 * API directly with an API key — so it can run standalone. This shell drops the
 * nav rail entirely and shows just the reporter, plus a slim bar nudging the
 * user to install the CLI (which unlocks the rest of the app).
 */
import { api } from '../../api'
import { useAppStore } from '../../store/useAppStore'
import { IconReport, IconExternal } from './PilosIcons'
import ReporterPage from './pages/ReporterPage'

function detectIsMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as { platform?: string }).platform || ''
  const ua = navigator.userAgent || ''
  return /Mac|iPhone|iPad/.test(platform) || /Macintosh/.test(ua)
}

export function ReporterOnlyShell() {
  const setReporterOnlyMode = useAppStore((s) => s.setReporterOnlyMode)
  const checkDependencies = useAppStore((s) => s.checkDependencies)
  const isMac = detectIsMac()

  const backToSetup = () => {
    setReporterOnlyMode(false)
    // Re-probe so the onboarding wizard reflects the current CLI state.
    void checkDependencies()
  }

  return (
    <div className="desktop flush">
      <div className="win flush">
        {/* Slim titlebar (drag region) */}
        <div className="titlebar">
          {!isMac && (
            <div className="lights">
              <button className="light r" title="Close" onClick={() => api.window?.close?.()} />
              <button className="light y" title="Minimize" onClick={() => api.window?.minimize?.()} />
              <button className="light g" title="Zoom" onClick={() => api.window?.maximize?.()} />
            </div>
          )}
          {isMac && <div style={{ width: 64, flex: 'none' }} aria-hidden />}
          <div className="tb-title">
            <span>Pilos</span>
            <span className="sep">/</span>
            <span className="crumb">Work Day Reporter</span>
          </div>
          <div className="tb-right">
            <button className="btn sm ghost titlebar-no-drag" onClick={backToSetup}>
              <IconReport size={13} /> Set up Claude CLI
            </button>
          </div>
        </div>

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* CLI-missing nudge */}
          <div
            className="row titlebar-no-drag"
            style={{
              gap: 10,
              padding: '8px 14px',
              fontSize: 12,
              color: 'var(--ink-2)',
              background: 'var(--surface)',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <IconReport size={15} style={{ color: 'var(--accent-2)', flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              Claude CLI not detected — running the standalone reporter. It only needs a Claude
              API key (set it below). Install the CLI to unlock chat, workflows and the rest of Pilos.
            </span>
            <button
              className="btn sm ghost"
              onClick={() => void api.dialog.openExternal('https://console.anthropic.com/settings/keys')}
            >
              <IconExternal size={12} /> Get API key
            </button>
            <button className="btn sm primary" onClick={backToSetup}>
              Install CLI
            </button>
          </div>

          <ReporterPage />
        </main>
      </div>
    </div>
  )
}
