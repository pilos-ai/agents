import { Icon } from '../../common/Icon'
import { StatusDot } from '../components/StatusDot'
import { useWorkflowStore } from '../../../store/useWorkflowStore'

const statusColors: Record<string, 'green' | 'orange' | 'blue' | 'gray'> = {
  idle: 'gray',
  running: 'orange',
  paused: 'gray',
  completed: 'green',
  failed: 'gray',
}

const statusLabels: Record<string, string> = {
  idle: 'Idle',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
}

export function WorkflowExecutionBar() {
  const execution = useWorkflowStore((s) => s.execution)
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow)
  const startExecution = useWorkflowStore((s) => s.startExecution)
  const stopExecution = useWorkflowStore((s) => s.stopExecution)
  const resetExecution = useWorkflowStore((s) => s.resetExecution)
  const showLogs = useWorkflowStore((s) => s.showLogs)
  const setShowLogs = useWorkflowStore((s) => s.setShowLogs)

  const status = execution?.status || 'idle'
  const isRunning = status === 'running'
  const isFinished = status === 'completed' || status === 'failed'

  const successCount = execution?.stepResults.filter((r) => r.status === 'completed').length || 0
  const totalSteps = execution?.totalSteps || 0
  const successRate = totalSteps > 0 ? Math.round((successCount / totalSteps) * 100) : 0

  return (
    <div className="border-t border-pilos-border flex-shrink-0 bg-pilos-bg">
      {/* Main bar */}
      <div className="flex items-center gap-3 px-4 h-12">
        {/* Status */}
        <div className="flex items-center gap-2 min-w-[120px]">
          <StatusDot color={statusColors[status]} pulse={isRunning} />
          <span className={`text-xs font-bold uppercase tracking-wider ${
            isRunning ? 'text-orange-400' : status === 'completed' ? 'text-emerald-400' : status === 'failed' ? 'text-red-400' : 'text-zinc-500'
          }`}>
            {statusLabels[status]}
          </span>
        </div>

        {/* Step progress */}
        {(isRunning || isFinished) && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">
              Step {execution?.currentStep || 0} of {totalSteps}:
            </span>
            {execution?.currentNodeId && (
              <span className="text-xs text-white font-medium">
                {useWorkflowStore.getState().nodes.find((n) => n.id === execution.currentNodeId)?.data.label || ''}
              </span>
            )}
          </div>
        )}

        {/* Success rate */}
        {isFinished && (
          <div className="flex items-center gap-1.5 ml-auto mr-3">
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Success</span>
            <span className={`text-xs font-bold ${successRate === 100 ? 'text-emerald-400' : successRate > 50 ? 'text-orange-400' : 'text-red-400'}`}>
              {successRate}%
            </span>
          </div>
        )}

        {/* Spacer */}
        {!isFinished && <div className="flex-1" />}

        {/* Execution timer */}
        {isRunning && execution?.startedAt && (
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Icon icon="lucide:timer" className="text-[10px]" />
            <ExecutionTimer startedAt={execution.startedAt} />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={saveWorkflow}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
          >
            <Icon icon="lucide:save" className="text-[10px]" />
            Save
          </button>

          {!isRunning && (
            <>
              {isFinished && (
                <button
                  onClick={resetExecution}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                >
                  <Icon icon="lucide:rotate-ccw" className="text-[10px]" />
                  Reset
                </button>
              )}
              <button
                onClick={startExecution}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
              >
                <Icon icon="lucide:flask-conical" className="text-[10px]" />
                Test Run
              </button>
              <button
                onClick={startExecution}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all"
              >
                <Icon icon="lucide:play" className="text-[10px]" />
                Run Workflow
              </button>
            </>
          )}

          {isRunning && (
            <button
              onClick={stopExecution}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg hover:bg-red-600/30 transition-colors"
            >
              <Icon icon="lucide:square" className="text-[10px]" />
              Stop
            </button>
          )}

          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              showLogs ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon icon="lucide:scroll-text" className="text-[10px]" />
          </button>
        </div>
      </div>

      {/* Execution log panel */}
      {showLogs && execution && (
        <div className="border-t border-pilos-border bg-pilos-card max-h-[200px] overflow-y-auto custom-scrollbar">
          <div className="px-4 py-2 border-b border-pilos-border flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Execution Log</span>
            <span className="text-[10px] text-zinc-700">{execution.logs.length} entries</span>
          </div>
          <div className="px-4 py-2 space-y-0.5 font-mono text-[11px]">
            {execution.logs.map((log, i) => (
              <div key={i} className={`leading-relaxed ${
                log.includes('[WARN]') ? 'text-orange-400/80'
                : log.includes('[ERROR]') ? 'text-red-400/80'
                : 'text-zinc-500'
              }`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ExecutionTimer({ startedAt }: { startedAt: string }) {
  // Simple static display — in production this would use an interval
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return (
    <span className="text-[10px] font-mono">
      {String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s
    </span>
  )
}
