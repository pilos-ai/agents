import { useRef, useCallback, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Icon } from '../../common/Icon'
import { WorkflowToolsPanel } from './WorkflowToolsPanel'
import { WorkflowChat } from './WorkflowChat'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowNodeConfig } from './WorkflowNodeConfig'
import { WorkflowExecutionBar } from './WorkflowExecutionBar'
import { WorkflowRunHistory } from './WorkflowRunHistory'
import { WorkflowResultsCanvas } from './WorkflowResultsCanvas'
import { WorkflowSummaryBanner } from './WorkflowSummaryBanner'
import { useWorkflowStore, stripRuntimeFields, stripEdgeRuntime } from '../../../store/useWorkflowStore'
import { useTaskStore } from '../../../store/useTaskStore'

export function WorkflowEditor() {
  const editingTaskId = useWorkflowStore((s) => s.editingTaskId)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const setEditingTaskId = useWorkflowStore((s) => s.setEditingTaskId)
  const chatMode = useWorkflowStore((s) => s.chatMode)
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === editingTaskId))
  const resultsCanvasOpen = useWorkflowStore((s) => s.resultsCanvasOpen)
  const setResultsCanvasOpen = useWorkflowStore((s) => s.setResultsCanvasOpen)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showHistory, setShowHistory] = useState(false)

  const handleExport = useCallback(() => {
    const { nodes, edges } = useWorkflowStore.getState()
    const json = JSON.stringify({
      nodes: stripRuntimeFields(nodes),
      edges: stripEdgeRuntime(edges),
    }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${task?.title || 'workflow'}.json`.replace(/[^a-zA-Z0-9.-]/g, '_')
    a.click()
    URL.revokeObjectURL(url)
  }, [task?.title])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        if (!data.nodes || !Array.isArray(data.nodes)) {
          alert('Invalid workflow file: missing nodes array')
          return
        }
        const store = useWorkflowStore.getState()
        store.pushHistory()
        useWorkflowStore.setState({
          nodes: data.nodes,
          edges: data.edges || [],
          selectedNodeId: null,
        })
      } catch {
        alert('Failed to parse workflow file')
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be imported again
    e.target.value = ''
  }, [])

  return (
    <ReactFlowProvider>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 h-11 border-b border-pilos-border flex-shrink-0 bg-pilos-bg">
          <button
            onClick={() => setEditingTaskId(null)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors"
          >
            <Icon icon="lucide:arrow-left" className="text-sm" />
            Back
          </button>
          <div className="w-px h-4 bg-pilos-border" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Icon icon="lucide:workflow" className="text-blue-400 text-sm flex-shrink-0" />
            <span className="text-xs font-bold text-white truncate">{task?.title || 'Workflow Editor'}</span>
            <span className="text-[10px] font-mono text-zinc-700">{editingTaskId?.slice(0, 8)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600">
              {useWorkflowStore.getState().nodes.length} nodes · {useWorkflowStore.getState().edges.length} connections
            </span>
            <button
              onClick={handleExport}
              title="Export workflow as JSON"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <Icon icon="lucide:download" className="text-[10px]" />
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import workflow from JSON"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <Icon icon="lucide:upload" className="text-[10px]" />
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            <div className="w-px h-4 bg-pilos-border" />
            <button
              onClick={() => { setResultsCanvasOpen(!resultsCanvasOpen); if (!resultsCanvasOpen) setShowHistory(false) }}
              title="View execution results"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors ${
                resultsCanvasOpen ? 'bg-cyan-600/10 text-cyan-400' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Icon icon="lucide:layout-dashboard" className="text-[10px]" />
              Results
            </button>
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) setResultsCanvasOpen(false) }}
              title="Run history"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors ${
                showHistory ? 'bg-blue-600/10 text-blue-400' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Icon icon="lucide:history" className="text-[10px]" />
              History
            </button>
          </div>
        </div>

        {/* Summary banner */}
        <WorkflowSummaryBanner />

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {resultsCanvasOpen ? (
            <WorkflowResultsCanvas onClose={() => setResultsCanvasOpen(false)} />
          ) : (
            <>
              {chatMode ? <WorkflowChat /> : <WorkflowToolsPanel />}
              <WorkflowCanvas />
              {selectedNodeId && !showHistory && <WorkflowNodeConfig />}
              {showHistory && <WorkflowRunHistory onClose={() => setShowHistory(false)} />}
            </>
          )}
        </div>

        {/* Bottom bar */}
        <WorkflowExecutionBar onShowResults={() => { setResultsCanvasOpen(true); setShowHistory(false) }} />
      </div>
    </ReactFlowProvider>
  )
}
