import type { Node, Edge } from '@xyflow/react'

// ── Node Types ──

export type WorkflowNodeType = 'start' | 'end' | 'mcp_tool' | 'condition' | 'loop' | 'delay' | 'parallel' | 'merge' | 'variable' | 'note'

export interface WorkflowParameter {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'json' | 'select'
  value: unknown
  format?: 'json' | 'csv' | 'yaml' | 'text'
  required?: boolean
  options?: { value: string; label: string }[]
}

export interface WorkflowNodeData {
  [key: string]: unknown  // Required by React Flow's Record<string, unknown> constraint
  type: WorkflowNodeType
  label: string
  description?: string
  toolId?: string
  toolCategory?: string
  toolIcon?: string
  parameters?: Record<string, WorkflowParameter>
  errorHandling?: {
    autoRetry: boolean
    maxRetries: number
    failureAction: 'stop' | 'skip' | 'jump'
    failureJumpNodeId?: string
  }
  conditionExpression?: string
  conditionOperator?: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'regex'
  conditionValue?: string
  // Loop
  loopType?: 'count' | 'collection' | 'while'
  loopCount?: number
  loopCollection?: string
  loopCondition?: string
  // Delay
  delayMs?: number
  delayUnit?: 'ms' | 's' | 'min' | 'h'
  // Variable
  variableName?: string
  variableValue?: string
  variableOperation?: 'set' | 'append' | 'increment' | 'transform'
  // Note
  noteText?: string
  executionStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
}

// ── Workflow Definition (persisted on Task) ──

export type WorkflowNode = Node<WorkflowNodeData>
export type WorkflowEdge = Edge

export interface WorkflowDefinition {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  viewport?: { x: number; y: number; zoom: number }
}

// ── Workflow Execution ──

export type WorkflowExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

export interface WorkflowStepResult {
  nodeId: string
  status: 'completed' | 'failed' | 'skipped'
  startedAt: string
  completedAt: string
  output?: unknown
  error?: string
  duration: number
}

export interface WorkflowExecution {
  id: string
  taskId: string
  status: WorkflowExecutionStatus
  currentNodeId: string | null
  currentStep: number
  totalSteps: number
  stepResults: WorkflowStepResult[]
  startedAt: string
  completedAt?: string
  logs: string[]
}

// ── MCP Tool Catalog ──

export interface McpToolDefinition {
  id: string
  name: string
  icon: string
  description: string
  category: string
  parameters: WorkflowParameter[]
}

export interface McpToolCategory {
  name: string
  icon: string
  tools: McpToolDefinition[]
}
