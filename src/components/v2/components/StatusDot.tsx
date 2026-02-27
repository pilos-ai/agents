const colorMap = {
  green: { bg: 'bg-emerald-500', shadow: 'shadow-[0_0_8px_rgba(16,185,129,0.5)]' },
  orange: { bg: 'bg-orange-500', shadow: 'shadow-[0_0_8px_rgba(255,97,84,0.5)]' },
  blue: { bg: 'bg-blue-500', shadow: 'shadow-[0_0_8px_rgba(59,130,246,0.5)]' },
  gray: { bg: 'bg-zinc-600', shadow: '' },
} as const

interface StatusDotProps {
  color: keyof typeof colorMap
  pulse?: boolean
  size?: 'sm' | 'md'
}

export function StatusDot({ color, pulse = false, size = 'sm' }: StatusDotProps) {
  const { bg, shadow } = colorMap[color]
  const sizeClass = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'

  return (
    <span
      className={`${sizeClass} rounded-full ${bg} ${shadow} ${pulse ? 'animate-pulse-soft' : ''} inline-block flex-shrink-0`}
    />
  )
}
