import { api } from '../api'
import type { Node, Edge } from '@xyflow/react'
import type { ClaudeEvent } from '../types'
import type { WorkflowNodeData, WorkflowParameter, WorkflowStepResult } from '../types/workflow'
import { WORKFLOW_TOOL_CATEGORIES } from '../data/workflow-tools'

// ── Execution Context ──

export interface ExecutionContext {
  /** In-memory variable store for variable nodes */
  variables: Record<string, unknown>
  /** Results keyed by nodeId for downstream consumption */
  nodeOutputs: Record<string, unknown>
  /** Working directory for CLI sessions */
  workingDirectory?: string
  /** MCP config path for CLI sessions to access MCP tools (Jira, etc.) */
  mcpConfigPath?: string
  /** Jira project key for creating issues */
  jiraProjectKey?: string
  /** Abort signal */
  aborted: boolean
  /** Track how many times each node has been visited to detect infinite cycles */
  visitCounts: Record<string, number>
  /** Track Jira issue summaries created during this run (for dedup within a single execution) */
  createdIssueSummaries: Set<string>
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
  /** When true, tool nodes log what they would do but don't execute API calls */
  dryRun?: boolean
  /** When true, execution pauses after each node and waits for debugStep/debugContinue */
  debugMode?: boolean
  /** Called when debug mode pauses — resolve the returned promise to advance */
  onDebugPause?: (nodeId: string) => Promise<'step' | 'continue'>
}

// ── Graph helpers ──

export function buildAdjacency(edges: Edge[]): Map<string, Edge[]> {
  const adj = new Map<string, Edge[]>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e)
  }
  return adj
}

/** Build reverse adjacency: target → edges pointing TO it */
export function buildReverseAdjacency(edges: Edge[]): Map<string, Edge[]> {
  const rev = new Map<string, Edge[]>()
  for (const e of edges) {
    if (!rev.has(e.target)) rev.set(e.target, [])
    rev.get(e.target)!.push(e)
  }
  return rev
}

function findNodeById(nodes: Node<WorkflowNodeData>[], id: string): Node<WorkflowNodeData> | undefined {
  return nodes.find((n) => n.id === id)
}

// ── Delay helper ──

export function delayToMs(value: number, unit: string): number {
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

/** Resolve a dotted path like "files.length" or "data.count" against an object */
export function resolvePath(obj: unknown, path: string): unknown {
  let current: unknown = obj
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Resolve a template reference against ctx (variables first, then nodeOutputs) */
export function resolveRef(ref: string, ctx: ExecutionContext): string | undefined {
  // Check variables first (simple key)
  if (ctx.variables[ref] !== undefined) {
    return String(ctx.variables[ref])
  }
  // Try dotted path: "NODE_ID.prop.subprop" or "varName.prop"
  const dotIdx = ref.indexOf('.')
  if (dotIdx !== -1) {
    const root = ref.slice(0, dotIdx)
    const path = ref.slice(dotIdx + 1)
    for (const store of [ctx.nodeOutputs, ctx.variables]) {
      if (store[root] !== undefined) {
        const val = resolvePath(store[root], path)
        if (val !== undefined) return String(val)
      }
    }
  }
  // Check nodeOutputs as direct key (no dot path)
  if (ctx.nodeOutputs[ref] !== undefined) {
    const val = ctx.nodeOutputs[ref]
    return typeof val === 'object' ? JSON.stringify(val) : String(val)
  }
  return undefined
}

export function evaluateCondition(node: Node<WorkflowNodeData>, ctx: ExecutionContext, incomingEdges: Edge[], callbacks?: ExecutionCallbacks): boolean {
  const expr = node.data.conditionExpression || ''
  const op = node.data.conditionOperator || 'equals'
  const target = node.data.conditionValue || ''

  // Step 1: Resolve {{ref}} templates
  let resolved = expr.replace(/\{\{([^}]+)\}\}/g, (_, ref: string) => {
    return resolveRef(ref, ctx) ?? ''
  })

  // Step 2: If no templates were found and expression is still a bare path
  // (e.g. "files.length", "count", "status"), try resolving against the
  // output of the upstream node that feeds into this condition.
  if (resolved === expr && !expr.includes('{{')) {
    const parentIds = incomingEdges.map((e) => e.source)
    for (const pid of parentIds) {
      if (ctx.nodeOutputs[pid] !== undefined) {
        const val = resolvePath(ctx.nodeOutputs[pid], expr)
        if (val !== undefined) {
          resolved = String(val)
          break
        }
      }
    }

    // If still unresolved, try fuzzy matching: the expression path root
    // might not match the actual key. e.g. expr = "files.length" but output
    // has "results" or "mdFiles". Try matching the tail (.length, .count, etc.)
    if (resolved === expr) {
      const parts = expr.split('.')
      const tail = parts.length > 1 ? parts.slice(1).join('.') : null

      for (const pid of parentIds) {
        const parentOut = ctx.nodeOutputs[pid]
        if (parentOut && typeof parentOut === 'object' && !Array.isArray(parentOut)) {
          const obj = parentOut as Record<string, unknown>

          // If tail is "length" or "count", find any array or count field
          if (tail === 'length') {
            for (const val of Object.values(obj)) {
              if (Array.isArray(val)) {
                resolved = String(val.length)
                break
              }
            }
          }
          // Try "count" as a direct field name
          if (resolved === expr && obj['count'] !== undefined) {
            resolved = String(obj['count'])
          }
          if (resolved !== expr) break
        }
      }
    }

    // Also check variables as bare path
    if (resolved === expr) {
      if (ctx.variables[expr] !== undefined) {
        resolved = String(ctx.variables[expr])
      }
    }
  }

  callbacks?.onLog?.(`[${timestamp()}] [DEBUG] Condition: "${expr}" (${op}) "${target}" → resolved="${resolved}"`)

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

// ── Tool Catalog Lookup ──

function findToolDef(toolId: string | undefined) {
  if (!toolId) return null
  for (const cat of WORKFLOW_TOOL_CATEGORIES) {
    const tool = cat.tools.find((t) => t.id === toolId)
    if (tool) return tool
  }
  return null
}

/** Resolve {{ref}} templates in a string against execution context */
export function resolveTemplates(text: string, ctx: ExecutionContext): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, ref: string) => {
    return resolveRef(ref, ctx) ?? ''
  })
}

// ── Direct Tool Executor (bypasses AI, calls API directly) ──

const DIRECT_TOOL_TIMEOUT_MS = 60_000

async function executeDirectTool(
  node: Node<WorkflowNodeData>,
  ctx: ExecutionContext,
  callbacks: ExecutionCallbacks,
): Promise<unknown> {
  return Promise.race([
    executeDirectToolInner(node, ctx, callbacks),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Direct tool "${node.data.label || node.data.toolId}" timed out after ${DIRECT_TOOL_TIMEOUT_MS / 1000}s`)), DIRECT_TOOL_TIMEOUT_MS)
    ),
  ])
}

async function executeDirectToolInner(
  node: Node<WorkflowNodeData>,
  ctx: ExecutionContext,
  callbacks: ExecutionCallbacks,
): Promise<unknown> {
  const toolId = node.data.toolId
  const tool = findToolDef(toolId)
  if (!tool?.direct) throw new Error(`No direct handler for ${toolId}`)

  // Resolve parameter values (substitute {{_loopItem.key}}, {{NODE_ID.field}}, etc.)
  const resolvedParams: Record<string, unknown> = {}
  for (const [key, param] of Object.entries(node.data.parameters || {})) {
    const p = param as WorkflowParameter
    let val = p.value
    if (typeof val === 'string') {
      val = resolveTemplates(val, ctx)
    }
    resolvedParams[key] = val
  }

  // Log resolved params for debugging
  const paramSummary = Object.entries(resolvedParams)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v.slice(0, 80)}"` : JSON.stringify(v)}`)
    .join(', ')
  callbacks.onLog(`[${timestamp()}] [INFO] Direct API call: ${tool.direct.handler} (${paramSummary})`)

  // Ensure Jira API is available for jira.* handlers
  if (tool.direct.handler.startsWith('jira.') && !api.jira) {
    throw new Error('Jira API is not available — check Jira connection')
  }

  switch (tool.direct.handler) {
    case 'jira.getIssues': {
      const jql = String(resolvedParams.jql || '')
      const results = await api.jira!.getIssues(jql)
      const issues = Array.isArray(results) ? results : []
      callbacks.onLog(`[${timestamp()}] [INFO] Jira search returned ${issues.length} issues`)
      return { status: 'success', count: issues.length, results: issues }
    }

    case 'jira.getIssue': {
      const issueKey = String(resolvedParams.issueKey || '')
      const issue = await api.jira!.getIssue(issueKey)
      return { status: 'success', issue }
    }

    case 'jira.createIssue': {
      const summary = String(resolvedParams.summary || '')
      const description = String(resolvedParams.description || '')
      const issueType = String(resolvedParams.issueType || 'Task')
      const projectKey = ctx.jiraProjectKey || ''

      if (!projectKey) {
        return { status: 'error', message: 'No Jira project key configured' }
      }
      if (!summary.trim()) {
        return { status: 'error', message: 'Summary is required to create a Jira issue. Set the summary parameter or use {{_loopItem.summary}} in a loop.' }
      }

      // Deduplication layer 1: local tracking (catches duplicates within the same run)
      const dedupKey = `${projectKey}::${summary}`
      if (ctx.createdIssueSummaries.has(dedupKey)) {
        callbacks.onLog(`[${timestamp()}] [INFO] Skipped duplicate (same run): "${summary.slice(0, 80)}"`)
        return { status: 'success', skipped: true, reason: 'Duplicate within same execution' }
      }

      // Deduplication layer 2: JQL search (catches duplicates from previous runs)
      try {
        const escapedSummary = summary.replace(/"/g, '\\"')
        const jql = `project = "${projectKey}" AND summary ~ "${escapedSummary}" ORDER BY created DESC`
        const existing = await api.jira!.getIssues(jql)
        const exactMatch = existing.find((issue) => issue.summary === summary)
        if (exactMatch) {
          callbacks.onLog(`[${timestamp()}] [INFO] Skipped duplicate: "${summary.slice(0, 80)}" already exists as ${exactMatch.key}`)
          return { status: 'success', result: exactMatch, skipped: true, existingKey: exactMatch.key }
        }
      } catch {
        // If search fails, proceed with creation (best-effort dedup)
      }

      const result = await api.jira!.createIssue(projectKey, summary, description, issueType)
      ctx.createdIssueSummaries.add(dedupKey)
      callbacks.onLog(`[${timestamp()}] [INFO] Created Jira issue in ${projectKey}`)
      return { status: 'success', result }
    }

    case 'jira.transitionIssue': {
      const issueKey = String(resolvedParams.issueKey || '')
      const targetStatus = String(resolvedParams.status || '')

      if (!issueKey) return { status: 'error', message: 'Issue key is required' }
      if (!targetStatus) return { status: 'error', message: 'Target status is required' }

      // Resolve transition name → ID
      const transitions = await api.jira!.getTransitions(issueKey)
      const transArr = Array.isArray(transitions) ? transitions : []
      const match = transArr.find((t: { id: string; name?: string; to?: { name?: string } }) =>
        t.name?.toLowerCase() === targetStatus.toLowerCase() ||
        t.to?.name?.toLowerCase() === targetStatus.toLowerCase()
      )

      if (!match) {
        const available = transArr.map((t: { name?: string; to?: { name?: string } }) =>
          t.to?.name || t.name || 'unknown'
        )
        callbacks.onLog(`[${timestamp()}] [WARN] Transition "${targetStatus}" not available for ${issueKey}. Available: ${available.join(', ')}`)
        return {
          status: 'error',
          message: `Target status "${targetStatus}" not available for ${issueKey}`,
          availableTransitions: available,
          issueKey,
        }
      }

      await api.jira!.transitionIssue(issueKey, match.id)
      callbacks.onLog(`[${timestamp()}] [INFO] Transitioned ${issueKey} → ${targetStatus}`)
      return { status: 'success', issueKey, newStatus: targetStatus, transitionId: match.id }
    }

    case 'jira.getTransitions': {
      const issueKey = String(resolvedParams.issueKey || '')
      const transitions = await api.jira!.getTransitions(issueKey)
      return { status: 'success', issueKey, transitions }
    }

    case 'files.read': {
      const rawPath = String(resolvedParams.path || '')
      if (!rawPath) return { status: 'error', message: 'File path is required' }

      // Resolve relative paths against working directory
      const targetPath = rawPath.startsWith('/') ? rawPath : `${ctx.workingDirectory || '.'}/${rawPath}`
      const recursive = resolvedParams.recursive === true || resolvedParams.recursive === 'true'

      // Try reading as file first, then as directory
      try {
        const content = await api.files.readFile(targetPath)
        callbacks.onLog(`[${timestamp()}] [INFO] Read file: ${targetPath} (${content.length} chars)`)
        return { status: 'success', path: targetPath, content, type: 'file' }
      } catch {
        // Not a file — try as directory
        try {
          const entries = await api.files.readDir(targetPath, recursive)
          callbacks.onLog(`[${timestamp()}] [INFO] Read directory: ${targetPath} (${entries.length} entries)`)
          return { status: 'success', path: targetPath, entries, type: 'directory', count: entries.length }
        } catch (dirErr) {
          throw new Error(`Cannot read path "${targetPath}": ${dirErr instanceof Error ? dirErr.message : 'Not found'}`)
        }
      }
    }

    default:
      throw new Error(`Unknown direct handler: ${tool.direct.handler}`)
  }
}

// ── AI Prompt Executor (user-defined prompt sent to Claude) ──

async function executeAiPrompt(
  node: Node<WorkflowNodeData>,
  ctx: ExecutionContext,
  callbacks: ExecutionCallbacks,
): Promise<unknown> {
  const rawPrompt = node.data.aiPrompt || ''
  if (!rawPrompt.trim()) {
    return { status: 'error', message: 'AI prompt is empty' }
  }

  // Resolve templates in the prompt
  const resolvedPrompt = resolveTemplates(rawPrompt, ctx)

  // Include upstream context
  const nodeOutputsSummary = Object.entries(ctx.nodeOutputs)
    .map(([id, output]) => {
      const str = JSON.stringify(output)
      return `  ${id}: ${str.length > 1000 ? str.slice(0, 1000) + '...' : str}`
    })
    .join('\n')

  const fullPrompt = `${resolvedPrompt}

Context variables: ${JSON.stringify(ctx.variables)}
Current loop item: ${JSON.stringify(ctx.variables['_loopItem'] ?? null)}

Previous step outputs:
${nodeOutputsSummary || '(none)'}

IMPORTANT: Execute this immediately. Do NOT ask for clarification. Return your response as JSON if possible.`

  const model = node.data.aiModel || 'sonnet'
  callbacks.onLog(`[${timestamp()}] [INFO] AI prompt (${model}): ${resolvedPrompt.slice(0, 100)}${resolvedPrompt.length > 100 ? '...' : ''}`)

  // Reuse the existing MCP tool execution pattern
  const sessionId = `wf-ai-${node.id}-${Date.now()}`

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

        // Try to parse as JSON
        let textToParse = finalText
        const codeBlockMatch = finalText.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
        if (codeBlockMatch) {
          textToParse = codeBlockMatch[1].trim()
        }

        try {
          resolve(JSON.parse(textToParse))
        } catch {
          resolve({ result: finalText })
        }
      }
    })

    api.claude.startSession(sessionId, {
      prompt: fullPrompt,
      resume: false,
      workingDirectory: ctx.workingDirectory,
      model,
      permissionMode: 'bypass',
      mcpConfigPath: ctx.mcpConfigPath,
    }).catch((err) => {
      unsub()
      reject(new Error(`AI session failed: ${err instanceof Error ? err.message : 'Unknown error'}`))
    })

    setTimeout(() => {
      if (!ctx.aborted) {
        api.claude.abort(sessionId)
        unsub()
        reject(new Error('AI prompt execution timed out (300s)'))
      }
    }, 300_000)
  })
}

// ── MCP Tool Executor (via Claude CLI — fallback for tools without direct handler) ──

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

  // Include upstream node outputs so Claude has the data to work with
  const nodeOutputsSummary = Object.entries(ctx.nodeOutputs)
    .map(([id, output]) => {
      const str = JSON.stringify(output)
      return `  ${id}: ${str.length > 1000 ? str.slice(0, 1000) + '...' : str}`
    })
    .join('\n')

  const jiraLine = ctx.jiraProjectKey ? `\nJira Project Key: ${ctx.jiraProjectKey} (use this for ALL Jira operations)\n` : ''

  const prompt = `Execute this tool operation immediately. Do NOT ask questions or request confirmation — just execute it.

Tool: ${toolName}
Category: ${node.data.toolCategory || 'General'}
Description: ${node.data.description || ''}
Parameters:
${paramDesc || '(none)'}
${jiraLine}
Current loop item: ${JSON.stringify(ctx.variables['_loopItem'] ?? null)}
Context variables: ${JSON.stringify(ctx.variables)}

Previous step outputs:
${nodeOutputsSummary || '(none)'}

IMPORTANT: Execute this operation right now using the available MCP tools or system commands. Do NOT ask for clarification. Make reasonable assumptions if needed. Return ONLY the JSON result.`

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

        // Strip markdown code blocks before parsing
        let textToParse = finalText
        const codeBlockMatch = finalText.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
        if (codeBlockMatch) {
          textToParse = codeBlockMatch[1].trim()
        }

        // Detect tool-not-available errors (Claude saying it can't find the tool)
        // Use specific patterns to avoid false positives from API error messages
        // (e.g. Jira returning "status not available" is a valid tool error, not a missing tool)
        const lowerText = finalText.toLowerCase()
        const isToolMissing =
          lowerText.includes('tool not found') ||
          lowerText.includes("don't have access to a tool") ||
          lowerText.includes("don't have access to the tool") ||
          lowerText.includes("don't have a tool called") ||
          lowerText.includes('no tool named') ||
          lowerText.includes('is not available as a tool') ||
          lowerText.includes('tool is not available')
        if (isToolMissing) {
          reject(new Error(`MCP tool unavailable: ${toolName} — ${finalText.slice(0, 200)}`))
          return
        }

        // Try to parse as JSON, otherwise return as text
        try {
          resolve(JSON.parse(textToParse))
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
      mcpConfigPath: ctx.mcpConfigPath,
    }).catch((err) => {
      unsub()
      reject(new Error(`CLI session failed: ${err instanceof Error ? err.message : 'Unknown error'}`))
    })

    // Timeout after 120s (MCP tools like Jira need more time)
    setTimeout(() => {
      if (!ctx.aborted) {
        api.claude.abort(sessionId)
        unsub()
        reject(new Error('MCP tool execution timed out (120s)'))
      }
    }, 120_000)
  })
}

// ── Agent Executor (full Claude Code session — the universal block) ──

async function executeAgent(
  node: Node<WorkflowNodeData>,
  ctx: ExecutionContext,
  callbacks: ExecutionCallbacks,
): Promise<unknown> {
  const rawPrompt = node.data.agentPrompt || ''
  if (!rawPrompt.trim()) {
    return { status: 'error', message: 'Agent prompt is empty' }
  }

  const resolvedPrompt = resolveTemplates(rawPrompt, ctx)

  // Build rich context from upstream outputs
  const nodeOutputsSummary = Object.entries(ctx.nodeOutputs)
    .map(([id, output]) => {
      const str = JSON.stringify(output)
      return `  ${id}: ${str.length > 2000 ? str.slice(0, 2000) + '...' : str}`
    })
    .join('\n')

  const fullPrompt = `${resolvedPrompt}

Context variables: ${JSON.stringify(ctx.variables)}
Current loop item: ${JSON.stringify(ctx.variables['_loopItem'] ?? null)}

Previous step outputs:
${nodeOutputsSummary || '(none)'}

IMPORTANT: You are running as an autonomous agent in a workflow. Execute the task immediately without asking for clarification. Use all available tools (file editing, bash commands, git, etc.) as needed. When done, provide a summary of what you accomplished.`

  const model = node.data.agentModel || 'sonnet'
  const maxTurns = node.data.agentMaxTurns || 25
  const permissionMode = node.data.agentPermissionMode || 'bypass'
  callbacks.onLog(`[${timestamp()}] [INFO] Agent session (${model}, max ${maxTurns} turns): ${resolvedPrompt.slice(0, 150)}${resolvedPrompt.length > 150 ? '...' : ''}`)

  const sessionId = `wf-agent-${node.id}-${Date.now()}`
  const toolsUsed: string[] = []

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

      // Track tool usage
      if (event.type === 'assistant') {
        const msg = event.message as { content?: Array<{ type: string; name?: string }> }
        if (msg?.content) {
          for (const block of msg.content) {
            if (block.type === 'tool_use' && block.name) {
              if (!toolsUsed.includes(block.name)) toolsUsed.push(block.name)
            }
          }
        }
      }

      if (event.type === 'result') {
        unsub()

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

        callbacks.onLog(`[${timestamp()}] [INFO] Agent completed. Tools used: ${toolsUsed.join(', ') || 'none'}`)

        // Try to parse as JSON, otherwise return as text with metadata
        let textToParse = finalText
        const codeBlockMatch = finalText.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
        if (codeBlockMatch) {
          textToParse = codeBlockMatch[1].trim()
        }

        try {
          const parsed = JSON.parse(textToParse)
          resolve({ ...parsed, toolsUsed })
        } catch {
          resolve({ result: finalText, toolsUsed })
        }
      }
    })

    api.claude.startSession(sessionId, {
      prompt: fullPrompt,
      resume: false,
      workingDirectory: ctx.workingDirectory,
      model,
      permissionMode,
      mcpConfigPath: ctx.mcpConfigPath,
      maxTurns,
    }).catch((err) => {
      unsub()
      reject(new Error(`Agent session failed: ${err instanceof Error ? err.message : 'Unknown error'}`))
    })

    // Agent sessions get a longer timeout (10 min) since they do multi-step work
    setTimeout(() => {
      if (!ctx.aborted) {
        api.claude.abort(sessionId)
        unsub()
        reject(new Error('Agent session timed out (600s)'))
      }
    }, 600_000)
  })
}

// ── Main Execution Engine ──

export async function executeWorkflow(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  callbacks: ExecutionCallbacks,
  workingDirectory?: string,
  jiraProjectKeyOverride?: string,
): Promise<void> {
  // Generate MCP config so CLI sessions can access MCP tools (Jira, etc.)
  let mcpConfigPath: string | undefined
  let jiraProjectKey: string | undefined = jiraProjectKeyOverride
  try {
    if (workingDirectory) {
      const mcpResult = await api.mcp.writeConfig(workingDirectory, [])
      mcpConfigPath = mcpResult.configPath

      if (jiraProjectKey) {
        callbacks.onLog(`[${timestamp()}] [INFO] Jira project: ${jiraProjectKey} (selected by user)`)
      } else {
        // Fetch Jira project key — try saved board config first, then list projects
        const boardConfig = await api.jira?.getBoardConfig(workingDirectory)
        if (boardConfig?.projectKey) {
          jiraProjectKey = boardConfig.projectKey
          callbacks.onLog(`[${timestamp()}] [INFO] Jira project: ${jiraProjectKey} (from board config)`)
        } else {
          // No saved board config — set active project context and list available projects
          try {
            await api.jira?.setActiveProject(workingDirectory)
            const projects = await api.jira?.getProjects()
            if (projects && projects.length > 0) {
              const keys = projects.map((p: { key: string; name: string }) => `${p.key} (${p.name})`).join(', ')
              callbacks.onLog(`[${timestamp()}] [INFO] Available Jira projects: ${keys}`)
              jiraProjectKey = projects[0].key
              callbacks.onLog(`[${timestamp()}] [INFO] Using Jira project: ${jiraProjectKey}`)
            }
          } catch {
            callbacks.onLog(`[${timestamp()}] [DEBUG] Jira not connected or no projects available`)
          }
        }
      }
    }
  } catch {
    callbacks.onLog(`[${timestamp()}] [WARN] Could not generate MCP config — MCP tools may be unavailable`)
  }

  const ctx: ExecutionContext = {
    variables: {},
    nodeOutputs: {},
    workingDirectory,
    mcpConfigPath,
    jiraProjectKey,
    aborted: false,
    visitCounts: {},
    createdIssueSummaries: new Set(),
  }

  const adj = buildAdjacency(edges)
  const revAdj = buildReverseAdjacency(edges)

  // Find start node
  const startNode = nodes.find((n) => n.data.type === 'start')
  if (!startNode) {
    callbacks.onFail('No start node found')
    return
  }

  callbacks.onLog(`[${timestamp()}] [INFO] Starting workflow execution...`)

  // Execute from start node
  try {
    await executeNode(startNode.id, nodes, adj, revAdj, ctx, callbacks)

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
  revAdj: Map<string, Edge[]>,
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

  // Cycle detection: limit how many times a single node can be visited
  const MAX_NODE_VISITS = 50
  ctx.visitCounts[nodeId] = (ctx.visitCounts[nodeId] || 0) + 1
  if (ctx.visitCounts[nodeId] > MAX_NODE_VISITS) {
    callbacks.onLog(`[${timestamp()}] [WARN] Node "${node.data.label}" visited ${MAX_NODE_VISITS} times — stopping to prevent infinite loop`)
    return
  }

  // Skip notes — they are annotations only
  if (type === 'note') {
    // Continue to next connected nodes
    const outEdges = adj.get(nodeId) || []
    for (const edge of outEdges) {
      await executeNode(edge.target, nodes, adj, revAdj, ctx, callbacks)
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
      await executeNode(edge.target, nodes, adj, revAdj, ctx, callbacks)
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

  // Results Display node — collect upstream data and stop
  if (type === 'results_display') {
    callbacks.onNodeStart(nodeId)
    callbacks.onLog(`[${timestamp()}] [INFO] Collecting results for display: ${node.data.label || 'Results'}`)

    let displayData: unknown = null
    const source = (node.data.displaySource as string) || ''

    if (source) {
      // Resolve template reference
      let resolved = resolveTemplates(source, ctx)
      if (typeof resolved === 'string' && (resolved.startsWith('[') || resolved.startsWith('{'))) {
        try { resolved = JSON.parse(resolved) } catch { /* keep as string */ }
      }
      displayData = resolved
    } else {
      // Auto-collect: gather outputs from all upstream nodes
      const inEdges = revAdj.get(nodeId) || []
      const collected: Record<string, unknown> = {}
      for (const e of inEdges) {
        if (ctx.nodeOutputs[e.source] != null) {
          const srcNode = findNodeById(nodes, e.source)
          const label = srcNode?.data.label || e.source
          collected[label] = ctx.nodeOutputs[e.source]
        }
      }
      displayData = Object.keys(collected).length === 1 ? Object.values(collected)[0] : collected
    }

    ctx.nodeOutputs[nodeId] = displayData

    const result: WorkflowStepResult = {
      nodeId,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      output: displayData,
      duration: Date.now() - startTime,
    }
    callbacks.onNodeComplete(nodeId, result)
    return // Terminal node — don't follow outgoing edges
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
        const incomingEdges = revAdj.get(nodeId) || []
        const condResult = evaluateCondition(node, ctx, incomingEdges, callbacks)
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
          await executeNode(nextEdge.target, nodes, adj, revAdj, ctx, callbacks)
        }
        return // Don't fall through to default edge following
      }

      case 'loop': {
        const loopType = node.data.loopType || 'count'
        const loopEdges = adj.get(nodeId) || []
        const bodyEdge = loopEdges.find((e) => e.sourceHandle === 'body')
        const doneEdge = loopEdges.find((e) => e.sourceHandle === 'done')

        let iterations = 0
        let failedIterations = 0

        if (loopType === 'count') {
          const count = node.data.loopCount ?? 3
          callbacks.onLog(`[${timestamp()}] [INFO] Loop: ${count} iterations`)
          for (let i = 0; i < count && !ctx.aborted; i++) {
            ctx.variables['_loopIndex'] = i
            ctx.variables['_loopIteration'] = i + 1
            // Expose iteration state so body nodes can reference {{LOOP_ID.currentIndex}}
            ctx.nodeOutputs[nodeId] = { loopType, currentIndex: i, currentIteration: i + 1 }
            if (bodyEdge) {
              try {
                await executeNode(bodyEdge.target, nodes, adj, revAdj, ctx, callbacks)
              } catch (iterErr) {
                failedIterations++
                const msg = iterErr instanceof Error ? iterErr.message : 'Unknown error'
                callbacks.onLog(`[${timestamp()}] [WARN] Loop iteration ${i} failed: ${msg}`)
              }
            }
            iterations++
          }
        } else if (loopType === 'collection') {
          let collectionRef = node.data.loopCollection || ''

          // Auto-detect: if loopCollection is empty, walk up the graph to find
          // the nearest ancestor whose output contains an array
          if (!collectionRef) {
            const visited = new Set<string>()
            const queue = [nodeId]
            while (queue.length > 0 && !collectionRef) {
              const current = queue.shift()!
              if (visited.has(current)) continue
              visited.add(current)
              const inEdges = revAdj.get(current) || []
              for (const edge of inEdges) {
                const parentOutput = ctx.nodeOutputs[edge.source]
                if (parentOutput && typeof parentOutput === 'object' && !Array.isArray(parentOutput)) {
                  for (const [key, val] of Object.entries(parentOutput as Record<string, unknown>)) {
                    if (Array.isArray(val) && val.length > 0) {
                      collectionRef = `{{${edge.source}.${key}}}`
                      callbacks.onLog(`[${timestamp()}] [DEBUG] Auto-detected loop collection: ${collectionRef}`)
                      break
                    }
                  }
                } else if (Array.isArray(parentOutput) && parentOutput.length > 0) {
                  collectionRef = `{{${edge.source}}}`
                  callbacks.onLog(`[${timestamp()}] [DEBUG] Auto-detected loop collection: ${collectionRef}`)
                }
                if (collectionRef) break
                queue.push(edge.source)
              }
            }
          }

          let items: unknown[]
          try {
            // Resolve {{nodeId.path}} and {{varName}} references
            let resolved = collectionRef.replace(/\{\{([^}]+)\}\}/g, (_, ref: string) => {
              // Check variables first
              if (ctx.variables[ref] !== undefined) return JSON.stringify(ctx.variables[ref])
              // Try nodeOutputs with dotted path
              const dotIdx = ref.indexOf('.')
              if (dotIdx !== -1) {
                const nid = ref.slice(0, dotIdx)
                const path = ref.slice(dotIdx + 1)
                if (ctx.nodeOutputs[nid] !== undefined) {
                  const val = resolvePath(ctx.nodeOutputs[nid], path)
                  return val !== undefined ? JSON.stringify(val) : '[]'
                }
                if (ctx.variables[nid] !== undefined) {
                  const val = resolvePath(ctx.variables[nid], path)
                  return val !== undefined ? JSON.stringify(val) : '[]'
                }
              }
              if (ctx.nodeOutputs[ref] !== undefined) return JSON.stringify(ctx.nodeOutputs[ref])
              return '[]'
            })

            // If no templates were found, try resolving as bare path against upstream outputs
            if (resolved === collectionRef && !collectionRef.includes('{{')) {
              const incomingEdges = revAdj.get(nodeId) || []
              const parentIds = incomingEdges.map((e) => e.source)
              for (const pid of parentIds) {
                if (ctx.nodeOutputs[pid] !== undefined) {
                  // Try the whole expression as a path into the parent output
                  const val = resolvePath(ctx.nodeOutputs[pid], collectionRef)
                  if (val !== undefined) {
                    resolved = JSON.stringify(val)
                    break
                  }
                  // Also try direct match if parent output IS the collection
                  const parentOut = ctx.nodeOutputs[pid]
                  if (Array.isArray(parentOut)) {
                    resolved = JSON.stringify(parentOut)
                    break
                  }
                }
              }
              // Check variables as bare key
              if (resolved === collectionRef && ctx.variables[collectionRef] !== undefined) {
                resolved = JSON.stringify(ctx.variables[collectionRef])
              }
              // Check nodeOutputs as bare key
              if (resolved === collectionRef && ctx.nodeOutputs[collectionRef] !== undefined) {
                resolved = JSON.stringify(ctx.nodeOutputs[collectionRef])
              }
            }

            items = JSON.parse(resolved)
            if (!Array.isArray(items)) {
              // If resolved to a wrapper object (e.g. {status, results: [...]}),
              // look for the first array field inside it instead of wrapping the whole object
              if (items && typeof items === 'object') {
                const arrayField = Object.values(items as Record<string, unknown>)
                  .find(v => Array.isArray(v) && v.length > 0) as unknown[] | undefined
                if (arrayField) {
                  items = arrayField
                  callbacks.onLog(`[${timestamp()}] [DEBUG] Unwrapped array (${items.length} items) from resolved object`)
                } else {
                  items = [items]
                }
              } else {
                items = [items]
              }
            }
          } catch {
            items = []
          }

          // Fallback: if resolved to 0 items but there IS a reference, try finding the array
          // by looking at `result` field (AI nodes wrap text in {result: ...}) or any array field
          if (items.length === 0 && collectionRef) {
            const refMatch = collectionRef.match(/\{\{([^.}]+)/)
            const refNodeId = refMatch?.[1]
            if (refNodeId && ctx.nodeOutputs[refNodeId]) {
              const out = ctx.nodeOutputs[refNodeId]
              // If output itself is an array
              if (Array.isArray(out)) {
                items = out
                callbacks.onLog(`[${timestamp()}] [DEBUG] Fallback: using node ${refNodeId} output directly (array[${items.length}])`)
              }
              // If output.result is a string that parses to an array
              else if (out && typeof out === 'object') {
                const obj = out as Record<string, unknown>
                if (typeof obj.result === 'string') {
                  try {
                    const parsed = JSON.parse(obj.result)
                    if (Array.isArray(parsed)) {
                      items = parsed
                      callbacks.onLog(`[${timestamp()}] [DEBUG] Fallback: parsed result string from ${refNodeId} (array[${items.length}])`)
                    }
                  } catch { /* not JSON */ }
                }
                // Search all fields for arrays
                if (items.length === 0) {
                  for (const [key, val] of Object.entries(obj)) {
                    if (Array.isArray(val) && val.length > 0) {
                      items = val
                      callbacks.onLog(`[${timestamp()}] [DEBUG] Fallback: using ${refNodeId}.${key} (array[${items.length}])`)
                      break
                    }
                  }
                }
              }
            }
          }
          callbacks.onLog(`[${timestamp()}] [DEBUG] Loop collection ref: "${collectionRef}" → resolved ${items.length} items`)
          callbacks.onLog(`[${timestamp()}] [INFO] Loop: ${items.length} collection items`)
          for (let i = 0; i < items.length && !ctx.aborted; i++) {
            ctx.variables['_loopIndex'] = i
            ctx.variables['_loopItem'] = items[i]
            // Expose current item in node output so nested loops can reference {{LOOP_ID.currentItem}}
            ctx.nodeOutputs[nodeId] = { loopType, currentItem: items[i], currentIndex: i }
            if (bodyEdge) {
              try {
                await executeNode(bodyEdge.target, nodes, adj, revAdj, ctx, callbacks)
              } catch (iterErr) {
                failedIterations++
                const msg = iterErr instanceof Error ? iterErr.message : 'Unknown error'
                callbacks.onLog(`[${timestamp()}] [WARN] Loop iteration ${i} failed: ${msg}`)
              }
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
              try {
                await executeNode(bodyEdge.target, nodes, adj, revAdj, ctx, callbacks)
              } catch (iterErr) {
                failedIterations++
                const msg = iterErr instanceof Error ? iterErr.message : 'Unknown error'
                callbacks.onLog(`[${timestamp()}] [WARN] Loop iteration ${iterations} failed: ${msg}`)
              }
            }
            iterations++
          }
        }

        if (failedIterations > 0) {
          callbacks.onLog(`[${timestamp()}] [WARN] Loop completed with ${failedIterations}/${iterations} failed iterations`)
        }

        output = { loopType, iterations, failedIterations }
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
          await executeNode(doneEdge.target, nodes, adj, revAdj, ctx, callbacks)
        }
        return
      }

      case 'parallel': {
        const parallelEdges = adj.get(nodeId) || []
        callbacks.onLog(`[${timestamp()}] [INFO] Forking into ${parallelEdges.length} parallel branches`)

        // Execute all branches concurrently
        const branchPromises = parallelEdges.map((edge) =>
          executeNode(edge.target, nodes, adj, revAdj, ctx, callbacks)
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
        if (callbacks.dryRun) {
          const resolvedParams: Record<string, string> = {}
          if (node.data.parameters) {
            for (const [k, p] of Object.entries(node.data.parameters)) {
              if (p) resolvedParams[k] = resolveTemplates(String(p.value || ''), ctx)
            }
          }
          callbacks.onLog(`[${timestamp()}] [DRY RUN] Would execute ${node.data.toolId} with params: ${JSON.stringify(resolvedParams)}`)
          output = { dryRun: true, toolId: node.data.toolId, params: resolvedParams }
        } else {
          const tool = findToolDef(node.data.toolId)
          if (tool?.direct) {
            output = await executeDirectTool(node, ctx, callbacks)
          } else {
            output = await executeMcpTool(node, ctx, callbacks)
          }
        }
        break
      }

      case 'ai_prompt': {
        if (callbacks.dryRun) {
          const resolvedPrompt = resolveTemplates(node.data.aiPrompt || '', ctx)
          callbacks.onLog(`[${timestamp()}] [DRY RUN] Would send AI prompt (${node.data.aiModel || 'sonnet'}): ${resolvedPrompt.slice(0, 100)}...`)
          output = { dryRun: true, prompt: resolvedPrompt.slice(0, 200) }
        } else {
          output = await executeAiPrompt(node, ctx, callbacks)
        }
        break
      }

      case 'agent': {
        if (callbacks.dryRun) {
          const resolvedPrompt = resolveTemplates(node.data.agentPrompt || '', ctx)
          callbacks.onLog(`[${timestamp()}] [DRY RUN] Would run agent session (${node.data.agentModel || 'sonnet'}): ${resolvedPrompt.slice(0, 150)}...`)
          output = { dryRun: true, prompt: resolvedPrompt.slice(0, 300) }
        } else {
          output = await executeAgent(node, ctx, callbacks)
        }
        break
      }

      default:
        output = { skipped: true, reason: `Unknown node type: ${type}` }
        callbacks.onLog(`[${timestamp()}] [WARN] Skipping unknown node type: ${type}`)
    }

    // Store output
    ctx.nodeOutputs[nodeId] = output

    // Check if the output is an error response from a direct tool
    if (output && typeof output === 'object' && (output as Record<string, unknown>).status === 'error') {
      const errMsg = String((output as Record<string, unknown>).message || 'Tool returned an error')
      throw new Error(errMsg)
    }

    const result: WorkflowStepResult = {
      nodeId,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      output,
      duration: Date.now() - startTime,
    }
    callbacks.onNodeComplete(nodeId, result)

    // Log output summary for debugging (truncate large outputs)
    if (output && (type === 'mcp_tool' || type === 'ai_prompt' || type === 'agent')) {
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output)
      const truncated = outputStr.length > 500 ? outputStr.slice(0, 500) + '...' : outputStr
      callbacks.onLog(`[${timestamp()}] [DEBUG] Output: ${truncated}`)
    }

    callbacks.onLog(`[${timestamp()}] [INFO] Completed: ${node.data.label || type} (${Date.now() - startTime}ms)`)

    // Debug mode: pause after each node completes
    if (callbacks.debugMode && callbacks.onDebugPause) {
      const action = await callbacks.onDebugPause(nodeId)
      if (action === 'continue') {
        callbacks.debugMode = false // disable debug for remaining nodes
      }
    }

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
    await executeNode(edge.target, nodes, adj, revAdj, ctx, callbacks)
  }
}

/** Execute a single node's logic (used for retries) */
export async function executeSingleNode(
  node: Node<WorkflowNodeData>,
  ctx: ExecutionContext,
  callbacks: ExecutionCallbacks,
): Promise<unknown> {
  switch (node.data.type) {
    case 'delay': return executeDelay(node, ctx)
    case 'variable': return executeVariable(node, ctx)
    case 'mcp_tool': {
      const tool = findToolDef(node.data.toolId)
      if (tool?.direct) return executeDirectTool(node, ctx, callbacks)
      return executeMcpTool(node, ctx, callbacks)
    }
    case 'ai_prompt': return executeAiPrompt(node, ctx, callbacks)
    case 'agent': return executeAgent(node, ctx, callbacks)
    case 'merge': return { merged: true }
    case 'results_display': return { displayed: true }
    default: return { executed: true }
  }
}

/** Abort a running workflow by marking context as aborted */
export function abortExecution(ctx: ExecutionContext): void {
  ctx.aborted = true
}
