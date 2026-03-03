import { useState, useMemo } from 'react'
import { Icon } from '../../common/Icon'
import { SmartDataRenderer } from '../components/SmartDataRenderer'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { useTaskStore } from '../../../store/useTaskStore'
import type { WorkflowStepResult } from '../../../types/workflow'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}m`
}

// ── Main Component ──

interface Props {
  onClose: () => void
}

export function WorkflowResultsCanvas({ onClose }: Props) {
  const execution = useWorkflowStore((s) => s.execution)
  const nodes = useWorkflowStore((s) => s.nodes)
  const editingTaskId = useWorkflowStore((s) => s.editingTaskId)
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === editingTaskId))
  const [showAllSteps, setShowAllSteps] = useState(false)

  // Use live execution stepResults, or fall back to the last persisted run
  const stepResults: WorkflowStepResult[] = useMemo(() => {
    if (execution?.stepResults?.length) return execution.stepResults
    // Fall back to persisted run data (most recent run)
    const latestRun = task?.runs?.[0]
    return latestRun?.stepResults || []
  }, [execution?.stepResults, task?.runs])

  // Use workflow nodes for labels; fall back to persisted task workflow nodes
  const nodeList = useMemo(() => {
    if (nodes.length > 0) return nodes
    return task?.workflow?.nodes || []
  }, [nodes, task?.workflow?.nodes])

  // Find the primary result to display:
  // 1. results_display node output
  // 2. Last meaningful step output (ai_prompt, mcp_tool — skip start/end/note)
  const resultData = useMemo(() => {
    if (!stepResults.length) return null

    const nodeMap = new Map(nodeList.map((n) => [n.id, n.data]))

    // Look for results_display node output
    for (const r of [...stepResults].reverse()) {
      const nodeData = nodeMap.get(r.nodeId)
      if (nodeData?.type === 'results_display' && r.status === 'completed' && r.output != null) {
        return { output: r.output, title: nodeData.displayTitle || nodeData.label, nodeId: r.nodeId }
      }
    }

    // Fallback: last completed step with output (skip start/end/note/variable)
    const skipTypes = new Set(['start', 'end', 'note', 'variable', 'delay'])
    for (const r of [...stepResults].reverse()) {
      const nodeData = nodeMap.get(r.nodeId)
      if (r.status === 'completed' && r.output != null && nodeData && !skipTypes.has(nodeData.type)) {
        return { output: r.output, title: nodeData.label, nodeId: r.nodeId }
      }
    }

    return null
  }, [stepResults, nodeList])

  const totalDuration = stepResults.reduce((sum, r) => sum + r.duration, 0)
  const completedCount = stepResults.filter((r) => r.status === 'completed').length
  const failedCount = stepResults.filter((r) => r.status === 'failed').length
  const hasFailures = failedCount > 0

  // Collect failed step details for error display
  const failedSteps = useMemo(() => {
    if (!stepResults.length) return []
    const nodeMap = new Map(nodeList.map((n) => [n.id, n.data]))
    return stepResults
      .filter((r) => r.status === 'failed')
      .map((r) => ({ ...r, label: nodeMap.get(r.nodeId)?.label || r.nodeId }))
  }, [stepResults, nodeList])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-pilos-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-pilos-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
          >
            <Icon icon="lucide:arrow-left" className="text-sm" />
            Back to Canvas
          </button>
          <div className="w-px h-5 bg-pilos-border" />
          <div className="flex items-center gap-2">
            <Icon icon="lucide:layout-dashboard" className="text-cyan-400 text-base" />
            <h2 className="text-sm font-bold text-white">
              {resultData?.title || 'Results'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats pills */}
          {stepResults.length > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <Icon icon={hasFailures ? 'lucide:alert-circle' : 'lucide:check-circle-2'} className={`text-xs ${hasFailures ? 'text-orange-400' : 'text-emerald-400'}`} />
                <span className="text-xs text-zinc-400">
                  {completedCount}/{completedCount + failedCount} steps
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-500">
                <Icon icon="lucide:timer" className="text-[10px]" />
                <span className="text-xs font-mono">{formatDuration(totalDuration)}</span>
              </div>
            </>
          )}
          <button
            onClick={() => setShowAllSteps(!showAllSteps)}
            className={`text-[10px] px-2.5 py-1 rounded-md transition-colors ${
              showAllSteps ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {showAllSteps ? 'Hide steps' : 'Show all steps'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!resultData && !hasFailures ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Icon icon="lucide:layout-dashboard" className="text-zinc-800 text-4xl mb-3" />
            <p className="text-sm text-zinc-500 font-medium mb-1">No results yet</p>
            <p className="text-xs text-zinc-700">Run the workflow to see data here</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-8 py-8">
            {/* Error banner */}
            {hasFailures && (
              <div className="mb-6 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Icon icon="lucide:alert-triangle" className="text-red-400 text-sm" />
                  <span className="text-sm font-bold text-red-400">
                    {failedCount} step{failedCount !== 1 ? 's' : ''} failed
                  </span>
                </div>
                <div className="space-y-1.5 ml-6">
                  {failedSteps.map((r) => (
                    <div key={r.nodeId} className="text-xs text-red-300/80">
                      <span className="font-medium text-red-300">{r.label}:</span>{' '}
                      {r.error || 'Unknown error'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Primary result */}
            {resultData && (
              <SmartDataRenderer data={resultData.output} />
            )}

            {/* All steps (collapsible) */}
            {showAllSteps && stepResults.length > 0 && (
              <div className="mt-8 pt-6 border-t border-pilos-border">
                <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4">All Steps</h3>
                <div className="space-y-3">
                  {stepResults.map((r) => {
                    const nodeData = nodeList.find((n) => n.id === r.nodeId)?.data
                    const isOk = r.status === 'completed'
                    const isFailed = r.status === 'failed'
                    return (
                      <StepRow
                        key={`${r.nodeId}-${r.startedAt}`}
                        label={nodeData?.label || r.nodeId}
                        nodeType={nodeData?.type}
                        duration={r.duration}
                        isOk={isOk}
                        isFailed={isFailed}
                        error={r.error}
                        output={r.output}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Collapsible Step Row (for "Show all steps") ──

function StepRow({ label, nodeType, duration, isOk, isFailed, error, output }: {
  label: string; nodeType?: string; duration: number; isOk: boolean; isFailed: boolean; error?: string; output?: unknown
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`rounded-lg border ${isFailed ? 'border-red-500/20' : 'border-pilos-border/50'}`}>
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2 flex items-center gap-2 text-left">
        <Icon
          icon={isOk ? 'lucide:check-circle-2' : isFailed ? 'lucide:x-circle' : 'lucide:circle'}
          className={`text-xs flex-shrink-0 ${isOk ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-zinc-600'}`}
        />
        <span className="text-xs font-medium text-zinc-300 flex-1 truncate">{label}</span>
        {nodeType && <span className="text-[9px] text-zinc-600 uppercase">{nodeType}</span>}
        <span className="text-[10px] text-zinc-600 font-mono">{formatDuration(duration)}</span>
        <Icon icon={open ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-[10px] text-zinc-600" />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-pilos-border/30">
          {isFailed && error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          {isOk && output != null && (
            <pre className="text-[10px] text-zinc-400 mt-2 whitespace-pre-wrap break-all font-mono bg-zinc-900/50 rounded p-2 max-h-[150px] overflow-y-auto custom-scrollbar">
              {typeof output === 'string' ? output.slice(0, 2000) : JSON.stringify(output, null, 2).slice(0, 2000)}
            </pre>
          )}
          {isOk && output == null && <p className="text-[10px] text-zinc-600 mt-2 italic">No output</p>}
        </div>
      )}
    </div>
  )
}
