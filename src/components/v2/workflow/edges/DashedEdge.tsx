import { BaseEdge, getBezierPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'

export function DashedEdge(props: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  })

  return (
    <BaseEdge
      id={props.id}
      path={edgePath}
      style={{
        strokeDasharray: '6 4',
        stroke: props.selected ? '#3b82f6' : '#3b82f680',
        strokeWidth: 2,
      }}
      className={props.selected ? '' : 'workflow-edge-animated'}
    />
  )
}
