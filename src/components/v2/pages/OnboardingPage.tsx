import { Icon } from '../../common/Icon'
import { useAppStore } from '../../../store/useAppStore'
import type { DependencyName } from '../../../types'

function DependencyRow({ name, label, icon }: { name: DependencyName; label: string; icon: string }) {
  const dependencyResult = useAppStore((s) => s.dependencyResult)
  const browseForBinary = useAppStore((s) => s.browseForBinary)

  const dep = dependencyResult?.[name]
  const status = dep?.status || 'checking'
  const version = dep?.version

  return (
    <div className="flex items-center justify-between p-3 bg-pilos-card border border-pilos-border rounded-lg">
      <div className="flex items-center gap-3">
        <Icon icon={icon} className="text-lg" />
        <div>
          <span className="text-sm font-medium text-white">{label}</span>
          {version && <span className="text-[10px] text-zinc-500 ml-2">v{version}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status === 'checking' && (
          <div className="w-4 h-4 border-2 border-pilos-blue border-t-transparent rounded-full animate-spin" />
        )}
        {status === 'found' && (
          <Icon icon="lucide:check-circle-2" className="text-emerald-500" />
        )}
        {status === 'not_found' && (
          <button
            onClick={() => browseForBinary(name)}
            className="px-3 py-1 text-xs font-medium text-pilos-blue hover:bg-blue-500/10 rounded-lg transition-colors"
          >
            Locate
          </button>
        )}
        {status === 'error' && (
          <Icon icon="lucide:x-circle" className="text-red-500" />
        )}
      </div>
    </div>
  )
}

function CliSetupCard() {
  const cliStatus = useAppStore((s) => s.cliStatus)
  const cliVersion = useAppStore((s) => s.cliVersion)
  const installCli = useAppStore((s) => s.installCli)
  const loginCli = useAppStore((s) => s.loginCli)
  const cliInstallLog = useAppStore((s) => s.cliInstallLog)

  return (
    <div className="p-6 bg-pilos-card border border-pilos-border rounded-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center">
          <Icon icon="lucide:terminal" className="text-white text-xl" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Claude CLI</h3>
          <p className="text-[10px] text-zinc-500">
            {cliVersion ? `v${cliVersion}` : 'Required for agent communication'}
          </p>
        </div>
      </div>

      {cliStatus === 'ready' && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <Icon icon="lucide:check-circle-2" className="text-emerald-400" />
          <span className="text-xs font-medium text-emerald-400">Authenticated and ready</span>
        </div>
      )}

      {cliStatus === 'missing' && (
        <button
          onClick={installCli}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all"
        >
          Install Claude CLI
        </button>
      )}

      {cliStatus === 'installing' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-pilos-blue border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-zinc-400">Installing...</span>
          </div>
          {cliInstallLog && (
            <pre className="text-[10px] text-zinc-600 font-mono bg-black/30 p-2 rounded max-h-20 overflow-y-auto custom-scrollbar">
              {cliInstallLog}
            </pre>
          )}
        </div>
      )}

      {cliStatus === 'needs_login' && (
        <button
          onClick={loginCli}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all"
        >
          Sign In to Claude
        </button>
      )}

      {cliStatus === 'logging_in' && (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-pilos-blue border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-400">Opening browser for sign in...</span>
        </div>
      )}

      {cliStatus === 'install_failed' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <Icon icon="lucide:x-circle" className="text-red-400" />
            <span className="text-xs font-medium text-red-400">Installation failed</span>
          </div>
          <button
            onClick={installCli}
            className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-lg transition-all"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

export default function OnboardingPage() {
  const setupStatus = useAppStore((s) => s.setupStatus)
  const dependencyResult = useAppStore((s) => s.dependencyResult)
  const checkDependencies = useAppStore((s) => s.checkDependencies)

  // Calculate progress
  const depsFound = dependencyResult?.allFound || false
  const cliReady = setupStatus === 'ready' || setupStatus === 'needs_login'
  const progress = depsFound ? (cliReady ? 80 : 50) : 20

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Progress bar header */}
      <div className="h-12 border-b border-pilos-border flex items-center px-6 flex-shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Setup Progress</span>
            <div className="w-40 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-pilos-blue rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-600">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto py-12 px-6">
          {/* Hero */}
          <div className="text-center mb-12">
            <div className="inline-flex px-3 py-1 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded-full border border-blue-500/20 uppercase tracking-widest mb-4">
              Environment Setup
            </div>
            <h1 className="text-4xl font-extrabold text-white mb-3">
              Ignite your agent swarm
            </h1>
            <p className="text-sm text-zinc-400 max-w-md mx-auto">
              Follow these steps to configure your local environment and start running AI agents.
            </p>
          </div>

          {/* Step 1: System Requirements */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-6 h-6 bg-pilos-blue rounded-full flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">1</span>
              </div>
              <h2 className="text-lg font-bold text-white">System Requirements</h2>
            </div>
            <div className="space-y-2">
              <DependencyRow name="node" label="Node.js" icon="logos:nodejs-icon" />
              <DependencyRow name="git" label="Git" icon="logos:git-icon" />
            </div>
            {dependencyResult && !dependencyResult.allFound && (
              <button
                onClick={checkDependencies}
                className="mt-3 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-lg transition-all"
              >
                Re-check Dependencies
              </button>
            )}
          </div>

          {/* Step 2: Claude CLI */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${depsFound ? 'bg-pilos-blue' : 'bg-zinc-700'}`}>
                <span className="text-[10px] font-bold text-white">2</span>
              </div>
              <h2 className={`text-lg font-bold ${depsFound ? 'text-white' : 'text-zinc-600'}`}>Claude CLI</h2>
            </div>
            {depsFound ? (
              <CliSetupCard />
            ) : (
              <p className="text-xs text-zinc-600 pl-9">Complete step 1 first</p>
            )}
          </div>

          {/* Step 3: Ready */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${setupStatus === 'ready' ? 'bg-pilos-green' : 'bg-zinc-700'}`}>
                <span className="text-[10px] font-bold text-white">3</span>
              </div>
              <h2 className={`text-lg font-bold ${setupStatus === 'ready' ? 'text-white' : 'text-zinc-600'}`}>Ready to Go</h2>
            </div>
            {setupStatus === 'ready' && (
              <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center">
                <Icon icon="lucide:check-circle-2" className="text-emerald-400 text-3xl" />
                <h3 className="text-sm font-bold text-white mt-3 mb-1">All systems operational</h3>
                <p className="text-xs text-zinc-400 mb-4">Your environment is configured and ready.</p>
                <p className="text-[10px] text-zinc-600">The dashboard will load automatically...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
