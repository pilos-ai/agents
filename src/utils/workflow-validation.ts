import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData } from '../types/workflow'

export interface ValidationIssue {
  type: 'error' | 'warning'
  nodeId?: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

/**
 * Validate a workflow before execution.
 * Returns errors (blocking) and warnings (non-blocking).
 */
export function validateWorkflow(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): ValidationResult {
  const issues: ValidationIssue[] = []

  // --- Structural checks ---

  const startNodes = nodes.filter((n) => n.data.type === 'start')
  const endNodes = nodes.filter((n) => n.data.type === 'end')

  if (startNodes.length === 0) {
    issues.push({ type: 'error', message: 'Workflow must have a Start node' })
  }
  if (endNodes.length === 0) {
    issues.push({ type: 'warning', message: 'Workflow has no End node' })
  }

  // Start node must have outgoing edge
  for (const start of startNodes) {
    const outgoing = edges.filter((e) => e.source === start.id)
    if (outgoing.length === 0) {
      issues.push({ type: 'error', nodeId: start.id, message: 'Start node has no outgoing connection' })
    }
  }

  // End node must have incoming edge
  for (const end of endNodes) {
    const incoming = edges.filter((e) => e.target === end.id)
    if (incoming.length === 0) {
      issues.push({ type: 'warning', nodeId: end.id, message: 'End node has no incoming connection' })
    }
  }

  // --- Orphan detection (BFS from start) ---

  if (startNodes.length > 0) {
    const reachable = new Set<string>()
    const queue = startNodes.map((n) => n.id)
    while (queue.length > 0) {
      const current = queue.shift()!
      if (reachable.has(current)) continue
      reachable.add(current)
      for (const edge of edges) {
        if (edge.source === current && !reachable.has(edge.target)) {
          queue.push(edge.target)
        }
      }
    }

    for (const node of nodes) {
      if (node.data.type === 'note') continue // Notes are annotations
      if (!reachable.has(node.id)) {
        issues.push({
          type: 'warning',
          nodeId: node.id,
          message: `"${node.data.label}" is not reachable from Start`,
        })
      }
    }
  }

  // --- Loop checks ---

  const loopNodes = nodes.filter((n) => n.data.type === 'loop')
  for (const loop of loopNodes) {
    const bodyEdge = edges.find((e) => e.source === loop.id && e.sourceHandle === 'body')
    const doneEdge = edges.find((e) => e.source === loop.id && e.sourceHandle === 'done')
    if (!bodyEdge) {
      issues.push({ type: 'error', nodeId: loop.id, message: `Loop "${loop.data.label}" is missing a "body" connection` })
    }
    if (!doneEdge) {
      issues.push({ type: 'error', nodeId: loop.id, message: `Loop "${loop.data.label}" is missing a "done" connection` })
    }
    if (loop.data.loopType === 'collection' && !loop.data.loopCollection) {
      issues.push({ type: 'error', nodeId: loop.id, message: `Loop "${loop.data.label}" has no collection reference` })
    }
  }

  // --- Condition checks ---

  const conditionNodes = nodes.filter((n) => n.data.type === 'condition')
  for (const cond of conditionNodes) {
    const yesEdge = edges.find((e) => e.source === cond.id && e.sourceHandle === 'yes')
    const noEdge = edges.find((e) => e.source === cond.id && e.sourceHandle === 'no')
    if (!yesEdge) {
      issues.push({ type: 'warning', nodeId: cond.id, message: `Condition "${cond.data.label}" has no "yes" branch` })
    }
    if (!noEdge) {
      issues.push({ type: 'warning', nodeId: cond.id, message: `Condition "${cond.data.label}" has no "no" branch` })
    }
    if (!cond.data.conditionExpression) {
      issues.push({ type: 'error', nodeId: cond.id, message: `Condition "${cond.data.label}" has no expression` })
    }
  }

  // --- AI prompt checks ---

  const aiNodes = nodes.filter((n) => n.data.type === 'ai_prompt')
  for (const ai of aiNodes) {
    if (!ai.data.aiPrompt?.trim()) {
      issues.push({ type: 'error', nodeId: ai.id, message: `AI Prompt "${ai.data.label}" has an empty prompt` })
    }
  }

  // --- Agent checks ---

  const agentNodes = nodes.filter((n) => n.data.type === 'agent')
  for (const agent of agentNodes) {
    if (!agent.data.agentPrompt?.trim()) {
      issues.push({ type: 'error', nodeId: agent.id, message: `Agent "${agent.data.label}" has an empty prompt` })
    }
  }

  // --- Required parameter checks ---

  const toolNodes = nodes.filter((n) => n.data.type === 'mcp_tool' && n.data.parameters)
  for (const tool of toolNodes) {
    const params = Object.values(tool.data.parameters || {}).filter((p) => p != null)
    for (const param of params) {
      if (param.required && (param.value === '' || param.value === undefined || param.value === null)) {
        // Skip if value contains a template reference
        const strValue = String(param.value || '')
        if (!strValue.includes('{{')) {
          issues.push({
            type: 'warning',
            nodeId: tool.id,
            message: `"${tool.data.label}" has empty required parameter: ${param.label}`,
          })
        }
      }
    }
  }

  return {
    valid: issues.filter((i) => i.type === 'error').length === 0,
    issues,
  }
}
