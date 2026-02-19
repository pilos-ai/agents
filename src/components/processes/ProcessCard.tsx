import { api } from '../../api'
import type { TrackedProcess } from '../../types'

interface Props {
  process: TrackedProcess
}

export function ProcessCard({ process: proc }: Props) {
  const elapsed = Math.floor((Date.now() - proc.startedAt) / 1000)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60

  const statusColor = {
    running: 'bg-green-400',
    stopped: 'bg-yellow-400',
    exited: 'bg-neutral-500',
  }[proc.status]

  return (
    <div className="rounded-md border border-neutral-700/50 bg-neutral-800/30 p-2.5">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${statusColor} ${proc.status === 'running' ? 'animate-pulse' : ''}`} />
        <span className="text-xs text-neutral-400">PID {proc.pid}</span>
        <span className="text-xs text-neutral-600 ml-auto">
          {minutes > 0 ? `${minutes}m ` : ''}{seconds}s
        </span>
      </div>

      <p className="text-xs text-neutral-200 font-mono truncate mb-2">{proc.command}</p>

      {proc.status === 'running' && (
        <button
          onClick={() => api.processes.stop(proc.pid)}
          className="px-2 py-0.5 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-xs transition-colors"
        >
          Stop
        </button>
      )}
    </div>
  )
}
