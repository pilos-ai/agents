import type { StoryStatus } from '../types'

const STATUS_STYLES: Record<StoryStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-neutral-700', text: 'text-neutral-300', label: 'Draft' },
  ready: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Ready' },
  in_progress: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'In Progress' },
  in_review: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'In Review' },
  done: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Done' },
}

interface Props {
  status: StoryStatus
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'sm' }: Props) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.draft
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${style.bg} ${style.text} ${sizeClass}`}>
      {style.label}
    </span>
  )
}
