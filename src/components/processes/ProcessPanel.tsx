import { useEffect, useState } from 'react'
import { ProcessCard } from './ProcessCard'
import { api } from '../../api'
import type { TrackedProcess } from '../../types'

export function ProcessPanel() {
  const [processes, setProcesses] = useState<TrackedProcess[]>([])

  useEffect(() => {
    // Load initial
    api.processes.list().then(setProcesses)

    // Subscribe to updates
    const unsub = api.processes.onUpdate((data) => {
      setProcesses(data as TrackedProcess[])
    })

    return unsub
  }, [])

  if (processes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-600 text-xs">
        No tracked processes
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      {processes.map((proc) => (
        <ProcessCard key={proc.pid} process={proc} />
      ))}
    </div>
  )
}
