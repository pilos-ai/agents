import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, MiniMap, type ReactFlowInstance } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { Icon } from '../../common/Icon'
import { WorkflowTemplatesModal } from './WorkflowTemplatesModal'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { ToolNode } from './nodes/ToolNode'
import { ConditionNode } from './nodes/ConditionNode'
import { LoopNode } from './nodes/LoopNode'
import { DelayNode } from './nodes/DelayNode'
import { ParallelNode } from './nodes/ParallelNode'
import { MergeNode } from './nodes/MergeNode'
import { VariableNode } from './nodes/VariableNode'
import { NoteNode } from './nodes/NoteNode'
import { AiNode } from './nodes/AiNode'
import { AgentNode } from './nodes/AgentNode'
import { ResultsDisplayNode } from './nodes/ResultsDisplayNode'
import { DashedEdge } from './edges/DashedEdge'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { ProBadge } from '../../common/ProBadge'
import type { WorkflowNodeData, McpToolDefinition } from '../../../types/workflow'

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  mcp_tool: ToolNode,
  condition: ConditionNode,
  loop: LoopNode,
  delay: DelayNode,
  parallel: ParallelNode,
  merge: MergeNode,
  variable: VariableNode,
  note: NoteNode,
  ai_prompt: AiNode,
  agent: AgentNode,
  results_display: ResultsDisplayNode,
}

const edgeTypes = {
  dashed: DashedEdge,
}

const defaultEdgeOptions = {
  type: 'dashed' as const,
}

let nodeCounter = 0

export function WorkflowCanvas() {
  const [showTemplates, setShowTemplates] = useState(false)
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
  const onConnect = useWorkflowStore((s) => s.onConnect)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const addNode = useWorkflowStore((s) => s.addNode)
  const undo = useWorkflowStore((s) => s.undo)
  const redo = useWorkflowStore((s) => s.redo)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const copyNode = useWorkflowStore((s) => s.copyNode)
  const pasteNode = useWorkflowStore((s) => s.pasteNode)
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const setShowGenerateModal = useWorkflowStore((s) => s.setShowGenerateModal)
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'

  const reactFlowRef = useRef<ReactFlowInstance<Node<WorkflowNodeData>> | null>(null)

  const onInit = useCallback((instance: ReactFlowInstance<Node<WorkflowNodeData>>) => {
    reactFlowRef.current = instance
  }, [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<WorkflowNodeData>) => {
    selectNode(node.id)
  }, [selectNode])

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      // Don't intercept when typing in inputs or contenteditable elements
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (target.isContentEditable) return

      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      else if (mod && e.key === 'y') { e.preventDefault(); redo() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) { e.preventDefault(); removeNode(selectedNodeId) }
      else if (mod && e.key === 'd' && selectedNodeId) { e.preventDefault(); duplicateNode(selectedNodeId) }
      else if (mod && e.key === 'c' && selectedNodeId) { e.preventDefault(); copyNode(selectedNodeId) }
      else if (mod && e.key === 'v') { e.preventDefault(); pasteNode() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, removeNode, duplicateNode, copyNode, pasteNode, selectedNodeId])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!reactFlowRef.current) return

    const position = reactFlowRef.current.screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    })

    // Handle structural node drops (start, end, condition)
    const structuralData = e.dataTransfer.getData('application/workflow-structural')
    if (structuralData) {
      const structural = JSON.parse(structuralData) as { id: string; name: string; nodeType: string }
      nodeCounter++
      const nodeId = `${structural.nodeType.toUpperCase()}_${String(nodeCounter).padStart(3, '0')}`

      const defaults: Record<string, Partial<WorkflowNodeData>> = {
        condition: { conditionExpression: '', conditionOperator: 'equals' as const, conditionValue: '' },
        loop: { loopType: 'count', loopCount: 3 },
        delay: { delayMs: 5, delayUnit: 's' },
        parallel: {},
        merge: {},
        variable: { variableName: '', variableValue: '', variableOperation: 'set' },
        note: { noteText: '' },
        ai_prompt: { aiPrompt: '', aiModel: 'sonnet' },
        results_display: { displayFormat: 'auto', displayTitle: '', displaySource: '' },
      }

      const newNode: Node<WorkflowNodeData> = {
        id: nodeId,
        type: structural.nodeType,
        position,
        data: {
          type: structural.nodeType as WorkflowNodeData['type'],
          label: structural.name,
          ...defaults[structural.nodeType],
        },
      }
      addNode(newNode)
      return
    }

    // Handle MCP tool drops
    const toolData = e.dataTransfer.getData('application/workflow-tool')
    if (!toolData) return

    const tool: McpToolDefinition = JSON.parse(toolData)

    nodeCounter++
    const nodeId = `${tool.id.toUpperCase()}_${String(nodeCounter).padStart(3, '0')}`

    const params: Record<string, typeof tool.parameters[0]> = {}
    for (const p of tool.parameters) {
      params[p.key] = { ...p }
    }

    const newNode: Node<WorkflowNodeData> = {
      id: nodeId,
      type: 'mcp_tool',
      position,
      data: {
        type: 'mcp_tool',
        label: tool.name,
        description: tool.description,
        toolId: tool.id,
        toolCategory: tool.category,
        toolIcon: tool.icon,
        parameters: params,
        errorHandling: { autoRetry: false, maxRetries: 3, failureAction: 'stop' },
      },
    }

    addNode(newNode)
  }, [addNode])

  const handleFitView = useCallback(() => {
    reactFlowRef.current?.fitView({ padding: 0.2, duration: 300 })
  }, [])

  const handleAutoLayout = useCallback(() => {
    const { nodes: currentNodes, edges: currentEdges, pushHistory } = useWorkflowStore.getState()
    if (currentNodes.length === 0) return

    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 })

    const nodeWidth = 200
    const nodeHeight = 80
    for (const node of currentNodes) {
      g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
    }
    for (const edge of currentEdges) {
      g.setEdge(edge.source, edge.target)
    }

    dagre.layout(g)

    pushHistory()
    const layoutNodes = currentNodes.map((node) => {
      const pos = g.node(node.id)
      return {
        ...node,
        position: {
          x: pos.x - nodeWidth / 2,
          y: pos.y - nodeHeight / 2,
        },
      }
    })
    useWorkflowStore.setState({ nodes: layoutNodes })
    setTimeout(() => reactFlowRef.current?.fitView({ padding: 0.2, duration: 300 }), 50)
  }, [])

  const handleZoomIn = useCallback(() => {
    reactFlowRef.current?.zoomIn({ duration: 200 })
  }, [])

  const handleZoomOut = useCallback(() => {
    reactFlowRef.current?.zoomOut({ duration: 200 })
  }, [])

  const canUndo = useWorkflowStore((s) => s.canUndo())
  const canRedo = useWorkflowStore((s) => s.canRedo())

  const minimapNodeColor = useMemo(() => {
    return (node: Node<WorkflowNodeData>) => {
      const t = node.data?.type
      if (t === 'start') return '#10b981'
      if (t === 'end') return '#71717a'
      if (t === 'condition') return '#f59e0b'
      if (t === 'loop') return '#a855f7'
      if (t === 'delay') return '#06b6d4'
      if (t === 'parallel' || t === 'merge') return '#6366f1'
      if (t === 'variable') return '#8b5cf6'
      if (t === 'note') return '#eab308'
      if (t === 'ai_prompt') return '#a855f7'
      if (t === 'agent') return '#10b981'
      if (t === 'results_display') return '#22d3ee'
      return '#3b82f6'
    }
  }, [])

  const isValidConnection = useCallback((connection: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
    // Prevent self-connections
    if (connection.source === connection.target) return false
    // Prevent duplicate edges
    const duplicate = edges.some(
      (e) => e.source === connection.source && e.target === connection.target && e.sourceHandle === connection.sourceHandle
    )
    if (duplicate) return false
    // Prevent connecting to start node input
    const targetNode = nodes.find((n) => n.id === connection.target)
    if (targetNode?.data.type === 'start') return false
    // Prevent connecting from end node output
    const sourceNode = nodes.find((n) => n.id === connection.source)
    if (sourceNode?.data.type === 'end') return false
    return true
  }, [edges, nodes])

  return (
    <div className="flex-1 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onInit={onInit}
        onDragOver={onDragOver}
        onDrop={onDrop}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        className="workflow-canvas"
      >
        <Background color="#27272a" gap={20} size={1} />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(9, 9, 11, 0.8)"
          className="!bg-pilos-card !border !border-pilos-border !rounded-lg"
          style={{ width: 140, height: 90 }}
        />
      </ReactFlow>

      {/* Empty canvas guidance */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center max-w-xs">
            <Icon icon="lucide:workflow" className="text-zinc-700 text-4xl mb-3 mx-auto" />
            <p className="text-sm text-white font-medium mb-3">Build your workflow</p>
            <div className="text-left space-y-2 mb-5">
              <div className="flex items-start gap-2.5">
                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <p className="text-xs text-zinc-400">Drag a tool from the left panel onto the canvas</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <p className="text-xs text-zinc-400">Connect nodes by dragging between handles</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <p className="text-xs text-zinc-400">Click <span className="text-white font-medium">Run</span> to execute your workflow</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={() => setShowTemplates(true)}
                className="flex-1 px-4 py-2 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
              >
                <Icon icon="lucide:layout-template" className="text-sm mr-1.5 inline-block" />
                Templates
              </button>
              <button
                onClick={() => isPro && setShowGenerateModal(true)}
                disabled={!isPro}
                className={`flex-1 px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${isPro ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-zinc-800 border border-pilos-border text-zinc-500 cursor-not-allowed opacity-60'}`}
              >
                <Icon icon="lucide:sparkles" className="text-sm" />
                Generate with AI
                {!isPro && <ProBadge />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates modal */}
      {showTemplates && <WorkflowTemplatesModal onClose={() => setShowTemplates(false)} />}

      {/* Custom controls overlay */}
      <div className="absolute top-4 left-4 flex flex-col gap-1.5">
        {/* Zoom controls */}
        <div className="flex flex-col bg-pilos-card border border-pilos-border rounded-lg overflow-hidden">
          <button onClick={handleZoomIn} title="Zoom In" className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border-b border-pilos-border">
            <Icon icon="lucide:plus" className="text-xs" />
          </button>
          <button onClick={handleZoomOut} title="Zoom Out" className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border-b border-pilos-border">
            <Icon icon="lucide:minus" className="text-xs" />
          </button>
          <button onClick={handleFitView} title="Fit to Screen" className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <Icon icon="lucide:maximize-2" className="text-xs" />
          </button>
        </div>

        {/* Undo/Redo */}
        <div className="flex flex-col bg-pilos-card border border-pilos-border rounded-lg overflow-hidden">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors border-b border-pilos-border"
          >
            <Icon icon="lucide:undo-2" className="text-xs" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors"
          >
            <Icon icon="lucide:redo-2" className="text-xs" />
          </button>
        </div>

        {/* Auto Arrange */}
        <button
          onClick={handleAutoLayout}
          title="Auto Arrange Nodes"
          className="px-2.5 py-2 bg-pilos-card border border-pilos-border rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <Icon icon="lucide:layout-grid" className="text-xs" />
        </button>
      </div>
    </div>
  )
}
