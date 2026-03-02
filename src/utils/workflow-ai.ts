import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, WorkflowParameter, WorkflowChatMessage } from '../types/workflow'
import { WORKFLOW_TOOL_CATEGORIES } from '../data/workflow-tools'

/** Runtime behavior guide included in AI Generate and AI Fix prompts */
export const WORKFLOW_RUNTIME_GUIDE = `
WORKFLOW ENGINE RUNTIME BEHAVIOR:

Loop Execution:
- Loop node connects to body via sourceHandle "body" edge, and to exit via "done" edge
- The executor runs the body node(s) repeatedly, then follows the "done" edge
- Collection loops: set loopCollection to "{{NODE_ID.arrayField}}". Each iteration sets _loopItem to current array element
- Count loops: runs loopCount times. Each iteration sets _loopIndex (0-based) and _loopIteration (1-based)
- Loop node stores its state in outputs: { currentItem, currentIndex } for collection, { currentIndex, currentIteration } for count
- Body nodes are ALL nodes reachable from the "body" edge until flow returns — they execute once per iteration

Nested Loops:
- To nest loops, the inner loop must be INSIDE the outer loop's body (reachable from outer loop's "body" edge)
- Inner loop MUST reference outer loop's current item as collection: loopCollection = "{{OUTER_LOOP_ID.currentItem.arrayField}}"
- Example structure for Epics → Stories → Tasks:
  start → analyze → LOOP_EPICS[body] → create_epic → LOOP_STORIES[body] → create_story → LOOP_TASKS[body] → create_task → LOOP_TASKS[done] → LOOP_STORIES[done] → LOOP_EPICS[done] → end
  With: LOOP_EPICS.loopCollection = "{{ANALYZE.epics}}", LOOP_STORIES.loopCollection = "{{LOOP_EPICS.currentItem.stories}}", LOOP_TASKS.loopCollection = "{{LOOP_STORIES.currentItem.tasks}}"
- Each loop level has its own _loopItem. Inside inner loop body, _loopItem is the inner item. To access outer item, use {{OUTER_LOOP_ID.currentItem}}
- CRITICAL: Do NOT flatten nested structures into sequential loops. If data is hierarchical (epics contain stories contain tasks), loops MUST be nested

Template Syntax:
- {{NODE_ID}} — entire node output (JSON-stringified if object)
- {{NODE_ID.field}} — specific field from node output
- {{NODE_ID.field.subfield}} — nested field access (dot notation)
- {{_loopItem}} — current item in collection loop (only inside loop body)
- {{_loopItem.field}} — field from current loop item
- {{LOOP_NODE_ID.currentItem}} — loop's current item (for nested loop references from inner loops)
- {{_loopIndex}} — current iteration index (0-based)
- Unresolved templates become empty strings — always verify template references are correct

Edge Rules:
- Default edges (sourceHandle: null): sequential flow, one node after another
- Condition: "yes" edge taken when true, "no" when false (never both)
- Loop: "body" edge connects to first body node, "done" edge connects to next node after loop completes
- Parallel: "branch_1", "branch_2" etc. for concurrent branches; merge node joins them
- Every loop MUST have both a "body" and a "done" edge
- Loop body chain: loop[body] → bodyNode1 → bodyNode2 → ... → loop[done] → nextNode

Tool Execution:
- Jira tools (jira_search, jira_create, etc.) run directly via API — all {{...}} in parameters are resolved before execution
- ai_prompt nodes: entire prompt is template-resolved, then sent to Claude with all upstream outputs as context
- mcp_tool nodes without direct handlers: sent to Claude CLI for execution
- All parameter values support {{...}} template syntax`

/** Extract JSON from Claude's response, handling surrounding text or code fences */
export function extractJson(text: string): string {
  let cleaned = text.trim()

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  // If it doesn't start with {, try to find the JSON object
  if (!cleaned.startsWith('{')) {
    const firstBrace = cleaned.indexOf('{')
    if (firstBrace === -1) throw new Error('No JSON object found in response')
    cleaned = cleaned.slice(firstBrace)
  }

  // Find the matching closing brace, respecting quoted strings
  let depth = 0
  let end = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\' && inString) { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }

  if (end === -1) throw new Error('Incomplete JSON object in response')

  return cleaned.slice(0, end + 1)
}

/** Look up a tool definition from the catalog */
export function findTool(toolId: string) {
  for (const cat of WORKFLOW_TOOL_CATEGORIES) {
    const tool = cat.tools.find((t) => t.id === toolId)
    if (tool) return tool
  }
  return null
}

/** Validate ai_prompt nodes have non-empty prompts; fill a default from the label + upstream refs if missing */
export function validateAiPromptNodes(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): Node<WorkflowNodeData>[] {
  return nodes.map((node) => {
    if (node.data.type !== 'ai_prompt') return node
    if (node.data.aiPrompt && node.data.aiPrompt.trim()) return node

    // Find upstream nodes feeding into this ai_prompt node
    const upstreamIds = edges
      .filter((e) => e.target === node.id)
      .map((e) => e.source)
    const upstreamNodes = nodes.filter((n) => upstreamIds.includes(n.id))
    const upstreamRefs = upstreamNodes
      .map((n) => `{{${n.id}}}`)
      .join(', ')

    // Build a default prompt from the node label
    const label = node.data.label || 'Analyze'
    const defaultPrompt = upstreamRefs
      ? `${label} the data from upstream steps: ${upstreamRefs}. Return structured JSON.`
      : `${label}. Return structured JSON.`

    return {
      ...node,
      data: { ...node.data, aiPrompt: defaultPrompt },
    }
  })
}

/** Serialize current workflow state for AI prompts (reusable by chat + fix) */
export function serializeWorkflowForAi(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): string {
  const nodeDescriptions = nodes.map((n) => {
    const params = n.data.parameters
      ? Object.entries(n.data.parameters)
          .filter(([, p]) => p != null)
          .map(([k, p]) => `    ${k}: ${JSON.stringify((p as WorkflowParameter).value)}`)
          .join('\n')
      : '    (none)'
    return `  Node ${n.id} (${n.data.type}): "${n.data.label}"\n    Parameters:\n${params}${
      n.data.aiPrompt ? `\n    AI Prompt: ${n.data.aiPrompt}` : ''
    }${n.data.conditionExpression ? `\n    Condition: ${n.data.conditionExpression} ${n.data.conditionOperator} ${n.data.conditionValue}` : ''
    }${n.data.loopType ? `\n    Loop: ${n.data.loopType}${n.data.loopCollection ? ` over ${n.data.loopCollection}` : n.data.loopCount ? ` x${n.data.loopCount}` : ''}` : ''
    }${n.data.variableName ? `\n    Variable: ${n.data.variableName} = ${n.data.variableValue}` : ''
    }${n.data.toolId ? `\n    Tool: ${n.data.toolId}` : ''}`
  }).join('\n')

  const edgeDescriptions = edges
    .map((e) => `  ${e.source}${e.sourceHandle ? `[${e.sourceHandle}]` : ''} --> ${e.target}`)
    .join('\n')

  return `Nodes:\n${nodeDescriptions}\n\nEdges:\n${edgeDescriptions}`
}

/** Build the prompt for the conversational workflow chat */
export function buildChatPrompt(
  messages: WorkflowChatMessage[],
  currentNodes: Node<WorkflowNodeData>[],
  currentEdges: Edge[],
  _userMessage: string,
  jiraProjectKey?: string,
): string {
  const workflowState = currentNodes.length > 1 || currentEdges.length > 0
    ? serializeWorkflowForAi(currentNodes, currentEdges)
    : '(empty — only a Start node exists)'

  const history = messages.slice(-20).map((m) =>
    `[${m.role.toUpperCase()}]: ${m.content}${m.changeSummary ? ` (Changes: ${m.changeSummary})` : ''}`
  ).join('\n')

  const toolCatalog = WORKFLOW_TOOL_CATEGORIES.map((cat) =>
    `  ${cat.name}: ${cat.tools.map((t) => `${t.id} (${t.name})`).join(', ')}`
  ).join('\n')

  return `You are a workflow builder assistant. Users describe automations in plain English and you build or modify workflows.

CURRENT WORKFLOW:
${workflowState}

CONVERSATION HISTORY:
${history}

AVAILABLE TOOLS (use these toolId values for mcp_tool nodes):
${toolCatalog}

INSTRUCTIONS:
- Analyze the user's message and decide what to do
- If they want to CREATE, ADD, MODIFY, or REMOVE steps: return action "replace" with the complete updated workflow
- If they want to EXPLAIN or just ask a question: return action "explain" with just a message
- Preserve existing node IDs when modifying (don't regenerate IDs for unchanged nodes)
- Auto-position nodes in a clean top-to-bottom layout: start at y:50, increment y by ~150
- Every workflow must have a start node (id: NODE_START_01) and an end node
- Use mcp_tool for direct API operations (Jira, Slack, GitHub). Use ai_prompt only for reasoning/analysis
- ai_prompt nodes MUST have a non-empty "aiPrompt" with detailed instructions
- Collection loops MUST set loopCollection to "{{NODE_ID.arrayField}}"
- All edges must have type: "dashed"
- mcp_tool nodes MUST include "parameters" with values filled in — use {{}} template syntax for dynamic data (e.g. inside loops: { "issueKey": { "value": "{{_loopItem.key}}" } }). NEVER leave required parameters empty

INTEGRATION CONTEXT (important):
- Jira, Slack, and GitHub are ALREADY connected and authenticated — the user does NOT need credentials, domains, API tokens, or base64 encoding
- ALWAYS use the available toolIds (jira_search, jira_create, jira_delete, jira_transition, etc.) for integrated services — NEVER use run_script or run_command for operations that have dedicated tools
- Do NOT include warnings about credentials, domains, or authentication in your response messages
- If an operation is not available as a dedicated tool, explain that clearly instead of using workarounds with raw scripts${jiraProjectKey ? `\n- Active Jira project key: "${jiraProjectKey}" — use this in JQL queries (e.g. "project = ${jiraProjectKey} ORDER BY created DESC")` : ''}

COMPLEXITY RULES (important for speed):
- Keep workflows SIMPLE — aim for 4-8 nodes maximum. Users can always ask for more later
- For complex requests (e.g. "analyze code and create epics/stories/tasks"), use a single ai_prompt node to do the analysis and return structured JSON, then a loop over the results to create items — do NOT create separate tool nodes for each sub-item
- Prefer fewer, smarter nodes over many simple ones. An ai_prompt node can handle multiple reasoning steps in one prompt
- Keep node labels to 2-4 words
- Respond with concise JSON — no verbose descriptions in parameters

Node schema: { id, type, position: {x,y}, data: { type, label, toolId?, parameters?, aiPrompt?, aiModel?, conditionExpression?, conditionOperator?, conditionValue?, loopType?, loopCount?, loopCollection?, loopCondition?, delayMs?, delayUnit?, variableName?, variableValue?, variableOperation?, displayTitle?, displaySource?, displayFormat? } }
Edge schema: { id, source, target, sourceHandle (null|"yes"|"no"|"body"|"done"|"branch_1"|"branch_2"), type: "dashed" }
Valid node types: start, end, mcp_tool, ai_prompt, condition, loop, delay, parallel, merge, variable, note, results_display
- results_display: Terminal node that shows results on canvas. Use instead of Slack/Email when user just wants to see output. Set displaySource to "{{NODE_ID.field}}" to pick specific data. Has no outgoing edges.
Valid toolIds: ${WORKFLOW_TOOL_CATEGORIES.flatMap((c) => c.tools.map((t) => t.id)).join(', ')}

${WORKFLOW_RUNTIME_GUIDE}

OUTPUT ONLY RAW JSON (no markdown fences):
{
  "action": "replace" or "explain",
  "nodes": [...],
  "edges": [...],
  "message": "human-readable explanation of changes or answer",
  "summary": "1-line change description"
}

Start with { and end with }.`
}

/** Generate a plain-English workflow summary from nodes and edges */
export function generateWorkflowSummaryLocally(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): string[] {
  // Simple topological walk from start node
  const steps: string[] = []
  const visited = new Set<string>()
  const adjacency = new Map<string, string[]>()

  for (const e of edges) {
    const list = adjacency.get(e.source) || []
    list.push(e.target)
    adjacency.set(e.source, list)
  }

  const startNode = nodes.find((n) => n.data.type === 'start')
  if (!startNode) return ['No start node found']

  const queue = [startNode.id]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)

    const node = nodes.find((n) => n.id === id)
    if (!node) continue

    const d = node.data
    const toolDef = d.toolId ? findTool(d.toolId) : null

    switch (d.type) {
      case 'mcp_tool':
        steps.push(`${toolDef?.name || d.label}: ${toolDef?.description || d.description || ''}`)
        break
      case 'ai_prompt':
        steps.push(`AI: ${d.label}`)
        break
      case 'condition':
        steps.push(`If ${d.conditionExpression || '?'} ${d.conditionOperator || 'equals'} ${d.conditionValue || '?'}`)
        break
      case 'loop':
        if (d.loopType === 'collection') {
          steps.push(`For each item in ${d.loopCollection || 'collection'}:`)
        } else if (d.loopType === 'while') {
          steps.push(`While ${d.loopCondition || 'condition'}:`)
        } else {
          steps.push(`Repeat ${d.loopCount || 0} times:`)
        }
        break
      case 'delay':
        steps.push(`Wait ${d.delayMs || 0} ${d.delayUnit || 's'}`)
        break
      case 'variable':
        steps.push(`Set ${d.variableName || 'var'} = ${d.variableValue || ''}`)
        break
      // skip start, end, note, parallel, merge
    }

    const next = adjacency.get(id) || []
    for (const n of next) {
      if (!visited.has(n)) queue.push(n)
    }
  }

  return steps.length > 0 ? steps : ['Empty workflow']
}

/** Hydrate AI-generated mcp_tool nodes with structured parameters from the tool catalog */
export function hydrateToolNodes(nodes: Node<WorkflowNodeData>[]): Node<WorkflowNodeData>[] {
  return nodes.map((node) => {
    if (node.data.type !== 'mcp_tool' || !node.data.toolId) return node

    const tool = findTool(node.data.toolId)
    if (!tool) return node

    // Build parameters from tool definition, deep-merging AI-provided values per key
    // This ensures key/label/type from the definition are always preserved,
    // even if the AI only provided { value: "..." } for a parameter
    const parameters: Record<string, WorkflowParameter> = {}
    for (const p of tool.parameters) {
      const aiParam = node.data.parameters?.[p.key]
      if (aiParam && typeof aiParam === 'object') {
        // Deep merge: tool definition provides key/label/type, AI provides value
        parameters[p.key] = { ...p, ...aiParam, key: p.key, label: p.label || aiParam.label, type: p.type }
      } else {
        parameters[p.key] = { ...p }
      }
    }

    return {
      ...node,
      data: {
        ...node.data,
        toolCategory: node.data.toolCategory || tool.category,
        toolIcon: node.data.toolIcon || tool.icon,
        parameters,
      },
    }
  })
}
