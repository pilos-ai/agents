import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api'
import type { DetectedPluginDto, InstalledPluginDto } from '../../types'

interface Props {
  projectPath: string
}

type ActionState = 'idle' | 'installing' | 'uninstalling'

export function PluginsSection({ projectPath }: Props) {
  const [recommended, setRecommended] = useState<DetectedPluginDto[]>([])
  const [installed, setInstalled] = useState<InstalledPluginDto[]>([])
  const [loading, setLoading] = useState(true)
  const [actionById, setActionById] = useState<Record<string, ActionState>>({})
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectPath) return
    setLoading(true)
    setError(null)
    try {
      const [rec, inst] = await Promise.all([
        api.plugins.detect(projectPath),
        api.plugins.listInstalled(projectPath),
      ])
      setRecommended(rec)
      setInstalled(inst)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins')
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    refresh()
  }, [refresh])

  const installedNames = new Set(installed.map((p) => p.name))

  const handleInstall = async (rec: DetectedPluginDto) => {
    setActionById((s) => ({ ...s, [rec.plugin.id]: 'installing' }))
    try {
      const result = await api.plugins.install(
        projectPath,
        rec.plugin.name,
        rec.plugin.marketplace,
      )
      if (!result.ok) {
        setError(result.stderr || result.error || 'Install failed')
      } else {
        await refresh()
      }
    } finally {
      setActionById((s) => ({ ...s, [rec.plugin.id]: 'idle' }))
    }
  }

  const handleUninstall = async (name: string, id?: string) => {
    const key = id || name
    setActionById((s) => ({ ...s, [key]: 'uninstalling' }))
    try {
      const result = await api.plugins.uninstall(projectPath, name)
      if (!result.ok) {
        setError(result.stderr || result.error || 'Uninstall failed')
      } else {
        await refresh()
      }
    } finally {
      setActionById((s) => ({ ...s, [key]: 'idle' }))
    }
  }

  const handleInstallBaseline = async () => {
    const missing = recommended.filter(
      (r) => r.plugin.baseline && !installedNames.has(r.plugin.name),
    )
    for (const rec of missing) {
      await handleInstall(rec)
    }
  }

  // Split recommended into baseline and detected
  const baselineRecs = recommended.filter((r) => r.plugin.baseline)
  const detectedRecs = recommended.filter((r) => !r.plugin.baseline)

  // Installed plugins NOT in our catalog (user added them directly)
  const catalogNames = new Set(recommended.map((r) => r.plugin.name))
  const foreignInstalled = installed.filter((p) => !catalogNames.has(p.name))

  const anyBaselineMissing = baselineRecs.some((r) => !installedNames.has(r.plugin.name))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Plugins</h2>
        <p className="text-sm text-neutral-400 mt-1">
          Claude Code plugins installed at the project scope. We've curated a set that work well
          with Pilos workflows.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-200 px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : (
        <>
          {/* Baseline */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-white">Recommended for every project</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Quality-of-life commands that speed up common tasks.
                </p>
              </div>
              {anyBaselineMissing && (
                <button
                  onClick={handleInstallBaseline}
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                >
                  Install all
                </button>
              )}
            </div>
            <div className="space-y-2">
              {baselineRecs.map((rec) => (
                <PluginRow
                  key={rec.plugin.id}
                  rec={rec}
                  installed={installedNames.has(rec.plugin.name)}
                  state={actionById[rec.plugin.id] || 'idle'}
                  onInstall={() => handleInstall(rec)}
                  onUninstall={() => handleUninstall(rec.plugin.name, rec.plugin.id)}
                />
              ))}
            </div>
          </section>

          {/* Detected by project */}
          {detectedRecs.length > 0 && (
            <section>
              <div className="mb-3">
                <h3 className="text-sm font-medium text-white">Matches for this project</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Detected based on files in your project.
                </p>
              </div>
              <div className="space-y-2">
                {detectedRecs.map((rec) => (
                  <PluginRow
                    key={rec.plugin.id}
                    rec={rec}
                    installed={installedNames.has(rec.plugin.name)}
                    state={actionById[rec.plugin.id] || 'idle'}
                    onInstall={() => handleInstall(rec)}
                    onUninstall={() => handleUninstall(rec.plugin.name, rec.plugin.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Other installed */}
          {foreignInstalled.length > 0 && (
            <section>
              <div className="mb-3">
                <h3 className="text-sm font-medium text-white">Other installed</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Plugins installed outside our catalog.
                </p>
              </div>
              <div className="space-y-2">
                {foreignInstalled.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-900"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-200 truncate">{p.name}</p>
                      {p.marketplace && (
                        <p className="text-[11px] text-neutral-500 truncate">{p.marketplace}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleUninstall(p.name)}
                      disabled={actionById[p.name] === 'uninstalling'}
                      className="text-xs px-2.5 py-1 rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50"
                    >
                      {actionById[p.name] === 'uninstalling' ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function PluginRow({
  rec,
  installed,
  state,
  onInstall,
  onUninstall,
}: {
  rec: DetectedPluginDto
  installed: boolean
  state: ActionState
  onInstall: () => void
  onUninstall: () => void
}) {
  const working = state !== 'idle'
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-3 rounded-lg border border-neutral-800 bg-neutral-900">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-neutral-100 truncate">{rec.plugin.name}</p>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
            {rec.plugin.category}
          </span>
        </div>
        <p className="text-xs text-neutral-400 mt-1">{rec.plugin.description}</p>
        <p className="text-[11px] text-neutral-500 mt-1 italic">{rec.reason}</p>
      </div>
      {installed ? (
        <button
          onClick={onUninstall}
          disabled={working}
          className="text-xs px-2.5 py-1 rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {state === 'uninstalling' ? 'Removing…' : 'Installed · Remove'}
        </button>
      ) : (
        <button
          onClick={onInstall}
          disabled={working}
          className="text-xs px-2.5 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {state === 'installing' ? 'Installing…' : 'Install'}
        </button>
      )}
    </div>
  )
}
