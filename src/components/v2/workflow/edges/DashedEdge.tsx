import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import { useWorkflowStore } from '../../../../store/useWorkflowStore'

const EDGE_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  yes: { text: 'Yes', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  no: { text: 'No', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  body: { text: 'Each Item', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  done: { text: 'Done', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  branch_1: { text: 'Branch 1', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  branch_2: { text: 'Branch 2', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
}

export function DashedEdge(props: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 8,
  })

  const label = props.sourceHandleId ? EDGE_LABELS[props.sourceHandleId] : null

  // Execution-aware edge coloring
  const sourceStatus = useWorkflowStore((s) => {
    const node = s.nodes.find((n) => n.id === props.source)
    return node?.data?.executionStatus
  })

  let strokeColor = props.selected ? '#3b82f6' : '#3b82f680'
  if (sourceStatus === 'completed') strokeColor = props.selected ? '#3b82f6' : '#10b98180'
  else if (sourceStatus === 'running') strokeColor = '#f59e0b'
  else if (sourceStatus === 'failed') strokeColor = '#ef444480'

  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={{
          strokeDasharray: '6 4',
          stroke: strokeColor,
          strokeWidth: 2,
        }}
        className={props.selected ? '' : 'workflow-edge-animated'}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${label.bg} ${label.color}`}
          >
            {label.text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
