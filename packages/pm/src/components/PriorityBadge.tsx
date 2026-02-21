import type { StoryPriority } from '../types'

const PRIORITY_STYLES: Record<StoryPriority, { color: string; icon: string; label: string }> = {
  low: { color: 'text-neutral-400', icon: '↓', label: 'Low' },
  medium: { color: 'text-blue-400', icon: '→', label: 'Medium' },
  high: { color: 'text-orange-400', icon: '↑', label: 'High' },
  critical: { color: 'text-red-400', icon: '⬆', label: 'Critical' },
}

interface Props {
  priority: StoryPriority
}

export function PriorityBadge({ priority }: Props) {
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${style.color}`} title={style.label}>
      {style.icon} {style.label}
    </span>
  )
}
