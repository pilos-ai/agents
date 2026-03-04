import type { ConversationMessage, ToolUseBlock, ToolResultBlock } from '../types'
import { WORKFLOW_TOOL_CATEGORIES } from '../data/workflow-tools'
import { WORKFLOW_RUNTIME_GUIDE } from './workflow-ai'

/**
 * Serialize conversation messages into a compact text format for AI analysis.
 * Skips thinking blocks, truncates long content.
 */
export function serializeConversation(messages: ConversationMessage[]): string {
  // Take last 200 messages for better coverage of long conversations
  const recent = messages.slice(-200)

  const skipped = messages.length - recent.length
  const lines: string[] = []

  if (skipped > 0) {
    const toolCount = messages.slice(0, skipped).filter((m) => m.type === 'tool_use').length
    const userCount = messages.slice(0, skipped).filter((m) => m.role === 'user' && m.type === 'text').length
    lines.push(`[PRIOR CONTEXT: ${skipped} messages skipped — ${userCount} user messages, ${toolCount} tool calls]`)
    lines.push('')
  }

  for (const msg of recent) {
    if (msg.type === 'thinking') continue

    if (msg.type === 'text') {
      const content = msg.content.length > 2000 ? msg.content.slice(0, 2000) + '...' : msg.content
      const role = msg.role.toUpperCase()
      const agent = msg.agentName ? ` (${msg.agentName})` : ''
      lines.push(`[${role}${agent}]: ${content}`)
    } else if (msg.type === 'tool_use') {
      const block = msg.contentBlocks?.[0] as ToolUseBlock | undefined
      if (block?.type === 'tool_use') {
        const input = JSON.stringify(block.input).slice(0, 1000)
        lines.push(`[TOOL_CALL]: ${block.name}(${input})`)
      } else if (msg.toolName) {
        const input = msg.toolInput ? msg.toolInput.slice(0, 1000) : ''
        lines.push(`[TOOL_CALL]: ${msg.toolName}(${input})`)
      }
    } else if (msg.type === 'tool_result') {
      const block = msg.contentBlocks?.[0] as ToolResultBlock | undefined
      if (block?.type === 'tool_result') {
        const status = block.is_error ? 'ERROR' : 'OK'
        const content = typeof block.content === 'string'
          ? block.content.slice(0, 1500)
          : JSON.stringify(block.content).slice(0, 1500)
        lines.push(`[TOOL_RESULT ${status}]: ${content}`)
      } else if (msg.toolResult) {
        lines.push(`[TOOL_RESULT OK]: ${msg.toolResult.slice(0, 1500)}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * Build the AI prompt for converting a conversation into a workflow task.
 */
export function buildConversationToWorkflowPrompt(
  serializedConversation: string,
  userDescription?: string,
): string {
  const toolCatalog = WORKFLOW_TOOL_CATEGORIES.flatMap((c) => c.tools.map((t) => t.id)).join(', ')

  return `You are analyzing a conversation between a user and an AI assistant to extract a reusable automated workflow.

CONVERSATION TRANSCRIPT:
${serializedConversation}

${userDescription ? `USER'S DESCRIPTION: "${userDescription}"` : ''}

YOUR TASK:
1. Read the ENTIRE conversation from start to finish
2. List EVERY distinct action that was performed (tool calls, decisions, data fetches, transformations, notifications, etc.)
3. Create ONE workflow node for EACH distinct action — never merge multiple actions into one node
4. Preserve the EXACT order actions happened in the conversation
5. Abstract hardcoded values (paths, IDs, URLs, branch names) into parameters or variable nodes so the workflow is reusable

COMPLETENESS IS THE #1 PRIORITY:
- Count the distinct actions in the conversation. Your workflow must have AT LEAST that many operational nodes (plus start/end)
- If the conversation has 10 distinct actions, your workflow needs ~12+ nodes (10 actions + start + end)
- NEVER summarize or simplify — if it happened in the conversation, it gets its own node
- Every tool_call in the transcript = at least one mcp_tool or agent node
- Every decision/analysis = an ai_prompt or condition node
- Every notification/report = its own mcp_tool node (slack_message, email_alert, etc.)

STEP-BY-STEP EXTRACTION PROCESS:
1. Go through the conversation chronologically
2. For each [TOOL_CALL], create a corresponding mcp_tool or agent node
3. For each analysis/reasoning the assistant did, create an ai_prompt node
4. For each conditional decision ("if X then Y"), create a condition node
5. For repeated operations on a list of items, wrap in a loop node
6. Check: did the conversation involve setup steps (branch creation, environment prep)? Add those nodes FIRST
7. Check: did the conversation end with delivery steps (commit, push, PR, deploy, notify)? Add those nodes LAST
8. Verify your node count matches the number of distinct actions in the conversation

NODE TYPE SELECTION:
- mcp_tool: Single, concrete operations — API calls, git commands, file ops, Jira/Slack actions, etc. Each distinct operation = separate node
- ai_prompt: Pure reasoning/analysis/summarization — NO tool access. Set aiPrompt with detailed instructions referencing upstream data via {{NODE_ID.field}}
- agent: Complex multi-step tasks needing autonomous tool access (code editing, debugging, multi-file changes). Set agentPrompt with specific instructions
- condition: Branching logic seen in the conversation
- loop: Repeated operations over a collection or count
- variable: Dynamic values that change per run (branch names, dates, IDs)

ABSTRACTION RULES:
- Replace specific values with {{NODE_ID.field}} template references
- If a value varies each run (branch name, date, URL), create a "variable" node for it
- If the assistant performed similar operations on multiple items, use a "loop" node with loopCollection referencing the data source
- Keep the workflow general enough to rerun with different inputs

OUTPUT ONLY THE RAW JSON OBJECT. No markdown fences. No explanation. Start with { and end with }.

JSON schema:
{
  "title": "Short task name (2-5 words)",
  "description": "What this workflow automates (1-2 sentences)",
  "priority": "low|medium|high|critical",
  "schedule": {
    "interval": "manual|15min|30min|1h|2h|4h|8h|12h|1d|1w"
  },
  "workflow": {
    "nodes": [{"id":"NODE_START_01","type":"start|end|mcp_tool|ai_prompt|agent|condition|loop|delay|variable|note","position":{"x":300,"y":50},"data":{"type":"(same as node type)","label":"short name","toolId":"optional tool id for mcp_tool","toolCategory":"optional","toolIcon":"optional: lucide:icon-name","aiPrompt":"for ai_prompt nodes","aiModel":"haiku|sonnet|opus","agentPrompt":"for agent nodes - detailed instruction of what to accomplish","agentModel":"haiku|sonnet|opus","agentMaxTurns":25,"conditionExpression":"for condition","conditionOperator":"equals|contains|greater_than|less_than|regex","conditionValue":"for condition","loopType":"count|collection|while","loopCount":3,"loopCollection":"{{NODE_ID.arrayField}}","parameters":{"key":{"value":"..."}}}}],
    "edges": [{"id":"edge_01","source":"node id","target":"node id","sourceHandle":"null or yes/no for condition, body/done for loop","type":"dashed"}]
  }
}

Workflow layout rules:
- Always include start and end nodes
- Top-to-bottom layout: start y:50, increment y by ~150, center at x:300
- Parallel branches: spread x (100 vs 400)
- condition: sourceHandle "yes"/"no"; loop: sourceHandle "body"/"done"
- Keep labels 2-4 words
- Use up to 25 nodes — as many as needed to faithfully represent every step
- Each distinct operation gets its own mcp_tool node (e.g. git_checkout, git_pull, git_commit, git_push, create_pr are ALL separate nodes)
- ai_prompt nodes MUST have a non-empty "aiPrompt" with {{NODE_ID.field}} references
- agent nodes MUST have a non-empty "agentPrompt" with specific instructions
- collection loops MUST set loopCollection to "{{NODE_ID.arrayField}}"
- All edges must have type: "dashed"

Available toolIds: ${toolCatalog}

${WORKFLOW_RUNTIME_GUIDE}`
}

/**
 * Local heuristic to determine if a conversation looks like a repeatable workflow.
 */
export function shouldSuggestWorkflow(messages: ConversationMessage[]): boolean {
  const toolUseCount = messages.filter((m) => m.type === 'tool_use').length
  const userMsgCount = messages.filter((m) => m.role === 'user' && m.type === 'text').length
  const assistantMsgCount = messages.filter((m) => m.role === 'assistant' && m.type === 'text').length

  return toolUseCount >= 3 && userMsgCount >= 2 && assistantMsgCount >= 2
}
