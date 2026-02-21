interface Props {
  covered: number
  total: number
  size?: 'sm' | 'md'
}

export function CoverageBar({ covered, total, size = 'sm' }: Props) {
  if (total === 0) return null
  const pct = Math.round((covered / total) * 100)
  const barHeight = size === 'sm' ? 'h-1' : 'h-1.5'
  const barColor = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${barHeight} bg-neutral-700 rounded-full overflow-hidden`}>
        <div className={`${barHeight} ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-neutral-500 tabular-nums">{pct}%</span>
    </div>
  )
}
