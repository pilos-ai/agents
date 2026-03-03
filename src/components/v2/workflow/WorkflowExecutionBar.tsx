import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../common/Icon'
import { StatusDot } from '../components/StatusDot'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { useTaskStore } from '../../../store/useTaskStore'
import type { WorkflowExecution, WorkflowExecutionStatus } from '../../../types/workflow'

const statusColors: Record<string, 'green' | 'orange' | 'blue' | 'gray'> = {
  idle: 'gray',
  running: 'orange',
  paused: 'blue',
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

export function WorkflowExecutionBar({ onShowResults }: { onShowResults?: () => void } = {}) {
  const execution = useWorkflowStore((s) => s.execution)
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow)
  const startExecution = useWorkflowStore((s) => s.startExecution)
  const stopExecution = useWorkflowStore((s) => s.stopExecution)
  const resetExecution = useWorkflowStore((s) => s.resetExecution)
  const showLogs = useWorkflowStore((s) => s.showLogs)
  const setShowLogs = useWorkflowStore((s) => s.setShowLogs)
  const isFixing = useWorkflowStore((s) => s.isFixing)
  const aiFixResult = useWorkflowStore((s) => s.aiFixResult)
  const aiFixWorkflow = useWorkflowStore((s) => s.aiFixWorkflow)
  const clearAiFix = useWorkflowStore((s) => s.clearAiFix)
  const validationResult = useWorkflowStore((s) => s.validationResult)
  const clearValidation = useWorkflowStore((s) => s.clearValidation)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const jiraProjects = useWorkflowStore((s) => s.jiraProjects)
  const jiraProjectKey = useWorkflowStore((s) => s.jiraProjectKey)
  const setJiraProjectKey = useWorkflowStore((s) => s.setJiraProjectKey)
  const loadJiraProjects = useWorkflowStore((s) => s.loadJiraProjects)
  const debugPaused = useWorkflowStore((s) => s.debugPaused)
  const debugStep = useWorkflowStore((s) => s.debugStep)
  const debugContinue = useWorkflowStore((s) => s.debugContinue)
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)

  useEffect(() => { loadJiraProjects() }, [loadJiraProjects])

  // Sync scheduler-driven execution into the workflow store so the bar reflects it
  const editingTaskId = useWorkflowStore((s) => s.editingTaskId)
  const activeExec = useTaskStore((s) => editingTaskId ? s.activeExecutions[editingTaskId] : undefined)
  useEffect(() => {
    // Only sync if the workflow store doesn't already have its OWN execution (from the editor's Run button)
    const current = useWorkflowStore.getState().execution
    const isEditorExecution = current && !current.id.startsWith('sched-')
    if (isEditorExecution) return // Editor-owned execution takes priority

    if (activeExec && (activeExec.status === 'running' || activeExec.status === 'completed' || activeExec.status === 'failed')) {
      // Build a map of nodeId → status from stepResults
      const statusMap = new Map<string, 'completed' | 'failed' | 'skipped'>()
      for (const sr of activeExec.stepResults || []) {
        statusMap.set(sr.nodeId, sr.status)
      }

      // Find the currently running node by matching label
      const currentNodes = useWorkflowStore.getState().nodes
      let runningNodeId: string | null = null
      if (activeExec.currentNodeLabel) {
        const match = currentNodes.find((n) => n.data.label === activeExec.currentNodeLabel)
        if (match) runningNodeId = match.id
      }

      // Update node execution statuses to reflect scheduler progress
      const updatedNodes = currentNodes.map((n) => {
        const stepStatus = statusMap.get(n.id)
        if (stepStatus) {
          return { ...n, data: { ...n.data, executionStatus: stepStatus } }
        }
        if (n.id === runningNodeId) {
          return { ...n, data: { ...n.data, executionStatus: 'running' as const } }
        }
        return n
      })

      const synced: WorkflowExecution = {
        id: `sched-${editingTaskId}`,
        taskId: editingTaskId!,
        status: activeExec.status as WorkflowExecutionStatus,
        currentNodeId: runningNodeId,
        currentStep: activeExec.currentStep,
        totalSteps: activeExec.totalSteps,
        stepResults: activeExec.stepResults || [],
        startedAt: activeExec.startedAt,
        logs: activeExec.logs || [],
      }
      useWorkflowStore.setState({ execution: synced, nodes: updatedNodes })
    } else if (!activeExec && current?.id.startsWith('sched-')) {
      // Scheduler execution cleared — reset node statuses
      const currentNodes = useWorkflowStore.getState().nodes
      const cleaned = currentNodes.map((n) =>
        n.data.executionStatus ? { ...n, data: { ...n.data, executionStatus: undefined } } : n
      )
      useWorkflowStore.setState({ execution: null, nodes: cleaned })
    }
  }, [activeExec, editingTaskId])

  // Auto-save with 2s debounce
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (nodes.length === 0) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setSaveStatus('idle')
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus('saving')
      saveWorkflow()
      setSaveStatus('saved')
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }, 2000)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [nodes, edges, saveWorkflow])

  // Run dropdown
  const [showRunMenu, setShowRunMenu] = useState(false)
  const runMenuRef = useRef<HTMLDivElement>(null)

  const closeRunMenu = useCallback(() => setShowRunMenu(false), [])

  useEffect(() => {
    if (!showRunMenu) return
    const handler = (e: MouseEvent) => {
      if (runMenuRef.current && !runMenuRef.current.contains(e.target as HTMLElement)) {
        closeRunMenu()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRunMenu, closeRunMenu])

  const status = execution?.status || 'idle'
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isFinished = status === 'completed' || status === 'failed'
  const hasFailures = execution?.stepResults.some((r) => r.status === 'failed') || false

  // Deduplicate by nodeId — loop iterations re-execute the same nodes,
  // so count unique completed nodes to avoid exceeding 100%
  const uniqueCompleted = new Set(
    execution?.stepResults.filter((r) => r.status === 'completed').map((r) => r.nodeId) || []
  ).size
  const totalSteps = execution?.totalSteps || 0
  const successRate = totalSteps > 0 ? Math.min(100, Math.round((uniqueCompleted / totalSteps) * 100)) : 0

  return (
    <div className="border-t border-pilos-border flex-shrink-0 bg-pilos-bg">
      {/* Main bar */}
      <div className="flex items-center gap-3 px-4 h-12">
        {/* Status */}
        <div className="flex items-center gap-2 min-w-[120px]">
          <StatusDot color={statusColors[status]} pulse={isRunning} />
          <span className={`text-xs font-bold uppercase tracking-wider ${
            isRunning ? 'text-orange-400' : isPaused ? 'text-blue-400' : status === 'completed' ? 'text-emerald-400' : status === 'failed' ? 'text-red-400' : 'text-zinc-500'
          }`}>
            {statusLabels[status]}
          </span>
        </div>

        {/* Step progress */}
        {(isRunning || isPaused || isFinished) && (
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

        {/* Success rate + View Results */}
        {isFinished && (
          <div className="flex items-center gap-3 ml-auto mr-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Success</span>
              <span className={`text-xs font-bold ${successRate === 100 ? 'text-emerald-400' : successRate > 50 ? 'text-orange-400' : 'text-red-400'}`}>
                {successRate}%
              </span>
            </div>
            {onShowResults && (
              <button
                onClick={onShowResults}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold rounded-lg hover:bg-cyan-600/30 transition-colors"
              >
                <Icon icon="lucide:layout-dashboard" className="text-[10px]" />
                View Results
              </button>
            )}
          </div>
        )}

        {/* Spacer */}
        {!isFinished && <div className="flex-1" />}

        {/* Execution timer */}
        {(isRunning || isPaused) && execution?.startedAt && (
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Icon icon="lucide:timer" className="text-[10px]" />
            <ExecutionTimer startedAt={execution.startedAt} />
          </div>
        )}

        {/* Jira project selector */}
        {jiraProjects.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Icon icon="simple-icons:jira" className="text-[10px] text-blue-400" />
            <select
              value={jiraProjectKey || ''}
              onChange={(e) => setJiraProjectKey(e.target.value)}
              disabled={isRunning}
              className="bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-300 px-2 py-1.5 outline-none hover:border-zinc-600 focus:border-blue-500/50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {jiraProjects.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.key} — {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Auto-save indicator */}
          {saveStatus !== 'idle' && (
            <span className={`text-[10px] ${saveStatus === 'saved' ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}

          {!isRunning && !isPaused && (
            <>
              {isFinished && (
                <button
                  onClick={resetExecution}
                  title="Reset execution state"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                >
                  <Icon icon="lucide:rotate-ccw" className="text-[10px]" />
                  Reset
                </button>
              )}
              {/* Run split button */}
              <div className="relative" ref={runMenuRef}>
                <div className="flex items-stretch">
                  <button
                    onClick={() => startExecution()}
                    title="Run workflow"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-l-lg shadow-lg shadow-blue-600/20 transition-all"
                  >
                    <Icon icon="lucide:play" className="text-[10px]" />
                    Run
                  </button>
                  <button
                    onClick={() => setShowRunMenu(!showRunMenu)}
                    className="flex items-center justify-center px-2.5 bg-blue-600 hover:bg-blue-500 text-white border-l border-blue-500/40 rounded-r-lg shadow-lg shadow-blue-600/20 transition-all"
                  >
                    <Icon icon="lucide:chevron-down" className="text-[10px]" />
                  </button>
                </div>
                {showRunMenu && (
                  <div className="absolute right-0 bottom-full mb-1 w-48 bg-pilos-card border border-pilos-border rounded-lg shadow-xl z-50 overflow-hidden">
                    <button
                      onClick={() => { startExecution({ dryRun: true }); closeRunMenu() }}
                      className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center gap-2"
                    >
                      <Icon icon="lucide:flask-conical" className="text-[10px] text-zinc-500" />
                      <div>
                        <span className="text-white font-medium">Dry Run</span>
                        <p className="text-[10px] text-zinc-600 mt-0.5">No API calls</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { startExecution({ debugMode: true }); closeRunMenu() }}
                      className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center gap-2 border-t border-pilos-border"
                    >
                      <Icon icon="lucide:bug" className="text-[10px] text-zinc-500" />
                      <div>
                        <span className="text-white font-medium">Debug</span>
                        <p className="text-[10px] text-zinc-600 mt-0.5">Step by step</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {isRunning && (
            <button
              onClick={stopExecution}
              title="Stop execution"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg hover:bg-red-600/30 transition-colors"
            >
              <Icon icon="lucide:square" className="text-[10px]" />
              Stop
            </button>
          )}

          {isPaused && debugPaused && (
            <>
              <button
                onClick={debugStep}
                title="Execute next step"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-bold rounded-lg hover:bg-blue-600/30 transition-colors"
              >
                <Icon icon="lucide:step-forward" className="text-[10px]" />
                Step
              </button>
              <button
                onClick={debugContinue}
                title="Continue running all steps"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold rounded-lg hover:bg-emerald-600/30 transition-colors"
              >
                <Icon icon="lucide:play" className="text-[10px]" />
                Continue
              </button>
              <button
                onClick={stopExecution}
                title="Stop execution"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg hover:bg-red-600/30 transition-colors"
              >
                <Icon icon="lucide:square" className="text-[10px]" />
                Stop
              </button>
            </>
          )}

          <button
            onClick={() => setShowLogs(!showLogs)}
            title="Toggle execution logs"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              showLogs ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon icon="lucide:scroll-text" className="text-[10px]" />
          </button>
        </div>
      </div>

      {/* Validation errors */}
      {validationResult && validationResult.issues.length > 0 && (
        <div className="border-t border-pilos-border bg-red-500/5 max-h-[160px] overflow-y-auto custom-scrollbar">
          <div className="px-4 py-2 flex items-center justify-between border-b border-red-500/10">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:alert-triangle" className="text-red-400 text-xs" />
              <span className="text-xs font-bold text-red-400">
                Validation failed — {validationResult.issues.filter((i) => i.type === 'error').length} error(s), {validationResult.issues.filter((i) => i.type === 'warning').length} warning(s)
              </span>
            </div>
            <button onClick={clearValidation} className="text-zinc-500 hover:text-white transition-colors">
              <Icon icon="lucide:x" className="text-xs" />
            </button>
          </div>
          <div className="px-4 py-2 space-y-1">
            {validationResult.issues.map((issue, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-xs cursor-pointer hover:bg-zinc-800/50 px-1.5 py-1 rounded ${
                  issue.type === 'error' ? 'text-red-400' : 'text-orange-400'
                }`}
                onClick={() => { if (issue.nodeId) selectNode(issue.nodeId) }}
              >
                <Icon
                  icon={issue.type === 'error' ? 'lucide:x-circle' : 'lucide:alert-circle'}
                  className="text-[10px] flex-shrink-0 mt-0.5"
                />
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
          {isFinished && hasFailures && (
            <div className="px-4 py-2 border-t border-red-500/10 flex justify-end">
              <button
                onClick={() => aiFixWorkflow()}
                disabled={isFixing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs font-bold rounded-lg hover:bg-violet-600/30 transition-colors disabled:opacity-50"
              >
                <Icon icon={isFixing ? 'lucide:loader-2' : 'lucide:sparkles'} className={`text-[10px] ${isFixing ? 'animate-spin' : ''}`} />
                {isFixing ? 'Fixing...' : 'AI Fix'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Fix result banner */}
      {aiFixResult && (
        <div className="border-t border-pilos-border bg-violet-500/5 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Icon icon="lucide:sparkles" className="text-violet-400 text-xs flex-shrink-0" />
            <span className="text-xs text-violet-300 truncate">{aiFixResult.summary}</span>
            {aiFixResult.suggestions.length > 0 && (
              <span className="text-[10px] text-violet-400/60 flex-shrink-0">
                ({aiFixResult.suggestions.length} change{aiFixResult.suggestions.length !== 1 ? 's' : ''} applied)
              </span>
            )}
          </div>
          <button
            onClick={clearAiFix}
            className="text-zinc-500 hover:text-white transition-colors flex-shrink-0 ml-2"
          >
            <Icon icon="lucide:x" className="text-xs" />
          </button>
        </div>
      )}

      {/* Execution log panel */}
      {showLogs && execution && (
        <div className="border-t border-pilos-border bg-pilos-card max-h-[200px] overflow-y-auto custom-scrollbar">
          <div className="px-4 py-2 border-b border-pilos-border flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Execution Log</span>
            <span className="text-[10px] text-zinc-700">{execution.logs.length} entries</span>
          </div>
          <div className="px-4 py-2 space-y-0.5 font-mono text-xs">
            {execution.logs.map((log, i) => {
              const levelMatch = log.match(/^\[(WARN|ERROR|DEBUG|INFO)\]\s*/)
              const level = levelMatch?.[1]
              const text = levelMatch ? log.slice(levelMatch[0].length) : log
              const badgeClass = level === 'ERROR' ? 'bg-red-500/20 text-red-400'
                : level === 'WARN' ? 'bg-orange-500/20 text-orange-400'
                : level === 'DEBUG' ? 'bg-blue-500/20 text-blue-400'
                : level === 'INFO' ? 'bg-zinc-500/20 text-zinc-400'
                : null
              const textClass = level === 'ERROR' ? 'text-red-400/80'
                : level === 'WARN' ? 'text-orange-400/80'
                : level === 'DEBUG' ? 'text-blue-400/70'
                : 'text-zinc-500'
              return (
                <div key={i} className={`leading-relaxed flex items-start gap-1.5 ${textClass}`}>
                  {badgeClass && (
                    <span className={`px-1 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${badgeClass}`}>{level}</span>
                  )}
                  <span className="break-all">{text}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ExecutionTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))

  useEffect(() => {
    const start = new Date(startedAt).getTime()
    setElapsed(Math.floor((Date.now() - start) / 1000))
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return (
    <span className="text-[10px] font-mono">
      {String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s
    </span>
  )
}
