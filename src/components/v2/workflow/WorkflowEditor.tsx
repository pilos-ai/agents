import { useRef, useCallback, useState, useEffect } from 'react'
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
import { WorkflowCodeEditor } from './WorkflowCodeEditor'
import { useWorkflowStore, stripRuntimeFields, stripEdgeRuntime } from '../../../store/useWorkflowStore'
import { useTaskStore } from '../../../store/useTaskStore'
import { api } from '../../../api'

export function WorkflowEditor() {
  const editingTaskId = useWorkflowStore((s) => s.editingTaskId)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const setEditingTaskId = useWorkflowStore((s) => s.setEditingTaskId)
  const chatMode = useWorkflowStore((s) => s.chatMode)
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === editingTaskId))
  const resultsCanvasOpen = useWorkflowStore((s) => s.resultsCanvasOpen)
  const setResultsCanvasOpen = useWorkflowStore((s) => s.setResultsCanvasOpen)
  const [showHistory, setShowHistory] = useState(false)
  const [showCodeEditor, setShowCodeEditor] = useState(false)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showFlash = useCallback((type: 'success' | 'error', msg: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlash({ type, msg })
    flashTimer.current = setTimeout(() => setFlash(null), 3000)
  }, [])

  const handleExport = useCallback(async () => {
    const { nodes, edges } = useWorkflowStore.getState()
    const json = JSON.stringify({
      nodes: stripRuntimeFields(nodes),
      edges: stripEdgeRuntime(edges),
    }, null, 2)
    const sanitizedTitle = (task?.title || 'workflow').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-')
    const filePath = await api.dialog.saveFile({
      defaultPath: `${sanitizedTitle}.pilos`,
      filters: [{ name: 'Pilos Workflow', extensions: ['pilos'] }],
    })
    if (!filePath) return
    await api.files.writeFile(filePath, json)
  }, [task?.title])

  const [showImportMenu, setShowImportMenu] = useState(false)
  const importBtnRef = useRef<HTMLButtonElement>(null)

  const applyImport = useCallback((json: string) => {
    try {
      const data = JSON.parse(json)
      // Accept both workflow-only export { nodes, edges }
      // and full task export { pilos: { type:'task' }, task: { workflow: { nodes, edges } } }
      let nodes = data.nodes
      let edges = data.edges
      if (!nodes && data.pilos?.type === 'task' && data.task?.workflow?.nodes) {
        nodes = data.task.workflow.nodes
        edges = data.task.workflow.edges
      }
      if (!nodes || !Array.isArray(nodes)) {
        return 'Invalid workflow file: no workflow nodes found'
      }
      const store = useWorkflowStore.getState()
      store.pushHistory()
      useWorkflowStore.setState({ nodes, edges: edges || [], selectedNodeId: null })
      return null
    } catch {
      return 'Failed to parse workflow file'
    }
  }, [])

  const handleImportFile = useCallback(async () => {
    setShowImportMenu(false)
    try {
      const filePath = await api.dialog.openFile({
        filters: [{ name: 'Pilos Workflow', extensions: ['pilos', 'json'] }],
      })
      if (!filePath) return
      const json = await api.files.readFile(filePath)
      const err = applyImport(json)
      if (err) showFlash('error', err)
      else showFlash('success', `Imported ${useWorkflowStore.getState().nodes.length} nodes`)
    } catch {
      showFlash('error', 'Could not read file')
    }
  }, [applyImport, showFlash])

  const handleImportClipboard = useCallback(async () => {
    setShowImportMenu(false)
    try {
      const text = await navigator.clipboard.readText()
      const err = applyImport(text)
      if (err) showFlash('error', err)
      else showFlash('success', `Imported ${useWorkflowStore.getState().nodes.length} nodes from clipboard`)
    } catch {
      showFlash('error', 'Could not read clipboard')
    }
  }, [applyImport, showFlash])

  // Clean up flash timer on unmount
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  return (
    <ReactFlowProvider>
      <div className="flex-1 flex flex-col overflow-hidden relative">
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
            {flash && (
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-opacity ${
                flash.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                <Icon icon={flash.type === 'success' ? 'lucide:check' : 'lucide:x'} className="text-[9px]" />
                {flash.msg}
              </span>
            )}
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
            <div className="relative">
              <button
                ref={importBtnRef}
                onClick={() => setShowImportMenu((v) => !v)}
                title="Import workflow"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <Icon icon="lucide:upload" className="text-[10px]" />
                Import
              </button>
              {showImportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowImportMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[180px]">
                    <button
                      onClick={handleImportFile}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors text-left"
                    >
                      <Icon icon="lucide:file" className="text-[10px] text-zinc-500" />
                      Import from .pilos file
                    </button>
                    <button
                      onClick={handleImportClipboard}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors text-left"
                    >
                      <Icon icon="lucide:clipboard" className="text-[10px] text-zinc-500" />
                      Import from clipboard
                    </button>
                  </div>
                </>
              )}
            </div>
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
            <button
              onClick={() => { setShowCodeEditor((v) => !v); setShowHistory(false); setResultsCanvasOpen(false) }}
              title="Edit workflow JSON"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors ${
                showCodeEditor ? 'bg-violet-600/10 text-violet-400' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Icon icon="lucide:file-code" className="text-[10px]" />
              JSON
            </button>
          </div>
        </div>

        {/* Summary banner */}
        <WorkflowSummaryBanner />

        {/* Block editor — full overlay */}
        {showCodeEditor && (
          <div className="absolute inset-0 z-20 bg-pilos-bg flex flex-col">
            <WorkflowCodeEditor onClose={() => setShowCodeEditor(false)} />
          </div>
        )}

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
