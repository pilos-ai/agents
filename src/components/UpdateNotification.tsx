import { useEffect, useState } from 'react'
import { api } from '../api'
import type { UpdateStatusEvent } from '../types'

export function UpdateNotification() {
  const [update, setUpdate] = useState<UpdateStatusEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsub = api.updater.onStatus((data: UpdateStatusEvent) => {
      setUpdate(data)
      if (data.status === 'ready') setDismissed(false)
    })
    return unsub
  }, [])

  if (dismissed || !update) return null
  if (update.status === 'checking' || update.status === 'up-to-date' || update.status === 'error') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-4 animate-in slide-in-from-bottom-2">
      {update.status === 'available' && (
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
          <p className="text-sm text-neutral-300">
            Update <span className="font-medium text-neutral-200">v{update.version}</span> is downloading...
          </p>
        </div>
      )}

      {update.status === 'downloading' && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0 animate-pulse" />
            <p className="text-sm text-neutral-300">Downloading update... {update.percent}%</p>
          </div>
          <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${update.percent || 0}%` }}
            />
          </div>
        </div>
      )}

      {update.status === 'ready' && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <p className="text-sm text-neutral-300">
              <span className="font-medium text-neutral-200">v{update.version}</span> ready to install
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setDismissed(true)}
              className="px-2.5 py-1 text-xs text-neutral-400 hover:text-neutral-300 transition-colors"
            >
              Later
            </button>
            <button
              onClick={() => api.updater.install()}
              className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Restart
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
