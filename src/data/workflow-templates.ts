import type { WorkflowDefinition, WorkflowNode, WorkflowParameter } from '../types/workflow'
import type { TaskTemplate } from '../store/useTaskStore'
import { WORKFLOW_TOOL_CATEGORIES } from './workflow-tools'

// Helper to find a tool definition by id
function findTool(toolId: string) {
  for (const cat of WORKFLOW_TOOL_CATEGORIES) {
    const tool = cat.tools.find((t) => t.id === toolId)
    if (tool) return tool
  }
  return null
}

// Helper to build a tool node
function toolNode(
  id: string,
  toolId: string,
  x: number,
  y: number,
  paramOverrides?: Record<string, unknown>,
): WorkflowNode {
  const tool = findTool(toolId)
  if (!tool) throw new Error(`Tool not found: ${toolId}`)

  const parameters: Record<string, WorkflowParameter> = {}
  for (const p of tool.parameters) {
    parameters[p.key] = {
      ...p,
      value: paramOverrides?.[p.key] ?? p.value,
    }
  }

  return {
    id,
    type: 'mcp_tool',
    position: { x, y },
    data: {
      type: 'mcp_tool',
      label: tool.name,
      description: tool.description,
      toolId: tool.id,
      toolCategory: tool.category,
      toolIcon: tool.icon,
      parameters,
    },
  }
}

function startNode(id: string, x: number, y: number): WorkflowNode {
  return {
    id,
    type: 'start',
    position: { x, y },
    data: { type: 'start', label: 'Start' },
  }
}

function endNode(id: string, x: number, y: number): WorkflowNode {
  return {
    id,
    type: 'end',
    position: { x, y },
    data: { type: 'end', label: 'End' },
  }
}

function conditionNode(
  id: string,
  x: number,
  y: number,
  label: string,
  expression: string,
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'regex',
  value: string,
): WorkflowNode {
  return {
    id,
    type: 'condition',
    position: { x, y },
    data: {
      type: 'condition',
      label,
      conditionExpression: expression,
      conditionOperator: operator,
      conditionValue: value,
    },
  }
}

function edge(id: string, source: string, target: string, label?: string) {
  return {
    id,
    source,
    target,
    ...(label ? { label, sourceHandle: label === 'No' ? 'no' : 'yes' } : {}),
  }
}

// ── Client Review Workflow ──
// Start → Search Jira → Filter comments → Has new requests? → [Yes] Create Issue → Send Notification → End
//                                                            → [No] → End

function clientReviewWorkflow(): WorkflowDefinition {
  const nodes = [
    startNode('start', 0, 120),
    toolNode('search', 'jira_search', 200, 100, {
      jql: 'project = PROJECT AND updated >= -1h AND comment ~ "request"',
      maxResults: 50,
    }),
    toolNode('filter', 'filter_data', 450, 100, {
      expression: 'comment.author != currentUser AND comment.body contains "task" OR "request" OR "please"',
    }),
    conditionNode('check', 700, 100, 'Has Requests?', 'result.length', 'greater_than', '0'),
    toolNode('create', 'jira_create', 950, 20, {
      summary: 'Follow-up: {{comment.summary}}',
      issueType: 'Task',
      description: 'Auto-created from client comment: {{comment.body}}',
    }),
    toolNode('notify', 'slack_message', 1200, 20, {
      channel: '#dev-tasks',
      message: 'New client request detected and ticket created: {{issue.key}}',
    }),
    endNode('end-yes', 1450, 40),
    endNode('end-no', 950, 240),
  ]

  const edges = [
    edge('e-start-search', 'start', 'search'),
    edge('e-search-filter', 'search', 'filter'),
    edge('e-filter-check', 'filter', 'check'),
    edge('e-check-create', 'check', 'create', 'Yes'),
    edge('e-create-notify', 'create', 'notify'),
    edge('e-notify-end', 'notify', 'end-yes'),
    edge('e-check-end', 'check', 'end-no', 'No'),
  ]

  return { nodes, edges, viewport: { x: 50, y: 50, zoom: 0.85 } }
}

// ── Sprint Sync Workflow ──
// Start → Search Sprint Issues → Transform Data → Transition Issues → Filter Blockers → Send Report → End

function sprintSyncWorkflow(): WorkflowDefinition {
  const nodes = [
    startNode('start', 0, 100),
    toolNode('search', 'jira_search', 200, 80, {
      jql: 'project = PROJECT AND sprint in openSprints()',
      maxResults: 100,
    }),
    toolNode('transform', 'transform_json', 450, 80, {
      outputFormat: 'json',
      contextDepth: 4,
      flattenHierarchy: false,
    }),
    toolNode('transition', 'jira_transition', 700, 80, {
      issueKey: '{{issue.key}}',
      status: '{{computed.newStatus}}',
    }),
    toolNode('blockers', 'filter_data', 950, 80, {
      expression: 'status == "Blocked" OR flagged == true',
    }),
    toolNode('report', 'slack_message', 1200, 80, {
      channel: '#sprint-updates',
      message: 'Sprint sync complete. {{stats.transitioned}} issues updated, {{stats.blockers}} blockers found.',
    }),
    endNode('end', 1450, 100),
  ]

  const edges = [
    edge('e-start-search', 'start', 'search'),
    edge('e-search-transform', 'search', 'transform'),
    edge('e-transform-transition', 'transform', 'transition'),
    edge('e-transition-blockers', 'transition', 'blockers'),
    edge('e-blockers-report', 'blockers', 'report'),
    edge('e-report-end', 'report', 'end'),
  ]

  return { nodes, edges, viewport: { x: 50, y: 50, zoom: 0.85 } }
}

// ── Standup Report Workflow ──
// Start → Search Recent Activity → Aggregate → Transform Report → Send to Slack → End

function standupReportWorkflow(): WorkflowDefinition {
  const nodes = [
    startNode('start', 0, 100),
    toolNode('search', 'jira_search', 200, 80, {
      jql: 'project = PROJECT AND updated >= -24h ORDER BY updated DESC',
      maxResults: 50,
    }),
    toolNode('aggregate', 'aggregate', 450, 80, {
      operation: 'count',
    }),
    toolNode('format', 'transform_json', 700, 80, {
      outputFormat: 'json',
      contextDepth: 2,
      flattenHierarchy: true,
    }),
    toolNode('post', 'slack_message', 950, 80, {
      channel: '#standup',
      message: 'Daily Standup Report:\n- In Progress: {{stats.inProgress}}\n- Completed: {{stats.done}}\n- Blockers: {{stats.blocked}}',
    }),
    endNode('end', 1200, 100),
  ]

  const edges = [
    edge('e-start-search', 'start', 'search'),
    edge('e-search-aggregate', 'search', 'aggregate'),
    edge('e-aggregate-format', 'aggregate', 'format'),
    edge('e-format-post', 'format', 'post'),
    edge('e-post-end', 'post', 'end'),
  ]

  return { nodes, edges, viewport: { x: 50, y: 50, zoom: 0.9 } }
}

// ── Export ──

const TEMPLATE_WORKFLOWS: Partial<Record<TaskTemplate, () => WorkflowDefinition>> = {
  client_review: clientReviewWorkflow,
  sprint_sync: sprintSyncWorkflow,
  standup_report: standupReportWorkflow,
}

export function generateWorkflowForTemplate(template: TaskTemplate): WorkflowDefinition | undefined {
  const factory = TEMPLATE_WORKFLOWS[template]
  return factory?.()
}
