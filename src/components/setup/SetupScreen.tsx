import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { api } from '../../api'
import type { CliInstallOutput, DependencyInfo, DependencyInstallInfo, DependencyName } from '../../types'

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="px-2 py-1 text-neutral-500 hover:text-neutral-300 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}

function DependencyRow({
  label,
  info,
  installInfo,
  onBrowse,
  onInstall,
  children,
}: {
  label: string
  info: DependencyInfo | undefined
  installInfo?: DependencyInstallInfo | null
  onBrowse?: () => void
  onInstall?: () => void
  children?: React.ReactNode
}) {
  const status = info?.status ?? 'checking'

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-neutral-900/50 border border-neutral-800/50">
      <div className="mt-0.5 flex-shrink-0">
        {status === 'checking' && <SpinnerIcon className="w-5 h-5 text-neutral-400 animate-spin" />}
        {status === 'found' && <CheckIcon className="w-5 h-5 text-emerald-400" />}
        {status === 'not_found' && <XIcon className="w-5 h-5 text-red-400" />}
        {status === 'error' && <XIcon className="w-5 h-5 text-amber-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">{label}</span>
          {info?.version && (
            <span className="text-xs text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded font-mono">
              {info.version}
            </span>
          )}
        </div>

        {status === 'not_found' && installInfo && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-neutral-500">{installInfo.instructions}</p>
            {installInfo.command && (
              <div className="flex items-center bg-neutral-950 rounded overflow-hidden border border-neutral-800/50">
                <code className="flex-1 px-2.5 py-1.5 text-xs text-neutral-400 font-mono truncate">
                  {installInfo.command}
                </code>
                <CopyButton text={installInfo.command} />
              </div>
            )}
            <div className="flex items-center gap-2">
              {onInstall && (
                <button
                  onClick={onInstall}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
                >
                  Install
                </button>
              )}
              <button
                onClick={() => api.deps.openInstallPage(info!.name)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Download
              </button>
              {onBrowse && (
                <button
                  onClick={onBrowse}
                  className="px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors"
                >
                  Browse...
                </button>
              )}
            </div>
          </div>
        )}

        {status === 'error' && info?.error && (
          <p className="text-xs text-amber-500 mt-1">{info.error}</p>
        )}

        {children}
      </div>
    </div>
  )
}

export function SetupScreen() {
  const setupStatus = useAppStore((s) => s.setupStatus)
  const dependencyResult = useAppStore((s) => s.dependencyResult)
  const cliVersion = useAppStore((s) => s.cliVersion)
  const cliError = useAppStore((s) => s.cliError)
  const cliInstallLog = useAppStore((s) => s.cliInstallLog)
  const cliLoginLog = useAppStore((s) => s.cliLoginLog)
  const checkDependencies = useAppStore((s) => s.checkDependencies)
  const browseForBinary = useAppStore((s) => s.browseForBinary)
  const installCli = useAppStore((s) => s.installCli)
  const loginCli = useAppStore((s) => s.loginCli)
  const appendCliInstallLog = useAppStore((s) => s.appendCliInstallLog)
  const appendCliLoginLog = useAppStore((s) => s.appendCliLoginLog)
  const logRef = useRef<HTMLPreElement>(null)
  const loginLogRef = useRef<HTMLPreElement>(null)

  const [installInfoMap, setInstallInfoMap] = useState<Record<string, DependencyInstallInfo>>({})

  // Subscribe to CLI install output
  useEffect(() => {
    const unsub = api.cli.onInstallOutput((data: CliInstallOutput) => {
      appendCliInstallLog(data.data)
    })
    return unsub
  }, [appendCliInstallLog])

  // Subscribe to CLI login output
  useEffect(() => {
    const unsub = api.cli.onLoginOutput((data: string) => {
      appendCliLoginLog(data)
    })
    return unsub
  }, [appendCliLoginLog])

  // Auto-scroll install log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [cliInstallLog])

  // Auto-scroll login log
  useEffect(() => {
    if (loginLogRef.current) loginLogRef.current.scrollTop = loginLogRef.current.scrollHeight
  }, [cliLoginLog])

  // Fetch install info for missing dependencies
  useEffect(() => {
    if (!dependencyResult) return
    const missing: DependencyName[] = []
    if (dependencyResult.git.status === 'not_found') missing.push('git')
    if (dependencyResult.node.status === 'not_found') missing.push('node')
    if (dependencyResult.claude.status === 'not_found') missing.push('claude')
    if (missing.length === 0) return

    Promise.all(
      missing.map(async (tool) => {
        const info = await api.deps.getInstallInfo(tool)
        return [tool, info] as const
      })
    ).then((entries) => {
      setInstallInfoMap(Object.fromEntries(entries))
    })
  }, [dependencyResult])

  // ── Checking state ──
  if (setupStatus === 'checking_deps' || setupStatus === 'checking_cli') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-neutral-800/50 mb-5">
            <SpinnerIcon className="w-7 h-7 text-neutral-400 animate-spin" />
          </div>
          <p className="text-sm text-neutral-400">
            {setupStatus === 'checking_deps' ? 'Checking system requirements...' : 'Verifying Claude CLI...'}
          </p>
        </div>
      </div>
    )
  }

  // ── Installing Claude CLI ──
  if (setupStatus === 'installing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="max-w-lg w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-500/10 mb-5">
              <SpinnerIcon className="w-7 h-7 text-blue-400 animate-spin" />
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

  // ── Needs login ──
  if (setupStatus === 'needs_login' || setupStatus === 'logging_in') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-500/10 mb-5">
              {setupStatus === 'logging_in' ? (
                <SpinnerIcon className="w-7 h-7 text-emerald-400 animate-spin" />
              ) : (
                <CheckIcon className="w-7 h-7 text-emerald-400" />
              )}
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <h2 className="text-lg font-semibold text-neutral-200">All Tools Installed</h2>
              {cliVersion && (
                <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">{cliVersion}</span>
              )}
            </div>
            <p className="text-sm text-neutral-500 leading-relaxed">
              {setupStatus === 'logging_in'
                ? 'Signing in to Claude... Follow the prompts in your browser.'
                : 'Sign in to your Anthropic account to get started.'}
            </p>
          </div>

          {/* Dependencies summary (all green) */}
          <div className="space-y-1.5 mb-6">
            <DependencyRow label="Git" info={dependencyResult?.git} />
            <DependencyRow label="Node.js" info={dependencyResult?.node} />
            <DependencyRow label="Claude CLI" info={dependencyResult?.claude} />
          </div>

          <button
            onClick={loginCli}
            disabled={setupStatus === 'logging_in'}
            className={`w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors mb-4 ${
              setupStatus === 'logging_in'
                ? 'bg-neutral-700 text-neutral-400 cursor-wait'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {setupStatus === 'logging_in' ? 'Signing in...' : 'Sign in to Claude'}
          </button>

          {cliLoginLog && (
            <pre
              ref={loginLogRef}
              className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs text-neutral-400 font-mono h-32 overflow-y-auto whitespace-pre-wrap mb-4"
            >
              {cliLoginLog}
            </pre>
          )}

          <button
            onClick={checkDependencies}
            className="w-full px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm rounded-lg transition-colors"
          >
            Retry Check
          </button>
        </div>
      </div>
    )
  }

  // ── Dependencies missing / Error / Install failed ──
  const git = dependencyResult?.git
  const node = dependencyResult?.node
  const claude = dependencyResult?.claude

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-neutral-800/50 mb-5">
            <svg className="w-7 h-7 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-neutral-200 mb-2">System Requirements</h2>
          <p className="text-sm text-neutral-500 leading-relaxed">
            Pilos Agents needs the following tools to work properly.
            {setupStatus === 'install_failed' && (
              <span className="block mt-1 text-red-400">Installation failed. You can try again or install manually.</span>
            )}
          </p>
        </div>

        <div className="space-y-2 mb-6">
          <DependencyRow
            label="Git"
            info={git}
            installInfo={installInfoMap.git}
            onBrowse={() => browseForBinary('git')}
          />
          <DependencyRow
            label="Node.js"
            info={node}
            installInfo={installInfoMap.node}
            onBrowse={() => browseForBinary('node')}
          />
          <DependencyRow
            label="Claude CLI"
            info={claude}
            installInfo={installInfoMap.claude}
            onBrowse={() => browseForBinary('claude')}
            onInstall={installCli}
          >
            {/* Install log if failed */}
            {setupStatus === 'install_failed' && cliInstallLog && (
              <pre
                ref={logRef}
                className="bg-neutral-950 border border-neutral-800/50 rounded p-2 text-xs text-neutral-500 font-mono h-28 overflow-y-auto whitespace-pre-wrap mt-2"
              >
                {cliInstallLog}
              </pre>
            )}
          </DependencyRow>
        </div>

        {/* Error detail */}
        {cliError && setupStatus === 'error' && (
          <p className="text-xs text-neutral-600 mb-4 break-all">Error: {cliError}</p>
        )}

        <button
          onClick={checkDependencies}
          className="w-full px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm rounded-lg transition-colors"
        >
          Retry Check
        </button>
      </div>
    </div>
  )
}
