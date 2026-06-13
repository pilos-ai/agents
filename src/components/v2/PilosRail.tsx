/**
 * 60px icon rail — the prototype's main navigation shell.
 *
 * Visually maps onto pilos-handoff/app/pilos-app.jsx (the NAV array + footer).
 * Wired to the existing zustand stores so clicking still routes through the
 * existing ViewRouter.
 */
import { useMemo, type ReactElement } from 'react'
import { useAppStore, WORKSPACE_NAV, type AppView } from '../../store/useAppStore'
import { useLicenseStore } from '../../store/useLicenseStore'
import {
  IconChat,
  IconWorkflow,
  IconTerminal,
  IconAnalytics,
  IconAgents,
  IconMcp,
  IconRuns,
  IconReport,
  IconSettings,
  IconSpark,
} from './PilosIcons'

type RailItem = {
  view: AppView
  label: string
  Icon: (props: { size?: number; className?: string }) => ReactElement
}

// Order matches the prototype's `pilos-app.jsx` NAV.
const RAIL_ITEMS: RailItem[] = [
  { view: 'chat', label: 'Chat', Icon: IconChat },
  { view: 'workflows', label: 'Workflows', Icon: IconWorkflow },
  { view: 'terminal', label: 'Terminal', Icon: IconTerminal },
  { view: 'analytics', label: 'Analytics', Icon: IconAnalytics },
  { view: 'agents', label: 'Agents', Icon: IconAgents },
  { view: 'mcp', label: 'MCP Servers', Icon: IconMcp },
  { view: 'runs', label: 'Run history', Icon: IconRuns },
  { view: 'reporter', label: 'Reporter', Icon: IconReport },
]

export function PilosRail() {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setOnboardingOpen = useAppStore((s) => s.setOnboardingOpen)
  const workspace = useAppStore((s) => s.workspace)
  const email = useLicenseStore((s) => s.email)

  // Only the active workspace's nav items appear in the rail (Reporter vs Agents).
  const items = RAIL_ITEMS.filter((it) => WORKSPACE_NAV[workspace].includes(it.view))

  const initials = useMemo(() => {
    if (!email) return '??'
    const local = email.split('@')[0] || ''
    return local.slice(0, 2).toUpperCase()
  }, [email])

  return (
    <div className="rail titlebar-no-drag">
      <div className="rail-logo" />
      {items.map((it) => {
        const active = activeView === it.view
        return (
          <button
            key={it.view + ':' + it.label}
            className={'rail-btn' + (active ? ' active' : '')}
            onClick={() => setActiveView(it.view)}
            aria-label={it.label}
          >
            <it.Icon size={19} />
            <span className="tip">{it.label}</span>
          </button>
        )
      })}
      <div className="rail-spacer" />
      <button
        className="rail-btn"
        onClick={() => setOnboardingOpen(true)}
        aria-label="Setup guide"
      >
        <IconSpark size={19} />
        <span className="tip">Setup guide</span>
      </button>
      <button
        className={'rail-btn' + (activeView === 'settings' ? ' active' : '')}
        onClick={() => setActiveView('settings')}
        aria-label="Settings"
      >
        <IconSettings size={19} />
        <span className="tip">Settings</span>
      </button>
      <div
        className="rail-ava"
        title={email || 'Account'}
        onClick={() => setActiveView('settings')}
      >
        {initials}
      </div>
    </div>
  )
}
