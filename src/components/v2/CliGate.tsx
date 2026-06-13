/**
 * CliGate — shown inside the Agents workspace when the Claude CLI isn't
 * connected. Ported from pilos-handoff's CLIGate. NOT a launch blocker: the
 * Reporter workspace works without the CLI; this only appears if you open an
 * Agents view (chat/workflows/…) before the CLI is ready.
 */
import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import {
  IconTerminal, IconLock, IconShield, IconRefresh, IconReport, IconCopy, IconCheckSm,
} from './PilosIcons'

const INSTALL_CMD = 'npm install -g @anthropic-ai/claude-code'

export function CliGate() {
  const cliStatus = useAppStore((s) => s.cliStatus)
  const checkCli = useAppStore((s) => s.checkCli)
  const setWorkspace = useAppStore((s) => s.setWorkspace)
  const setOnboardingOpen = useAppStore((s) => s.setOnboardingOpen)
  const [copied, setCopied] = useState(false)

  const busy = cliStatus === 'checking' || cliStatus === 'installing' || cliStatus === 'logging_in'

  return (
    <div className="onb" style={{ flex: 1 }}>
      <div className="onb-glow" />
      <div className="cli-gate pop-in">
        <div className="gate-ic"><IconTerminal size={26} /></div>
        <div className="gate-lock"><IconLock size={13} /></div>
        <h2 className="h2" style={{ marginTop: 18 }}>Agents needs Claude Code CLI</h2>
        <p className="muted" style={{ fontSize: 13, margin: '8px 0 0', lineHeight: 1.55 }}>
          The Agents workspace runs your AI team on top of the Claude Code CLI. It&apos;s included in
          your plan — it just has to be installed on this device. The{' '}
          <b style={{ color: 'var(--ink-2)' }}>Reporter</b> workspace works without it.
        </p>
        <div className="cli-box" style={{ margin: '16px 0' }}>
          <span className="dollar">$</span>
          <code>{INSTALL_CMD}</code>
          <button
            className="copy"
            title="Copy"
            onClick={() => { try { navigator.clipboard?.writeText(INSTALL_CMD) } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          >
            {copied ? <IconCheckSm size={14} style={{ color: 'var(--ok)' }} /> : <IconCopy size={14} />}
          </button>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary" onClick={() => void checkCli()} disabled={busy}>
            {busy ? 'Detecting…' : <><IconRefresh size={15} /> Detect CLI</>}
          </button>
          <button className="btn" onClick={() => setOnboardingOpen(true)}>
            <IconShield size={15} /> Setup guide
          </button>
          <button className="btn" onClick={() => setWorkspace('reporter')}>
            <IconReport size={15} /> Use Reporter instead
          </button>
        </div>
        <div className="gate-foot">
          <IconShield size={13} /> Both workspaces are included in Pilos Pro · the CLI runs locally
        </div>
      </div>
    </div>
  )
}
