import { WORKFLOW_TOOL_CATEGORIES } from './workflow-tools'
import { WORKFLOW_RUNTIME_GUIDE } from '../utils/workflow-ai'

// ── Role Types ──

export type UserRole = 'pm' | 'developer' | 'designer' | 'qa' | 'devops' | 'custom'

export interface RoleDefinition {
  id: UserRole
  label: string
  icon: string
  description: string
  color: string
  taskHints: string[]
  suggestedIntegrations: ('jira' | 'slack' | 'github')[]
}

// ── Role Definitions ──

export const ROLES: RoleDefinition[] = [
  {
    id: 'pm',
    label: 'Project Manager',
    icon: 'lucide:kanban',
    description: 'Sprint planning, standups, backlog management, and team coordination',
    color: 'blue',
    taskHints: [
      'Sprint sync — fetch active sprint issues from Jira, group by status, and post a summary to Slack',
      'Standup report — gather recent activity (issues updated in last 24h), summarize, and share with team',
      'Backlog grooming — find unestimated or stale issues, analyze priority, and suggest ordering',
      'Release notes — collect completed issues since last release, generate release notes',
      'Velocity tracking — pull sprint completion data, calculate velocity trends',
    ],
    suggestedIntegrations: ['jira', 'slack'],
  },
  {
    id: 'developer',
    label: 'Developer',
    icon: 'lucide:code-2',
    description: 'Code reviews, PR monitoring, testing, and deployment automation',
    color: 'emerald',
    taskHints: [
      'PR review monitor — fetch open pull requests, check review status, notify about stale PRs',
      'Code review automation — read changed files in a PR, run AI analysis, post review comments',
      'Dependency audit — check for outdated dependencies, create issues for critical updates',
      'Test coverage report — run tests, collect coverage data, summarize and post results',
      'Deploy checklist — verify branch status, run checks, and prepare deployment summary',
    ],
    suggestedIntegrations: ['github', 'slack'],
  },
  {
    id: 'designer',
    label: 'Designer',
    icon: 'lucide:palette',
    description: 'Design reviews, feedback tracking, and design-dev handoff workflows',
    color: 'purple',
    taskHints: [
      'Design review tracker — find Jira issues tagged "design-review", collect feedback, summarize status',
      'Feedback digest — gather recent comments on design-related issues, group by theme, post digest',
      'Design-dev handoff — find issues moving from design to development, verify specs are attached',
      'Component audit — search for UI-related issues, categorize by component, generate audit report',
    ],
    suggestedIntegrations: ['jira', 'slack'],
  },
  {
    id: 'qa',
    label: 'QA Engineer',
    icon: 'lucide:bug',
    description: 'Bug triage, test planning, regression detection, and quality reports',
    color: 'amber',
    taskHints: [
      'Bug triage — fetch new bug reports, analyze severity and impact, suggest priority and assignee',
      'Test coverage report — search for issues without test labels, identify untested features',
      'Regression detector — find recently reopened issues, analyze patterns, generate regression report',
      'Release validation — check all issues in release, verify testing status, generate go/no-go report',
      'Quality dashboard — collect bug counts, resolution times, and testing metrics, post summary',
    ],
    suggestedIntegrations: ['jira', 'slack'],
  },
  {
    id: 'devops',
    label: 'DevOps Engineer',
    icon: 'lucide:server',
    description: 'Deployment pipelines, monitoring, infrastructure checks, and incident response',
    color: 'orange',
    taskHints: [
      'Deployment status — check recent deployments, verify health, notify team of results',
      'Infrastructure monitor — run health checks, collect metrics, alert on anomalies',
      'Incident response — detect failed deployments or alerts, create Jira incident, notify on-call',
      'Environment audit — compare configs across environments, flag discrepancies',
      'Release pipeline — validate branch, run pre-deploy checks, execute deploy, verify and notify',
    ],
    suggestedIntegrations: ['github', 'slack', 'jira'],
  },
  {
    id: 'custom',
    label: 'Custom Role',
    icon: 'lucide:sparkles',
    description: 'Describe your role and workflows in your own words',
    color: 'zinc',
    taskHints: [],
    suggestedIntegrations: [],
  },
]

// ── Workspace Generation Prompt ──

export function buildWorkspaceGenerationPrompt(
  role: RoleDefinition,
  customDescription: string | undefined,
  connectedIntegrations: string[],
  jiraProjectKey?: string,
): string {
  const toolIds = WORKFLOW_TOOL_CATEGORIES.flatMap((c) => c.tools.map((t) => t.id)).join(', ')

  const roleContext = role.id === 'custom' && customDescription
    ? `USER ROLE: Custom\nDESCRIPTION: ${customDescription}`
    : `USER ROLE: ${role.label}\nFOCUS AREAS: ${role.description}`

  const hintsSection = role.taskHints.length > 0
    ? `\nTASK IDEAS FOR THIS ROLE (generate similar tasks):\n${role.taskHints.map((h) => `- ${h}`).join('\n')}`
    : ''

  return `You are generating a workspace setup for a user of Pilos Agents, a workflow automation tool.

${roleContext}

CONNECTED INTEGRATIONS: ${connectedIntegrations.length > 0 ? connectedIntegrations.join(', ') : 'None'}
${jiraProjectKey ? `JIRA PROJECT KEY: "${jiraProjectKey}" — use this in JQL queries` : ''}
${hintsSection}

Generate exactly 4 tasks with workflows that this user would commonly automate.
Each task should be a TEMPLATE — use placeholder values in parameters that the user will customize before running.

Placeholder examples:
- JQL: "project = ${jiraProjectKey || 'YOUR_PROJECT'} AND sprint in openSprints() ORDER BY priority DESC"
- Slack channel: "#team-updates"
- Labels/fields: use realistic but generic values

OUTPUT ONLY RAW JSON (no markdown fences, no explanation). Start with { and end with }.

{
  "tasks": [
    {
      "title": "Short Task Name (2-4 words)",
      "description": "1-2 sentence description of what this automation does",
      "priority": "low|medium|high",
      "workflow": {
        "nodes": [
          {"id":"NODE_START_01","type":"start","position":{"x":300,"y":50},"data":{"type":"start","label":"Start"}},
          {"id":"NODE_XXX","type":"mcp_tool","position":{"x":300,"y":200},"data":{"type":"mcp_tool","label":"Short Label","toolId":"tool_id","parameters":{"paramKey":{"key":"paramKey","label":"Param Label","type":"string","value":"template value","required":true}}}},
          {"id":"NODE_END_01","type":"end","position":{"x":300,"y":500},"data":{"type":"end","label":"Done"}}
        ],
        "edges": [
          {"id":"e1","source":"NODE_START_01","target":"NODE_XXX","sourceHandle":null,"type":"dashed"}
        ]
      }
    }
  ]
}

RULES:
- Each workflow: 4-8 nodes, top-to-bottom layout (y increments by ~150)
- Always include start and end nodes
- Only use integrations the user has connected: ${connectedIntegrations.join(', ') || 'none — use data processing, code execution, and AI analysis nodes only'}
- Use mcp_tool for direct API calls (Jira, Slack, GitHub). Use ai_prompt ONLY for reasoning/analysis
- ai_prompt nodes MUST have non-empty "aiPrompt" with detailed instructions referencing upstream data via {{NODE_ID.field}}
- All edges: type "dashed". Condition edges: sourceHandle "yes"/"no". Loop edges: "body"/"done"
- Valid toolIds: ${toolIds}
- Valid node types: start, end, mcp_tool, ai_prompt, condition, loop, delay, parallel, merge, variable, note, results_display

${WORKFLOW_RUNTIME_GUIDE}

Start with { and end with }.`
}
