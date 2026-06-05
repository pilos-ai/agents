/**
 * Terminal page — pixel-faithful port of pilos-handoff/app/screen_terminal.jsx
 * wired to the real PTY (`electron/core/terminal-manager.ts` via
 * `window.api.terminal.*`).
 *
 * Each tab is a real PTY session backed by `TerminalTab` (xterm.js). Tabs are
 * stable IDs — switching between them keeps the underlying terminal mounted so
 * scrollback survives. Closing the last tab leaves a blank slate.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { TerminalTab } from '../../terminal/TerminalTab'
import { useProjectStore } from '../../../store/useProjectStore'
import {
  IconBranch,
  IconCpu,
  IconPlus,
} from '../PilosIcons'

interface Tab {
  id: string
  label: string
}

function makeTabId() {
  return `term-${Math.random().toString(36).slice(2, 9)}`
}

export default function TerminalPage() {
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const activeProject = useProjectStore((s) => {
    const path = s.activeProjectPath
    return s.openProjects.find((p) => p.projectPath === path)
  })

  const initialTab = useRef<Tab>({ id: makeTabId(), label: 'zsh — pilos' })
  const [tabs, setTabs] = useState<Tab[]>([initialTab.current])
  const [activeTabId, setActiveTabId] = useState<string>(initialTab.current.id)

  const addTab = useCallback(() => {
    const id = makeTabId()
    const next: Tab = { id, label: `zsh — ${tabs.length + 1}` }
    setTabs((prev) => [...prev, next])
    setActiveTabId(id)
  }, [tabs.length])

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (next.length === 0) {
        const fresh: Tab = { id: makeTabId(), label: 'zsh — pilos' }
        setActiveTabId(fresh.id)
        return [fresh]
      }
      if (id === activeTabId) setActiveTabId(next[0].id)
      return next
    })
  }, [activeTabId])

  // Reset tabs when project changes (PTY cwd is set at creation time so a new
  // project = a fresh shell).
  useEffect(() => {
    const fresh: Tab = { id: makeTabId(), label: 'zsh — pilos' }
    setTabs([fresh])
    setActiveTabId(fresh.id)
  }, [activeProjectPath])

  return (
    <div className="term-wrap">
      <div className="term-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={'term-tab' + (t.id === activeTabId ? ' on' : '')}
            onClick={() => setActiveTabId(t.id)}
          >
            <span className="li-dot dot-run" style={{ width: 6, height: 6 }} />
            {t.label}
            <span
              className="x"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
            >
              ×
            </span>
          </button>
        ))}
        <button
          className="term-tab"
          onClick={addTab}
          style={{ paddingRight: 10 }}
          aria-label="New terminal"
        >
          <span style={{ color: 'var(--muted)', display: 'inline-flex' }}>
            <IconPlus size={13} />
          </span>
        </button>
      </div>

      <div className="xterm-host">
        {/* Render every tab once and toggle visibility — preserves xterm state
            across tab switches without re-creating the PTY. */}
        {tabs.map((t) => (
          <div
            key={t.id}
            style={{
              display: t.id === activeTabId ? 'block' : 'none',
              height: '100%',
              width: '100%',
            }}
          >
            <TerminalTab id={t.id} cwd={activeProjectPath || undefined} />
          </div>
        ))}
      </div>

      <div className="term-status">
        <span className="s-item">
          <IconBranch size={12} />
          {activeProject?.projectName || 'no project'}
        </span>
        <span className="s-item" style={{ color: 'var(--ok)' }}>
          <span className="li-dot dot-ok" style={{ width: 6, height: 6 }} />
          shell ready
        </span>
        <span className="s-item">
          <IconCpu size={12} />
          {activeProject?.model || 'claude-sonnet-4.6'}
        </span>
        <span className="s-item" style={{ marginLeft: 'auto' }}>zsh</span>
        <span className="s-item">UTF-8</span>
        <span className="s-item">{tabs.length} tab{tabs.length === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}
