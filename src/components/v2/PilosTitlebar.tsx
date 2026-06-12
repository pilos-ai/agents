/**
 * Pilos titlebar — traffic lights + breadcrumb + MCP/token pills + bell + settings.
 *
 * Mirrors pilos-handoff/app/pilos-app.jsx (the .titlebar block). Drag region is
 * handled by .titlebar CSS (`-webkit-app-region: drag`), with buttons opted out.
 *
 * On macOS the BrowserWindow uses `titleBarStyle: 'hiddenInset'` which renders
 * native traffic lights on top of the renderer — so we suppress our simulated
 * lights on macOS to avoid double-up. Windows / Linux still get the simulated set.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import { useAppStore, type AppView } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useUsageStore } from '../../store/useUsageStore'
import { IconBell, IconSettings, IconSpark } from './PilosIcons'

const CRUMB: Partial<Record<AppView, string>> = {
  dashboard: 'Dashboard',
  chat: 'Chat',
  workflows: 'Workflows',
  terminal: 'Terminal',
  analytics: 'Analytics',
  agents: 'Agents',
  mcp: 'MCP Servers',
  runs: 'Run history',
  reporter: 'Reporter',
  settings: 'Settings',
}

function detectIsMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as { platform?: string }).platform || ''
  const ua = navigator.userAgent || ''
  return /Mac|iPhone|iPad/.test(platform) || /Macintosh/.test(ua)
}

function fmtTokens(n: number | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function PilosTitlebar() {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const openProjects = useProjectStore((s) => s.openProjects)
  const limits = useUsageStore((s) => s.limits)

  const isMac = useMemo(detectIsMac, [])

  const activeProject = openProjects.find((p) => p.projectPath === activeProjectPath)
  const projectName = activeProject?.projectName || 'no project'
  const crumb = CRUMB[activeView] || String(activeView)

  const mcpCount = (activeProject?.mcpServers || []).filter((s) => s.enabled).length

  // Token budget — best effort. The prototype shows "18.2k / 200k"; we surface
  // the 5-hour session window if available, otherwise just the percentage.
  const sessionTokens = limits?.five_hour
  const tokenLabel = sessionTokens
    ? `${Math.round(sessionTokens.utilization ?? 0)}% / 5h`
    : '— / —'

  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notifOpen) return
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setNotifOpen(false)
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [notifOpen])

  return (
    <div className="titlebar">
      {/* Traffic lights — simulated on Windows/Linux only (mac already has real ones from hiddenInset) */}
      {!isMac && (
        <div className="lights">
          <button className="light r" title="Close" onClick={() => api.window?.close?.()} />
          <button className="light y" title="Minimize" onClick={() => api.window?.minimize?.()} />
          <button className="light g" title="Zoom" onClick={() => api.window?.maximize?.()} />
        </div>
      )}
      {/* On macOS, leave room for the native traffic lights (positioned at x:15) */}
      {isMac && <div style={{ width: 64, flex: 'none' }} aria-hidden />}

      <div className="tb-title">
        <span>Pilos</span>
        <span className="sep">/</span>
        <span>{projectName}</span>
        <span className="sep">/</span>
        <span className="crumb">{crumb}</span>
      </div>

      <div className="tb-right">
        <button className="tb-pill" onClick={() => setActiveView('mcp')}>
          <span className="dot" />
          {mcpCount} MCP server{mcpCount === 1 ? '' : 's'}
        </button>

        <button className="tb-pill mono" onClick={() => setActiveView('analytics')}>
          <IconSpark size={13} style={{ color: 'var(--accent-2)' }} />
          {tokenLabel}
        </button>

        {/* Notification dropdown */}
        <div className="menu-wrap" ref={notifRef}>
          <button
            className="tb-icon"
            onClick={(e) => {
              e.stopPropagation()
              setNotifOpen((o) => !o)
            }}
            aria-expanded={notifOpen}
          >
            <IconBell size={16} />
          </button>
          {notifOpen && (
            <div className="menu menu-right" style={{ width: 290 }}>
              <div className="notif">
                <div className="menu-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Notifications</span>
                </div>
                <div
                  className="notif-empty muted"
                  style={{ padding: '18px 14px', textAlign: 'center', fontSize: 12 }}
                >
                  No notifications
                </div>
                <div className="notif-foot">
                  <button
                    className="menu-item"
                    onClick={() => {
                      setNotifOpen(false)
                      setActiveView('runs')
                    }}
                  >
                    <span className="mi-l" style={{ color: 'var(--accent-2)', textAlign: 'center' }}>
                      View all in Run history
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          className={'tb-icon' + (activeView === 'settings' ? ' active' : '')}
          onClick={() => setActiveView('settings')}
          aria-label="Settings"
        >
          <IconSettings size={16} />
        </button>
      </div>
    </div>
  )
}

