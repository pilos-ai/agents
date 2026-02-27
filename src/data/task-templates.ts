import type { TaskTemplate, TaskPriority, ScheduleInterval, IntegrationType } from '../store/useTaskStore'

export interface TaskTemplateDefinition {
  id: TaskTemplate
  name: string
  description: string
  icon: string
  defaultPriority: TaskPriority
  suggestedInterval: ScheduleInterval
  requiredIntegrations: IntegrationType[]
  defaultDescription: string
}

export const TASK_TEMPLATES: TaskTemplateDefinition[] = [
  {
    id: 'client_review',
    name: 'Client Review',
    description: 'Monitor Jira for client comments and create follow-up tasks',
    icon: 'lucide:message-square-text',
    defaultPriority: 'high',
    suggestedInterval: '1h',
    requiredIntegrations: ['jira'],
    defaultDescription: 'Fetch Jira conversations and comments, analyze for new task requests, create tickets and assign developers.',
  },
  {
    id: 'sprint_sync',
    name: 'Sprint Sync',
    description: 'Sync sprint status and update task board',
    icon: 'lucide:refresh-cw',
    defaultPriority: 'medium',
    suggestedInterval: '4h',
    requiredIntegrations: ['jira'],
    defaultDescription: 'Pull latest sprint data, update issue statuses, and identify blockers.',
  },
  {
    id: 'standup_report',
    name: 'Standup Report',
    description: 'Generate daily standup summary from recent activity',
    icon: 'lucide:clipboard-list',
    defaultPriority: 'medium',
    suggestedInterval: '1d',
    requiredIntegrations: ['jira'],
    defaultDescription: 'Aggregate recent activity, identify in-progress work, and flag blockers.',
  },
  {
    id: 'custom',
    name: 'Custom Task',
    description: 'Create a custom automation task',
    icon: 'lucide:cog',
    defaultPriority: 'medium',
    suggestedInterval: 'manual',
    requiredIntegrations: [],
    defaultDescription: '',
  },
]

export const SCHEDULE_OPTIONS: { value: ScheduleInterval; label: string }[] = [
  { value: 'manual', label: 'Manual only' },
  { value: '15min', label: 'Every 15 minutes' },
  { value: '30min', label: 'Every 30 minutes' },
  { value: '1h', label: 'Every hour' },
  { value: '2h', label: 'Every 2 hours' },
  { value: '4h', label: 'Every 4 hours' },
  { value: '8h', label: 'Every 8 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: '1d', label: 'Every day' },
  { value: '1w', label: 'Every week' },
]
