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
import { prepareTaskForExport, serializeExport, encodeForClipboard, decodeFromClipboard, isPilosClipboardString, canShareTask } from '../../../utils/task-sharing'
import { api } from '../../../api'

export function WorkflowEditor() {
  const editingTaskId = useWorkflowStore((s) => s.editingTaskId)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const setEditingTaskId = useWorkflowStore((s) => s.setEditingTaskId)
  const chatMode = useWorkflowStore((s) => s.chatMode)
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === editingTaskId))
  const tasksLoaded = useTaskStore((s) => s.tasks.length > 0 || s.currentProjectPath !== null)
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

  // Build the export payload. With a task in context, emit the rich, marketplace-ready
  // .pilos format (title/description/priority/schedule/license + workflow); otherwise
  // fall back to a plain workflow-only export. Always uses the live editor nodes/edges.
  const buildExportJson = useCallback((): string => {
    const { nodes, edges } = useWorkflowStore.getState()
    const cleanNodes = stripRuntimeFields(nodes)
    const cleanEdges = stripEdgeRuntime(edges)
    if (task) {
      return serializeExport(prepareTaskForExport({ ...task, workflow: { nodes: cleanNodes, edges: cleanEdges } }))
    }
    return JSON.stringify({ nodes: cleanNodes, edges: cleanEdges }, null, 2)
  }, [task])

  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportBtnRef = useRef<HTMLButtonElement>(null)

  const handleExport = useCallback(async () => {
    setShowExportMenu(false)
    if (task && !canShareTask(task)) { showFlash('error', 'Marketplace tasks cannot be shared'); return }
    const json = buildExportJson()
    const sanitizedTitle = (task?.title || 'workflow').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-')
    const filePath = await api.dialog.saveFile({
      defaultPath: `${sanitizedTitle}.pilos`,
      filters: [{ name: 'Pilos Workflow', extensions: ['pilos'] }],
    })
    if (!filePath) return
    await api.files.writeFile(filePath, json)
    showFlash('success', 'Exported .pilos file')
  }, [buildExportJson, task, showFlash])

  const handleExportClipboard = useCallback(async () => {
    setShowExportMenu(false)
    if (!task) { showFlash('error', 'Open a task to copy a shareable payload'); return }
    if (!canShareTask(task)) { showFlash('error', 'Marketplace tasks cannot be shared'); return }
    try {
      const { nodes, edges } = useWorkflowStore.getState()
      const payload = encodeForClipboard(
        prepareTaskForExport({ ...task, workflow: { nodes: stripRuntimeFields(nodes), edges: stripEdgeRuntime(edges) } }),
      )
      await navigator.clipboard.writeText(payload)
      showFlash('success', 'Copied shareable payload to clipboard')
    } catch {
      showFlash('error', 'Could not copy to clipboard')
    }
  }, [task, showFlash])

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
      // Accept both the encoded `pilos:task:v1:<base64>` clipboard payload and raw JSON.
      const json = isPilosClipboardString(text) ? serializeExport(decodeFromClipboard(text)) : text
      const err = applyImport(json)
      if (err) showFlash('error', err)
      else showFlash('success', `Imported ${useWorkflowStore.getState().nodes.length} nodes from clipboard`)
    } catch (e) {
      showFlash('error', e instanceof Error ? e.message : 'Could not read clipboard')
    }
  }, [applyImport, showFlash])

  // Clean up flash timer on unmount
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  // If the task disappeared from the store while the editor is still mounted
  // (e.g. deleted on another tab or via a race), render a placeholder with a
  // way back instead of silently showing an empty canvas reading nothing.
  if (editingTaskId && !task && tasksLoaded) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-3 text-center"
        style={{ background: 'var(--rail)', padding: 32 }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'var(--surface)', border: '1px solid var(--line)',
            display: 'grid', placeItems: 'center',
          }}
        >
          <Icon icon="lucide:file-x" style={{ fontSize: 22, color: 'var(--ink-3)' }} />
        </div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink-2)', margin: 0 }}>
            This workflow no longer exists
          </h3>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, maxWidth: 320 }}>
            It may have been deleted. Go back to the workflow list to pick another.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setEditingTaskId(null)}>
          <Icon icon="lucide:arrow-left" style={{ fontSize: 14 }} />
          Back to workflows
        </button>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        style={{ background: 'var(--rail)' }}
      >
        {/* Top bar */}
        <div
          className="flex items-center gap-3 px-4 h-11 flex-shrink-0"
          style={{ background: 'var(--rail)', borderBottom: '1px solid var(--line-2)' }}
        >
          <button
            onClick={() => setEditingTaskId(null)}
            className="btn sm ghost"
            title="Back to workflow list"
          >
            <Icon icon="lucide:arrow-left" style={{ fontSize: 13 }} />
            Back
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--line-2)' }} />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Icon icon="lucide:workflow" style={{ fontSize: 14, color: 'var(--ink-3)', flexShrink: 0 }} />
            <span className="truncate" style={{ fontSize: 12, fontWeight: 650, color: 'var(--ink)' }}>{task?.title || 'Workflow Editor'}</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--faint)' }}>{editingTaskId?.slice(0, 8)}</span>
            {flash && (
              <span
                className="flex items-center gap-1"
                style={{
                  padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: 10, fontWeight: 550,
                  background: flash.type === 'success' ? 'rgba(62, 207, 142, 0.12)' : 'rgba(251, 111, 111, 0.12)',
                  color: flash.type === 'success' ? 'var(--ok)' : 'var(--err)',
                  border: '1px solid ' + (flash.type === 'success' ? 'rgba(62, 207, 142, 0.3)' : 'rgba(251, 111, 111, 0.3)'),
                }}
              >
                <Icon icon={flash.type === 'success' ? 'lucide:check' : 'lucide:x'} style={{ fontSize: 9 }} />
                {flash.msg}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              {useWorkflowStore.getState().nodes.length} nodes · {useWorkflowStore.getState().edges.length} connections
            </span>
            <div className="relative">
              <button
                ref={exportBtnRef}
                onClick={() => setShowExportMenu((v) => !v)}
                title="Export workflow"
                className="btn sm ghost"
              >
                <Icon icon="lucide:download" style={{ fontSize: 12 }} />
                Export
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 z-50 overflow-hidden"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r-sm)',
                      boxShadow: '0 12px 32px -8px rgba(0,0,0,0.6)',
                      minWidth: 180,
                    }}
                  >
                    <button
                      onClick={handleExport}
                      className="w-full flex items-center gap-2 text-left"
                      style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-2)', background: 'transparent', border: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icon icon="lucide:file" style={{ fontSize: 11, color: 'var(--muted)' }} />
                      Export as .pilos file
                    </button>
                    <button
                      onClick={handleExportClipboard}
                      className="w-full flex items-center gap-2 text-left"
                      style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-2)', background: 'transparent', border: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icon icon="lucide:clipboard" style={{ fontSize: 11, color: 'var(--muted)' }} />
                      Copy to clipboard
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <button
                ref={importBtnRef}
                onClick={() => setShowImportMenu((v) => !v)}
                title="Import workflow"
                className="btn sm ghost"
              >
                <Icon icon="lucide:upload" style={{ fontSize: 12 }} />
                Import
              </button>
              {showImportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowImportMenu(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 z-50 overflow-hidden"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r-sm)',
                      boxShadow: '0 12px 32px -8px rgba(0,0,0,0.6)',
                      minWidth: 180,
                    }}
                  >
                    <button
                      onClick={handleImportFile}
                      className="w-full flex items-center gap-2 text-left"
                      style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-2)', background: 'transparent', border: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icon icon="lucide:file" style={{ fontSize: 11, color: 'var(--muted)' }} />
                      Import from .pilos file
                    </button>
                    <button
                      onClick={handleImportClipboard}
                      className="w-full flex items-center gap-2 text-left"
                      style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-2)', background: 'transparent', border: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icon icon="lucide:clipboard" style={{ fontSize: 11, color: 'var(--muted)' }} />
                      Import from clipboard
                    </button>
                  </div>
                </>
              )}
            </div>
            <div style={{ width: 1, height: 16, background: 'var(--line-2)' }} />
            <button
              onClick={() => { setResultsCanvasOpen(!resultsCanvasOpen); if (!resultsCanvasOpen) setShowHistory(false) }}
              title="View execution results"
              className={'btn sm' + (resultsCanvasOpen ? '' : ' ghost')}
            >
              <Icon icon="lucide:layout-dashboard" style={{ fontSize: 12 }} />
              Results
            </button>
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) setResultsCanvasOpen(false) }}
              title="Run history"
              className={'btn sm' + (showHistory ? '' : ' ghost')}
            >
              <Icon icon="lucide:history" style={{ fontSize: 12 }} />
              History
            </button>
            <button
              onClick={() => { setShowCodeEditor((v) => !v); setShowHistory(false); setResultsCanvasOpen(false) }}
              title="Edit workflow JSON"
              className={'btn sm' + (showCodeEditor ? '' : ' ghost')}
            >
              <Icon icon="lucide:file-code" style={{ fontSize: 12 }} />
              JSON
            </button>
          </div>
        </div>

        {/* Summary banner */}
        <WorkflowSummaryBanner />

        {/* Block editor — full overlay */}
        {showCodeEditor && (
          <div
            className="absolute inset-0 z-20 flex flex-col"
            style={{ background: 'var(--rail)' }}
          >
            <WorkflowCodeEditor onClose={() => setShowCodeEditor(false)} />
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden" style={{ background: 'var(--win)' }}>
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
