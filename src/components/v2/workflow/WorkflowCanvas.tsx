import { useCallback, useMemo, useRef } from 'react'
import { ReactFlow, Background, MiniMap, type ReactFlowInstance } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import { Icon } from '../../common/Icon'
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
import { DashedEdge } from './edges/DashedEdge'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
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
}

const edgeTypes = {
  dashed: DashedEdge,
}

const defaultEdgeOptions = {
  type: 'dashed' as const,
}

let nodeCounter = 0

export function WorkflowCanvas() {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
  const onConnect = useWorkflowStore((s) => s.onConnect)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const addNode = useWorkflowStore((s) => s.addNode)
  const undo = useWorkflowStore((s) => s.undo)
  const redo = useWorkflowStore((s) => s.redo)

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
      return '#3b82f6'
    }
  }, [])

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

      {/* Custom controls overlay */}
      <div className="absolute top-4 left-4 flex flex-col gap-1.5">
        {/* Zoom controls */}
        <div className="flex flex-col bg-pilos-card border border-pilos-border rounded-lg overflow-hidden">
          <button onClick={handleZoomIn} className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border-b border-pilos-border">
            <Icon icon="lucide:plus" className="text-xs" />
          </button>
          <button onClick={handleZoomOut} className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border-b border-pilos-border">
            <Icon icon="lucide:minus" className="text-xs" />
          </button>
          <button onClick={handleFitView} className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <Icon icon="lucide:maximize-2" className="text-xs" />
          </button>
        </div>

        {/* Undo/Redo */}
        <div className="flex flex-col bg-pilos-card border border-pilos-border rounded-lg overflow-hidden">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors border-b border-pilos-border"
          >
            <Icon icon="lucide:undo-2" className="text-xs" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors"
          >
            <Icon icon="lucide:redo-2" className="text-xs" />
          </button>
        </div>
      </div>
    </div>
  )
}
