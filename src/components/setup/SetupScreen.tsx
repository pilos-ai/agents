import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { api } from '../../api'
import type { CliInstallOutput } from '../../types'

const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent)

const installCommand = isWindows
  ? 'irm https://claude.ai/install.ps1 | iex'
  : 'curl -fsSL https://claude.ai/install.sh | bash'

export function SetupScreen() {
  const cliStatus = useAppStore((s) => s.cliStatus)
  const cliVersion = useAppStore((s) => s.cliVersion)
  const cliError = useAppStore((s) => s.cliError)
  const cliInstallLog = useAppStore((s) => s.cliInstallLog)
  const checkCli = useAppStore((s) => s.checkCli)
  const installCli = useAppStore((s) => s.installCli)
  const loginCli = useAppStore((s) => s.loginCli)
  const appendCliInstallLog = useAppStore((s) => s.appendCliInstallLog)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const unsub = api.cli.onInstallOutput((data: CliInstallOutput) => {
      appendCliInstallLog(data.data)
    })
    return unsub
  }, [appendCliInstallLog])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [cliInstallLog])

  const handleCopyInstall = () => {
    navigator.clipboard.writeText(installCommand)
  }

  // Checking state
  if (cliStatus === 'checking') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-neutral-800/50 mb-5">
            <svg className="w-7 h-7 text-neutral-400 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-sm text-neutral-400">Checking Claude CLI...</p>
        </div>
      </div>
    )
  }

  // Installing state
  if (cliStatus === 'installing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="max-w-lg w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-500/10 mb-5">
              <svg className="w-7 h-7 text-blue-400 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-neutral-200 mb-1">Installing Claude CLI...</h2>
            <p className="text-sm text-neutral-500">This may take a minute</p>
          </div>
          <pre
            ref={logRef}
            className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs text-neutral-400 font-mono h-48 overflow-y-auto whitespace-pre-wrap"
          >
            {cliInstallLog || 'Starting installation...'}
          </pre>
        </div>
      </div>
    )
  }

  // Needs login state
  if (cliStatus === 'needs_login' || cliStatus === 'logging_in') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            {/* Checkmark for CLI installed */}
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-500/10 mb-5">
              {cliStatus === 'logging_in' ? (
                <svg className="w-7 h-7 text-emerald-400 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <h2 className="text-lg font-semibold text-neutral-200">CLI Installed</h2>
              {cliVersion && (
                <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">{cliVersion}</span>
              )}
            </div>
            <p className="text-sm text-neutral-500 leading-relaxed">
              {cliStatus === 'logging_in'
                ? 'Signing in to Claude... Follow the prompts in your browser.'
                : 'Sign in to your Anthropic account to get started.'
              }
            </p>
          </div>

          <button
            onClick={loginCli}
            disabled={cliStatus === 'logging_in'}
            className={`w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors mb-4 ${
              cliStatus === 'logging_in'
                ? 'bg-neutral-700 text-neutral-400 cursor-wait'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {cliStatus === 'logging_in' ? 'Signing in...' : 'Sign in to Claude'}
          </button>

          <button
            onClick={checkCli}
            className="w-full px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm rounded-lg transition-colors"
          >
            Retry Check
          </button>
        </div>
      </div>
    )
  }

  // Missing / Error / Install Failed
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-neutral-800/50 mb-5">
            <svg className="w-7 h-7 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-neutral-200 mb-2">Claude CLI Required</h2>
          <p className="text-sm text-neutral-500 leading-relaxed">
            Pilos Agents needs the Claude CLI to communicate with Claude.
            {cliStatus === 'install_failed' && (
              <span className="block mt-1 text-red-400">Installation failed. You can try again or install manually.</span>
            )}
          </p>
        </div>

        <button
          onClick={installCli}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors mb-4"
        >
          Install Claude CLI
        </button>

        {/* Manual install command */}
        <div className="mb-4 space-y-3">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Or install manually</p>
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            <code className="flex-1 px-4 py-2.5 text-sm text-neutral-300 font-mono">
              {installCommand}
            </code>
            <button
              onClick={handleCopyInstall}
              className="px-3 py-2.5 text-neutral-500 hover:text-neutral-300 transition-colors border-l border-neutral-800"
              title="Copy to clipboard"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Install log if failed */}
        {cliStatus === 'install_failed' && cliInstallLog && (
          <pre className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs text-neutral-500 font-mono h-32 overflow-y-auto whitespace-pre-wrap mb-4">
            {cliInstallLog}
          </pre>
        )}

        {/* Error detail */}
        {cliError && cliStatus === 'error' && (
          <p className="text-xs text-neutral-600 mb-4 break-all">Error: {cliError}</p>
        )}

        {/* Retry button */}
        <button
          onClick={checkCli}
          className="w-full px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm rounded-lg transition-colors"
        >
          Retry Check
        </button>
      </div>
    </div>
  )
}
