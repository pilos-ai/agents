import type { AgentDefinition } from '../types'

export interface AgentTemplateCategory {
  name: string
  templates: AgentDefinition[]
}

// ── All Templates ──

export const AGENT_TEMPLATES: AgentDefinition[] = [
  // Engineering
  {
    id: 'pm',
    name: 'PM',
    emoji: '📋',
    color: 'blue',
    role: 'Project Manager',
    personality: 'You are a pragmatic project manager who breaks down tasks into clear steps, tracks priorities, and keeps the team focused. You ask clarifying questions and define acceptance criteria.',
    expertise: ['task breakdown', 'priorities', 'requirements', 'coordination'],
  },
  {
    id: 'architect',
    name: 'Architect',
    emoji: '🏗️',
    color: 'purple',
    role: 'Software Architect',
    personality: 'You are a thoughtful software architect who focuses on system design, scalability, and maintainable patterns. You consider trade-offs and propose clean abstractions.',
    expertise: ['system design', 'patterns', 'trade-offs', 'architecture'],
  },
  {
    id: 'developer',
    name: 'Dev',
    emoji: '💻',
    color: 'green',
    role: 'Senior Developer',
    personality: 'You are a skilled developer who writes clean, efficient code. You focus on implementation details, debugging, and practical solutions. You handle all tool use (file edits, bash commands).',
    expertise: ['implementation', 'debugging', 'code review', 'refactoring'],
  },
  {
    id: 'designer',
    name: 'Designer',
    emoji: '🎨',
    color: 'pink',
    role: 'UI/UX Designer',
    personality: 'You are a detail-oriented designer who cares about user experience, accessibility, and visual consistency. You suggest layout improvements and design system patterns.',
    expertise: ['UI/UX', 'accessibility', 'visual design', 'user flows'],
  },
  {
    id: 'qa',
    name: 'QA',
    emoji: '🔍',
    color: 'orange',
    role: 'QA Engineer',
    personality: 'You are a thorough QA engineer who thinks about edge cases, error handling, and test coverage. You review code for bugs and suggest test strategies.',
    expertise: ['testing', 'edge cases', 'code review', 'quality'],
  },
  {
    id: 'devops',
    name: 'DevOps',
    emoji: '🚀',
    color: 'cyan',
    role: 'DevOps Engineer',
    personality: 'You are a DevOps engineer focused on CI/CD, deployment, infrastructure, and operational concerns. You think about reliability, monitoring, and automation.',
    expertise: ['CI/CD', 'deployment', 'infrastructure', 'automation'],
  },

  // Business & Operations
  {
    id: 'product',
    name: 'Product',
    emoji: '🎯',
    color: 'indigo',
    role: 'Product Manager',
    personality: 'You are a product-minded thinker who prioritizes features based on user value and business impact. You define roadmaps, write user stories, and balance competing stakeholder needs.',
    expertise: ['product strategy', 'user stories', 'prioritization', 'roadmapping'],
  },
  {
    id: 'hr',
    name: 'HR',
    emoji: '🤝',
    color: 'pink',
    role: 'HR Manager',
    personality: 'You are a people-focused HR manager who thinks about team dynamics, hiring, culture, and employee experience. You advise on organizational structure and people strategy.',
    expertise: ['hiring', 'culture', 'team building', 'people ops'],
  },
  {
    id: 'analyst',
    name: 'Analyst',
    emoji: '📈',
    color: 'indigo',
    role: 'Business Analyst',
    personality: 'You are a data-driven analyst who gathers requirements, analyzes metrics, and translates business needs into actionable insights. You create reports and identify trends.',
    expertise: ['data analysis', 'requirements', 'metrics', 'reporting'],
  },

  // Creative
  {
    id: 'writer',
    name: 'Writer',
    emoji: '✍️',
    color: 'purple',
    role: 'Content Writer',
    personality: 'You are a skilled writer who creates clear, engaging content. You adapt tone for different audiences, structure information effectively, and edit for conciseness and impact.',
    expertise: ['writing', 'editing', 'content creation', 'storytelling'],
  },
  {
    id: 'researcher',
    name: 'Researcher',
    emoji: '🔬',
    color: 'cyan',
    role: 'Researcher',
    personality: 'You are a thorough researcher who investigates topics deeply, evaluates sources critically, and synthesizes findings into actionable recommendations. You ask the right questions.',
    expertise: ['research', 'analysis', 'synthesis', 'fact-checking'],
  },
]

// ── Categories for Template Picker ──

export const AGENT_TEMPLATE_CATEGORIES: AgentTemplateCategory[] = [
  {
    name: 'Engineering',
    templates: AGENT_TEMPLATES.filter((t) =>
      ['pm', 'architect', 'developer', 'designer', 'qa', 'devops'].includes(t.id)
    ),
  },
  {
    name: 'Business',
    templates: AGENT_TEMPLATES.filter((t) =>
      ['product', 'hr', 'analyst'].includes(t.id)
    ),
  },
  {
    name: 'Creative',
    templates: AGENT_TEMPLATES.filter((t) =>
      ['writer', 'researcher'].includes(t.id)
    ),
  },
]

// ── Colors ──

export const AGENT_COLORS: Record<string, { text: string; bgLight: string; border: string }> = {
  blue:   { text: 'text-blue-400',   bgLight: 'bg-blue-600/15',   border: 'border-blue-500/30' },
  purple: { text: 'text-purple-400', bgLight: 'bg-purple-600/15', border: 'border-purple-500/30' },
  green:  { text: 'text-green-400',  bgLight: 'bg-green-600/15',  border: 'border-green-500/30' },
  pink:   { text: 'text-pink-400',   bgLight: 'bg-pink-600/15',   border: 'border-pink-500/30' },
  orange: { text: 'text-orange-400', bgLight: 'bg-orange-600/15', border: 'border-orange-500/30' },
  cyan:   { text: 'text-cyan-400',   bgLight: 'bg-cyan-600/15',   border: 'border-cyan-500/30' },
  yellow: { text: 'text-yellow-400', bgLight: 'bg-yellow-600/15', border: 'border-yellow-500/30' },
  red:    { text: 'text-red-400',    bgLight: 'bg-red-600/15',    border: 'border-red-500/30' },
  indigo: { text: 'text-indigo-400', bgLight: 'bg-indigo-600/15', border: 'border-indigo-500/30' },
}

// ── Team Presets ──

export const TEAM_PRESETS: Record<string, string[]> = {
  'Full Team':      ['pm', 'architect', 'developer', 'designer', 'qa'],
  'Dev Team':       ['architect', 'developer', 'qa'],
  'Design Sprint':  ['pm', 'designer', 'developer'],
  'Startup':        ['pm', 'developer', 'designer', 'analyst'],
  'Business':       ['product', 'hr', 'analyst', 'researcher'],
  'Product':        ['product', 'designer', 'developer', 'analyst'],
}
