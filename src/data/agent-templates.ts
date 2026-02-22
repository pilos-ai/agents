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

  // Management
  {
    id: 'product',
    name: 'Product',
    emoji: '🎯',
    color: 'indigo',
    role: 'Product Manager',
    personality: 'You are a product-minded thinker who prioritizes features based on user value and business impact. You define roadmaps, write user stories, and balance competing stakeholder needs.',
    expertise: ['product strategy', 'user stories', 'prioritization', 'roadmapping'],
  },
]

// ── Categories for Template Picker ──

export const AGENT_TEMPLATE_CATEGORIES: AgentTemplateCategory[] = [
  {
    name: 'Engineering',
    templates: AGENT_TEMPLATES.filter((t) =>
      ['architect', 'developer', 'designer'].includes(t.id)
    ),
  },
  {
    name: 'Management',
    templates: AGENT_TEMPLATES.filter((t) =>
      ['pm', 'product'].includes(t.id)
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
  'Full Team':      ['pm', 'architect', 'developer', 'designer', 'product'],
  'Dev Team':       ['architect', 'developer', 'designer'],
  'Design Sprint':  ['pm', 'designer', 'developer'],
  'Product':        ['product', 'designer', 'developer', 'pm'],
}
