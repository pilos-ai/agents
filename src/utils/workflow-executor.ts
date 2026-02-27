import { api } from '../api'
import type { Node, Edge } from '@xyflow/react'
import type { ClaudeEvent } from '../types'
import type { WorkflowNodeData, WorkflowStepResult } from '../types/workflow'

// ── Execution Context ──

export interface ExecutionContext {
  /** In-memory variable store for variable nodes */
  variables: Record<string, unknown>
  /** Results keyed by nodeId for downstream consumption */
  nodeOutputs: Record<string, unknown>
  /** Working directory for CLI sessions */
  workingDirectory?: string
  /** Abort signal */
  aborted: boolean
}

// ── Callbacks to update UI ──

export interface ExecutionCallbacks {
  onNodeStart: (nodeId: string) => void
  onNodeComplete: (nodeId: string, result: WorkflowStepResult) => void
  onNodeFail: (nodeId: string, result: WorkflowStepResult) => void
  onLog: (message: string) => void
  onComplete: () => void
  onFail: (error: string) => void
  isAborted: () => boolean
}

// ── Graph helpers ──

function buildAdjacency(edges: Edge[]): Map<string, Edge[]> {
  const adj = new Map<string, Edge[]>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e)
  }
  return adj
}

function findNodeById(nodes: Node<WorkflowNodeData>[], id: string): Node<WorkflowNodeData> | undefined {
  return nodes.find((n) => n.id === id)
}

// ── Delay helper ──

function delayToMs(value: number, unit: string): number {
  switch (unit) {
    case 'ms': return value
    case 's': return value * 1000
    case 'min': return value * 60_000
    case 'h': return value * 3_600_000
    default: return value * 1000
  }
}

function timestamp(): string {
  return new Date().toLocaleTimeString()
}

// ── Direct Executors ──

async function executeDelay(node: Node<WorkflowNodeData>, ctx: ExecutionContext): Promise<unknown> {
  const ms = delayToMs(node.data.delayMs ?? 1, node.data.delayUnit as string ?? 's')
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    // Allow early abort
    const check = setInterval(() => {
      if (ctx.aborted) { clearTimeout(timer); clearInterval(check); resolve() }
    }, 200)
    setTimeout(() => clearInterval(check), ms + 100)
  })
  return { delayed: ms }
}

function executeVariable(node: Node<WorkflowNodeData>, ctx: ExecutionContext): unknown {
  const name = node.data.variableName || ''
  const value = node.data.variableValue ?? ''
  const op = node.data.variableOperation || 'set'

  switch (op) {
    case 'set':
      ctx.variables[name] = value
      break
    case 'append':
      ctx.variables[name] = String(ctx.variables[name] ?? '') + String(value)
      break
    case 'increment':
      ctx.variables[name] = (Number(ctx.variables[name]) || 0) + (Number(value) || 1)
      break
    case 'transform':
      // Simple template replacement: {{varName}} → value
      ctx.variables[name] = String(value).replace(/\{\{(\w+)\}\}/g, (_, k) => String(ctx.variables[k] ?? ''))
      break
  }

  return { variable: name, value: ctx.variables[name] }
}

function evaluateCondition(node: Node<WorkflowNodeData>, ctx: ExecutionContext): boolean {
  const expr = node.data.conditionExpression || ''
  const op = node.data.conditionOperator || 'equals'
  const target = node.data.conditionValue || ''

  // Resolve expression — could be a variable reference like {{varName}} or a direct value
  let resolved = expr.replace(/\{\{(\w+)\}\}/g, (_, k) => String(ctx.variables[k] ?? ''))

  switch (op) {
    case 'equals': return resolved === target
    case 'contains': return resolved.includes(target)
    case 'greater_than': return Number(resolved) > Number(target)
    case 'less_than': return Number(resolved) < Number(target)
    case 'regex': {
      try { return new RegExp(target).test(resolved) }
      catch { return false }
    }
    default: return resolved === target
  }
}

// ── MCP Tool Executor (via Claude CLI) ──

async function executeMcpTool(
  node: Node<WorkflowNodeData>,
  ctx: ExecutionContext,
  callbacks: ExecutionCallbacks,
): Promise<unknown> {
  const sessionId = `wf-exec-${node.id}-${Date.now()}`
  const toolName = node.data.toolId || node.data.label
  const params = node.data.parameters || {}

  // Build a structured prompt for Claude CLI to execute the tool
  const paramDesc = Object.entries(params)
    .map(([_, p]) => {
      const param = p as { key?: string; label?: string; value?: unknown }
      return `- ${param.label || param.key}: ${JSON.stringify(param.value)}`
    })
    .join('\n')

  const prompt = `Execute the following tool operation and return the result as JSON.

Tool: ${toolName}
Category: ${node.data.toolCategory || 'General'}
Description: ${node.data.description || ''}
Parameters:
${paramDesc || '(none)'}

Context variables: ${JSON.stringify(ctx.variables)}

Execute this operation using available MCP tools or appropriate system commands. Return ONLY the JSON result.`

  return new Promise<unknown>((resolve, reject) => {
    let resultText = ''

    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      if (event.sessionId !== sessionId) return

      if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string }
        if (delta?.type === 'text_delta' && delta.text) {
          resultText += delta.text
        }
      }

      if (event.type === 'result') {
        unsub()

        // Extract text from result
        const rawResult = event.result
        let finalText = resultText

        if (typeof rawResult === 'string') {
          finalText = rawResult
        } else if (rawResult && typeof rawResult === 'object') {
          const resultObj = rawResult as { content?: Array<{ type: string; text?: string }> }
          if (resultObj.content) {
            const extracted = resultObj.content
              .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
              .map((b) => b.text)
              .join('')
            if (extracted) finalText = extracted
          }
        }

        // Try to parse as JSON, otherwise return as text
        try {
          resolve(JSON.parse(finalText))
        } catch {
          resolve({ result: finalText })
        }
      }
    })

    api.claude.startSession(sessionId, {
      prompt,
      resume: false,
      workingDirectory: ctx.workingDirectory,
      model: 'haiku',
      permissionMode: 'bypass',
    }).catch((err) => {
      unsub()
      reject(new Error(`CLI session failed: ${err instanceof Error ? err.message : 'Unknown error'}`))
    })

    // Timeout after 60s
    setTimeout(() => {
      if (!ctx.aborted) {
        api.claude.abort(sessionId)
        unsub()
        reject(new Error('MCP tool execution timed out (60s)'))
      }
    }, 60_000)
  })
}

// ── Main Execution Engine ──

export async function executeWorkflow(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  callbacks: ExecutionCallbacks,
  workingDirectory?: string,
): Promise<void> {
  const ctx: ExecutionContext = {
    variables: {},
    nodeOutputs: {},
    workingDirectory,
    aborted: false,
  }

  const adj = buildAdjacency(edges)

  // Find start node
  const startNode = nodes.find((n) => n.data.type === 'start')
  if (!startNode) {
    callbacks.onFail('No start node found')
    return
  }

  callbacks.onLog(`[${timestamp()}] [INFO] Starting workflow execution...`)

  // Execute from start node
  try {
    await executeNode(startNode.id, nodes, adj, ctx, callbacks)

    if (ctx.aborted) {
      callbacks.onFail('Execution aborted by user')
    } else {
      callbacks.onLog(`[${timestamp()}] [INFO] Workflow completed successfully.`)
      callbacks.onComplete()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    callbacks.onLog(`[${timestamp()}] [ERROR] Workflow failed: ${msg}`)
    callbacks.onFail(msg)
  }
}

async function executeNode(
  nodeId: string,
  nodes: Node<WorkflowNodeData>[],
  adj: Map<string, Edge[]>,
  ctx: ExecutionContext,
  callbacks: ExecutionCallbacks,
): Promise<void> {
  if (ctx.aborted || callbacks.isAborted()) {
    ctx.aborted = true
    return
  }

  const node = findNodeById(nodes, nodeId)
  if (!node) return

  const type = node.data.type
  const startTime = Date.now()

  // Skip notes — they are annotations only
  if (type === 'note') {
    // Continue to next connected nodes
    const outEdges = adj.get(nodeId) || []
    for (const edge of outEdges) {
      await executeNode(edge.target, nodes, adj, ctx, callbacks)
    }
    return
  }

  // Start node — just flow through
  if (type === 'start') {
    callbacks.onLog(`[${timestamp()}] [INFO] Workflow started`)
    callbacks.onNodeStart(nodeId)
    const result: WorkflowStepResult = {
      nodeId,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0,
    }
    callbacks.onNodeComplete(nodeId, result)

    const outEdges = adj.get(nodeId) || []
    for (const edge of outEdges) {
      await executeNode(edge.target, nodes, adj, ctx, callbacks)
    }
    return
  }

  // End node — mark complete and stop
  if (type === 'end') {
    callbacks.onNodeStart(nodeId)
    const result: WorkflowStepResult = {
      nodeId,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0,
    }
    callbacks.onNodeComplete(nodeId, result)
    return
  }

  // All other nodes — execute with error handling
  callbacks.onNodeStart(nodeId)
  callbacks.onLog(`[${timestamp()}] [INFO] Executing: ${node.data.label || type}`)

  try {
    let output: unknown

    switch (type) {
      case 'delay':
        output = await executeDelay(node, ctx)
        break

      case 'variable':
        output = executeVariable(node, ctx)
        break

      case 'condition': {
        const condResult = evaluateCondition(node, ctx)
        output = { condition: condResult }
        callbacks.onLog(`[${timestamp()}] [INFO] Condition evaluated: ${condResult ? 'YES' : 'NO'}`)

        const condEdges = adj.get(nodeId) || []
        const yesEdge = condEdges.find((e) => e.sourceHandle === 'yes')
        const noEdge = condEdges.find((e) => e.sourceHandle === 'no')

        const result: WorkflowStepResult = {
          nodeId,
          status: 'completed',
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          output,
          duration: Date.now() - startTime,
        }
        callbacks.onNodeComplete(nodeId, result)
        ctx.nodeOutputs[nodeId] = output

        // Follow the appropriate branch
        const nextEdge = condResult ? yesEdge : noEdge
        if (nextEdge) {
          await executeNode(nextEdge.target, nodes, adj, ctx, callbacks)
        }
        return // Don't fall through to default edge following
      }

      case 'loop': {
        const loopType = node.data.loopType || 'count'
        const loopEdges = adj.get(nodeId) || []
        const bodyEdge = loopEdges.find((e) => e.sourceHandle === 'body')
        const doneEdge = loopEdges.find((e) => e.sourceHandle === 'done')

        let iterations = 0

        if (loopType === 'count') {
          const count = node.data.loopCount ?? 3
          callbacks.onLog(`[${timestamp()}] [INFO] Loop: ${count} iterations`)
          for (let i = 0; i < count && !ctx.aborted; i++) {
            ctx.variables['_loopIndex'] = i
            ctx.variables['_loopIteration'] = i + 1
            if (bodyEdge) {
              await executeNode(bodyEdge.target, nodes, adj, ctx, callbacks)
            }
            iterations++
          }
        } else if (loopType === 'collection') {
          const collectionRef = node.data.loopCollection || ''
          let items: unknown[]
          try {
            const resolved = collectionRef.replace(/\{\{(\w+)\}\}/g, (_, k) => String(ctx.variables[k] ?? '[]'))
            items = JSON.parse(resolved)
            if (!Array.isArray(items)) items = [items]
          } catch {
            items = []
          }
          callbacks.onLog(`[${timestamp()}] [INFO] Loop: ${items.length} collection items`)
          for (let i = 0; i < items.length && !ctx.aborted; i++) {
            ctx.variables['_loopIndex'] = i
            ctx.variables['_loopItem'] = items[i]
            if (bodyEdge) {
              await executeNode(bodyEdge.target, nodes, adj, ctx, callbacks)
            }
            iterations++
          }
        } else if (loopType === 'while') {
          const maxIterations = 100 // safety limit
          callbacks.onLog(`[${timestamp()}] [INFO] Loop: while condition (max ${maxIterations})`)
          while (!ctx.aborted && iterations < maxIterations) {
            const condExpr = node.data.loopCondition || ''
            const resolved = condExpr.replace(/\{\{(\w+)\}\}/g, (_, k) => String(ctx.variables[k] ?? ''))
            if (resolved === 'false' || resolved === '' || resolved === '0') break
            ctx.variables['_loopIndex'] = iterations
            if (bodyEdge) {
              await executeNode(bodyEdge.target, nodes, adj, ctx, callbacks)
            }
            iterations++
          }
        }

        output = { loopType, iterations }
        const loopResult: WorkflowStepResult = {
          nodeId,
          status: 'completed',
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          output,
          duration: Date.now() - startTime,
        }
        callbacks.onNodeComplete(nodeId, loopResult)
        ctx.nodeOutputs[nodeId] = output

        // After loop completes, follow the "done" edge
        if (doneEdge && !ctx.aborted) {
          await executeNode(doneEdge.target, nodes, adj, ctx, callbacks)
        }
        return
      }

      case 'parallel': {
        const parallelEdges = adj.get(nodeId) || []
        callbacks.onLog(`[${timestamp()}] [INFO] Forking into ${parallelEdges.length} parallel branches`)

        // Execute all branches concurrently
        const branchPromises = parallelEdges.map((edge) =>
          executeNode(edge.target, nodes, adj, ctx, callbacks)
        )
        await Promise.all(branchPromises)

        output = { branches: parallelEdges.length }
        const parallelResult: WorkflowStepResult = {
          nodeId,
          status: 'completed',
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          output,
          duration: Date.now() - startTime,
        }
        callbacks.onNodeComplete(nodeId, parallelResult)
        ctx.nodeOutputs[nodeId] = output
        return // Branches already followed
      }

      case 'merge': {
        // Merge just passes through — the parallel Promise.all ensures all branches complete
        output = { merged: true }
        break
      }

      case 'mcp_tool': {
        output = await executeMcpTool(node, ctx, callbacks)
        break
      }

      default:
        output = { skipped: true, reason: `Unknown node type: ${type}` }
        callbacks.onLog(`[${timestamp()}] [WARN] Skipping unknown node type: ${type}`)
    }

    // Store output
    ctx.nodeOutputs[nodeId] = output

    const result: WorkflowStepResult = {
      nodeId,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      output,
      duration: Date.now() - startTime,
    }
    callbacks.onNodeComplete(nodeId, result)
    callbacks.onLog(`[${timestamp()}] [INFO] Completed: ${node.data.label || type} (${Date.now() - startTime}ms)`)

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    const result: WorkflowStepResult = {
      nodeId,
      status: 'failed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      error: errorMsg,
      duration: Date.now() - startTime,
    }

    callbacks.onLog(`[${timestamp()}] [ERROR] Failed: ${node.data.label || type} — ${errorMsg}`)

    // Check error handling config
    const errConfig = node.data.errorHandling
    if (errConfig?.failureAction === 'skip') {
      callbacks.onNodeComplete(nodeId, { ...result, status: 'skipped' })
    } else if (errConfig?.autoRetry && (errConfig.maxRetries ?? 0) > 0) {
      callbacks.onLog(`[${timestamp()}] [INFO] Retrying ${node.data.label}...`)
      // For retry, we re-execute (simplified — only 1 retry level)
      try {
        callbacks.onNodeStart(nodeId)
        const retryOutput = await executeSingleNode(node, ctx, callbacks)
        ctx.nodeOutputs[nodeId] = retryOutput
        const retryResult: WorkflowStepResult = {
          nodeId,
          status: 'completed',
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          output: retryOutput,
          duration: Date.now() - startTime,
        }
        callbacks.onNodeComplete(nodeId, retryResult)
      } catch {
        callbacks.onNodeFail(nodeId, result)
        throw err
      }
    } else {
      callbacks.onNodeFail(nodeId, result)
      throw err
    }
  }

  // Follow outgoing edges (default — non-branching)
  const outEdges = adj.get(nodeId) || []
  for (const edge of outEdges) {
    if (ctx.aborted) break
    await executeNode(edge.target, nodes, adj, ctx, callbacks)
  }
}

/** Execute a single node's logic (used for retries) */
async function executeSingleNode(
  node: Node<WorkflowNodeData>,
  ctx: ExecutionContext,
  callbacks: ExecutionCallbacks,
): Promise<unknown> {
  switch (node.data.type) {
    case 'delay': return executeDelay(node, ctx)
    case 'variable': return executeVariable(node, ctx)
    case 'mcp_tool': return executeMcpTool(node, ctx, callbacks)
    case 'merge': return { merged: true }
    default: return { executed: true }
  }
}

/** Abort a running workflow by marking context as aborted */
export function abortExecution(ctx: ExecutionContext): void {
  ctx.aborted = true
}
