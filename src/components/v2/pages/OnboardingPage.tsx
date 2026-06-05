import { useState, useMemo } from 'react'
import { Icon } from '../../common/Icon'
import { useAppStore } from '../../../store/useAppStore'
import type { DependencyName } from '../../../types'

const STEPS = ['Install CLI', 'Authenticate', 'Ready'] as const

function copyToClipboard(text: string) {
  try {
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
    }
  } catch {
    /* clipboard blocked — silent */
  }
}

// ── Step 1: System deps + CLI install ──

function DependencyRow({ name, label }: { name: DependencyName; label: string }) {
  const dependencyResult = useAppStore((s) => s.dependencyResult)
  const browseForBinary = useAppStore((s) => s.browseForBinary)

  const dep = dependencyResult?.[name]
  const status = dep?.status || 'checking'
  const version = dep?.version

  return (
    <div className="row" style={{ gap: 8, fontSize: 12.5, marginTop: 6 }}>
      {status === 'found' && (
        <span className="li-dot dot-ok" style={{ width: 7, height: 7 }} />
      )}
      {status === 'checking' && (
        <span className="li-dot dot-idle" style={{ width: 7, height: 7 }} />
      )}
      {(status === 'not_found' || status === 'error') && (
        <span className="li-dot dot-err" style={{ width: 7, height: 7 }} />
      )}
      <span style={{ color: status === 'found' ? 'var(--ok)' : 'var(--ink-3)' }}>
        {label}
        {version ? <span className="muted" style={{ marginLeft: 6 }}>v{version}</span> : null}
      </span>
      {status === 'not_found' && (
        <button
          onClick={() => browseForBinary(name)}
          className="btn sm ghost"
          style={{ marginLeft: 'auto' }}
        >
          Locate
        </button>
      )}
    </div>
  )
}

function StepInstallCli() {
  const cliStatus = useAppStore((s) => s.cliStatus)
  const cliVersion = useAppStore((s) => s.cliVersion)
  const installCli = useAppStore((s) => s.installCli)
  const cliInstallLog = useAppStore((s) => s.cliInstallLog)
  const dependencyResult = useAppStore((s) => s.dependencyResult)
  const checkDependencies = useAppStore((s) => s.checkDependencies)
  const [copied, setCopied] = useState(false)
  const installCmd = 'npm install -g @anthropic-ai/claude-code'
  const depsFound = dependencyResult?.allFound || false

  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        Install Claude Code CLI
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        Pilos runs on top of the official CLI. Install it globally with npm:
      </p>

      <div className="cli-box">
        <span className="dollar">$</span>
        <code>{installCmd}</code>
        <button
          className="copy"
          onClick={() => {
            copyToClipboard(installCmd)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          title="Copy"
        >
          {copied ? (
            <Icon icon="lucide:check" className="text-[14px]" style={{ color: 'var(--ok)' }} />
          ) : (
            <Icon icon="lucide:copy" className="text-[14px]" />
          )}
        </button>
      </div>

      {/* Dependency status */}
      <div style={{ marginTop: 4 }}>
        <DependencyRow name="node" label="Node.js detected on PATH" />
        <DependencyRow name="git" label="Git detected on PATH" />
        {cliStatus === 'ready' && cliVersion && (
          <div className="row" style={{ gap: 8, fontSize: 12, color: 'var(--ok)', marginTop: 6 }}>
            <span className="li-dot dot-ok" style={{ width: 7, height: 7 }} />
            Detected claude-code v{cliVersion} on PATH
          </div>
        )}
        {cliStatus === 'checking' && (
          <div className="row" style={{ gap: 8, marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
            <Icon icon="lucide:loader-2" className="animate-spin text-[14px]" style={{ color: 'var(--accent-2)' }} />
            Checking for Claude CLI...
          </div>
        )}
        {cliStatus === 'error' && (
          <div style={{ marginTop: 12 }}>
            <div
              className="row"
              style={{
                gap: 8,
                padding: '8px 10px',
                background: 'rgba(251,111,111,0.08)',
                border: '1px solid rgba(251,111,111,0.25)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--err)',
                fontSize: 12,
              }}
            >
              <Icon icon="lucide:x-circle" className="text-[14px]" />
              Couldn't check for the Claude CLI
            </div>
            <button onClick={checkDependencies} className="btn" style={{ marginTop: 10 }}>
              <Icon icon="lucide:refresh-cw" className="text-[12px]" />
              Try again
            </button>
          </div>
        )}
        {cliStatus === 'missing' && (
          <button
            onClick={installCli}
            className="btn primary"
            style={{ marginTop: 12 }}
          >
            <Icon icon="lucide:download" className="text-[15px]" />
            Install Claude CLI for me
          </button>
        )}
        {cliStatus === 'installing' && (
          <div className="row" style={{ gap: 8, marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
            <Icon icon="lucide:loader-2" className="animate-spin text-[14px]" style={{ color: 'var(--accent-2)' }} />
            Installing...
          </div>
        )}
        {cliStatus === 'install_failed' && (
          <div style={{ marginTop: 12 }}>
            <div
              className="row"
              style={{
                gap: 8,
                padding: '8px 10px',
                background: 'rgba(251,111,111,0.08)',
                border: '1px solid rgba(251,111,111,0.25)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--err)',
                fontSize: 12,
              }}
            >
              <Icon icon="lucide:x-circle" className="text-[14px]" />
              Installation failed
            </div>
            <button onClick={installCli} className="btn" style={{ marginTop: 10 }}>
              Retry install
            </button>
          </div>
        )}
        {dependencyResult && !dependencyResult.allFound && (
          <button onClick={checkDependencies} className="btn sm ghost" style={{ marginTop: 12 }}>
            <Icon icon="lucide:refresh-cw" className="text-[12px]" />
            Re-check dependencies
          </button>
        )}
        {cliInstallLog && cliStatus === 'installing' && (
          <pre
            style={{
              marginTop: 10,
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: 'var(--muted)',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-sm)',
              padding: 8,
              maxHeight: 80,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {cliInstallLog}
          </pre>
        )}
        {!depsFound && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            Install Node.js and Git first, then re-check dependencies.
          </p>
        )}
      </div>
    </>
  )
}

// ── Step 2: Authenticate with Anthropic ──

function StepAuth() {
  const cliStatus = useAppStore((s) => s.cliStatus)
  const loginCli = useAppStore((s) => s.loginCli)
  const accountEmail = useAppStore((s) => s.accountEmail)
  const accountPlan = useAppStore((s) => s.accountPlan)

  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        Authenticate with Anthropic
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        No separate API key needed — the CLI handles auth. Sign in to link your account.
      </p>

      {cliStatus === 'ready' && accountEmail ? (
        <div
          className="tile"
          style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div className="tile-logo">
            <Icon icon="lucide:user" className="text-[20px]" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{accountEmail}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {accountPlan ? `Claude ${accountPlan} · authenticated via CLI` : 'Authenticated via CLI'}
            </div>
          </div>
          <span className="tag ok">linked</span>
        </div>
      ) : cliStatus === 'ready' ? (
        <div
          className="tile"
          style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div className="tile-logo" style={{ background: 'rgba(62,207,142,0.12)', color: 'var(--ok)' }}>
            <Icon icon="lucide:check" className="text-[20px]" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>CLI ready</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Authenticated via Claude Code</div>
          </div>
          <span className="tag ok">linked</span>
        </div>
      ) : cliStatus === 'needs_login' ? (
        <>
          <div
            className="tile"
            style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div className="tile-logo">
              <Icon icon="lucide:user" className="text-[20px]" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Sign in to Claude</div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                We'll open the CLI's browser sign-in flow
              </div>
            </div>
            <button onClick={loginCli} className="btn primary">
              <Icon icon="lucide:log-in" className="text-[15px]" />
              Sign in
            </button>
          </div>
        </>
      ) : cliStatus === 'logging_in' ? (
        <div
          className="tile"
          style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <Icon icon="lucide:loader-2" className="animate-spin text-[18px]" style={{ color: 'var(--accent-2)' }} />
          <div className="muted" style={{ fontSize: 12.5 }}>
            Opening browser for sign in...
          </div>
        </div>
      ) : (
        <div
          className="tile"
          style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <Icon icon="lucide:loader-2" className="animate-spin text-[18px]" style={{ color: 'var(--accent-2)' }} />
          <div className="muted" style={{ fontSize: 12.5 }}>
            Checking authentication...
          </div>
        </div>
      )}
    </>
  )
}

// ── Step 3: Ready ──

function StepReady() {
  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        Ready to open Pilos
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        Your environment is configured. Pilos stays local — conversations and runs are
        stored in SQLite on your machine.
      </p>
      <div
        className="tile"
        style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <div className="tile-logo" style={{ background: 'rgba(62,207,142,0.12)', color: 'var(--ok)' }}>
          <Icon icon="lucide:check" className="text-[20px]" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>All systems operational</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            The app will load in a moment...
          </div>
        </div>
        <span className="tag ok">ready</span>
      </div>
    </>
  )
}

// ── Main ──

export default function OnboardingPage() {
  const setupStatus = useAppStore((s) => s.setupStatus)
  const cliStatus = useAppStore((s) => s.cliStatus)
  const dependencyResult = useAppStore((s) => s.dependencyResult)

  // Map app state -> wizard step (1/2/3)
  const step = useMemo(() => {
    const depsFound = dependencyResult?.allFound || false
    if (!depsFound) return 1
    if (cliStatus === 'missing' || cliStatus === 'installing' || cliStatus === 'install_failed' || cliStatus === 'checking') {
      return 1
    }
    if (cliStatus === 'needs_login' || cliStatus === 'logging_in') return 2
    if (cliStatus === 'ready' && setupStatus !== 'ready') return 2
    return 3
  }, [setupStatus, cliStatus, dependencyResult])

  const [manualStep, setManualStep] = useState<number | null>(null)
  const currentStep = manualStep ?? step

  // Forward state changes — auto-advance unless user explicitly went Back
  // (we reset manualStep when reaching step 3 / ready)
  const effectiveStep = Math.max(currentStep, manualStep === null ? step : currentStep)

  const canContinue =
    (effectiveStep === 1 && (dependencyResult?.allFound || false) && cliStatus === 'ready') ||
    (effectiveStep === 2 && cliStatus === 'ready') ||
    effectiveStep === 3
  const isLast = effectiveStep === 3

  return (
    <div className="onb">
      <div className="onb-glow" />
      <div className="onb-card pop-in">
        {/* Header */}
        <div className="row" style={{ gap: 12 }}>
          <div className="rail-logo" style={{ width: 40, height: 40 }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Welcome to Pilos
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              The visual layer for Claude Code · 3 quick steps
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <div className="onb-steps">
          {STEPS.map((s, i) => {
            const n = i + 1
            const done = n < effectiveStep
            const active = n === effectiveStep
            return (
              <div
                key={s}
                style={{ display: 'contents' }}
              >
                <div className={`onb-step${done ? ' done' : ''}${active ? ' active' : ''}`}>
                  <div className="num">
                    {done ? <Icon icon="lucide:check" className="text-[14px]" /> : n}
                  </div>
                  <div className="lbl">{s}</div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`onb-line${done ? ' done' : ''}`} />
                )}
              </div>
            )
          })}
        </div>

        <div className="divider" />

        {/* Body */}
        {effectiveStep === 1 && <StepInstallCli />}
        {effectiveStep === 2 && <StepAuth />}
        {effectiveStep === 3 && <StepReady />}

        {/* Footer */}
        <div className="row" style={{ gap: 10, marginTop: 22 }}>
          {effectiveStep > 1 && (
            <button
              className="btn ghost"
              onClick={() => setManualStep(effectiveStep - 1)}
            >
              Back
            </button>
          )}
          <span style={{ marginLeft: 'auto' }} />
          <button
            className="btn primary"
            disabled={!canContinue && !isLast}
            onClick={() => {
              if (isLast) {
                // Setup is auto-handled by the store reaching 'ready'.
                // This button is a no-op in last step.
                return
              }
              if (canContinue) setManualStep(effectiveStep + 1)
            }}
          >
            {isLast ? 'Enter Pilos' : 'Continue'}
            <Icon icon="lucide:arrow-right" className="text-[15px]" />
          </button>
        </div>
      </div>
    </div>
  )
}
