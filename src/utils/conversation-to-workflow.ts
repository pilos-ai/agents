import type { ConversationMessage, ToolUseBlock, ToolResultBlock } from '../types'
import { WORKFLOW_TOOL_CATEGORIES } from '../data/workflow-tools'
import { WORKFLOW_RUNTIME_GUIDE } from './workflow-ai'

/**
 * Serialize conversation messages into a compact text format for AI analysis.
 * Skips thinking blocks, truncates long content.
 */
export function serializeConversation(messages: ConversationMessage[]): string {
  // Take last 50 messages to stay within context limits
  const recent = messages.slice(-50)

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
      const content = msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content
      const role = msg.role.toUpperCase()
      const agent = msg.agentName ? ` (${msg.agentName})` : ''
      lines.push(`[${role}${agent}]: ${content}`)
    } else if (msg.type === 'tool_use') {
      const block = msg.contentBlocks?.[0] as ToolUseBlock | undefined
      if (block?.type === 'tool_use') {
        const input = JSON.stringify(block.input).slice(0, 300)
        lines.push(`[TOOL_CALL]: ${block.name}(${input})`)
      } else if (msg.toolName) {
        const input = msg.toolInput ? msg.toolInput.slice(0, 300) : ''
        lines.push(`[TOOL_CALL]: ${msg.toolName}(${input})`)
      }
    } else if (msg.type === 'tool_result') {
      const block = msg.contentBlocks?.[0] as ToolResultBlock | undefined
      if (block?.type === 'tool_result') {
        const status = block.is_error ? 'ERROR' : 'OK'
        const content = typeof block.content === 'string'
          ? block.content.slice(0, 500)
          : JSON.stringify(block.content).slice(0, 500)
        lines.push(`[TOOL_RESULT ${status}]: ${content}`)
      } else if (msg.toolResult) {
        lines.push(`[TOOL_RESULT OK]: ${msg.toolResult.slice(0, 500)}`)
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
1. Identify the repeatable multi-step process in this conversation
2. Abstract specific values (file paths, issue keys, branch names, URLs) into reusable parameters
3. Map tool calls to available workflow tools
4. Generate a workflow that can reproduce this process with different inputs

ABSTRACTION RULES:
- Replace specific values with template variable references using {{NODE_ID.field}} syntax
- If the user provided input that varies each run, create a "variable" node to capture it
- If the assistant performed multiple similar operations, consider using a "loop" node
- Use "ai_prompt" nodes for reasoning/analysis/summarization steps
- Use "mcp_tool" nodes for concrete tool operations
- Use "condition" nodes where the conversation showed branching logic

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
    "nodes": [{"id":"NODE_START_01","type":"start|end|mcp_tool|ai_prompt|condition|loop|delay|variable|note","position":{"x":300,"y":50},"data":{"type":"(same as node type)","label":"short name","toolId":"optional tool id","toolCategory":"optional","toolIcon":"optional: lucide:icon-name","aiPrompt":"for ai_prompt nodes","aiModel":"haiku|sonnet|opus","conditionExpression":"for condition","conditionOperator":"equals|contains|greater_than|less_than|regex","conditionValue":"for condition","loopType":"count|collection|while","loopCount":3,"loopCollection":"{{NODE_ID.arrayField}}","parameters":{"key":{"value":"..."}}}}],
    "edges": [{"id":"edge_01","source":"node id","target":"node id","sourceHandle":"null or yes/no for condition, body/done for loop","type":"dashed"}]
  }
}

Workflow rules:
- Always include start and end nodes
- Top-to-bottom layout: start y:50, increment y by ~150, center at x:300
- condition: sourceHandle "yes"/"no"
- loop: sourceHandle "body"/"done"
- Keep labels 2-4 words
- Keep workflows simple: 4-8 nodes maximum
- Use mcp_tool for standard operations (Jira, API calls, etc.)
- Use ai_prompt ONLY for reasoning/analysis/summarization — set aiPrompt with detailed instructions
- ai_prompt nodes MUST have a non-empty "aiPrompt" with specific references to upstream data using {{NODE_ID.field}}
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
