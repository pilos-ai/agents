import { Icon } from '../../common/Icon'

const gradientPresets: Record<string, string> = {
  blue: 'from-blue-600 to-indigo-700',
  orange: 'from-orange-500 to-red-600',
  green: 'from-emerald-500 to-teal-700',
  purple: 'from-purple-600 to-pink-700',
  cyan: 'from-cyan-500 to-blue-600',
  pink: 'from-pink-500 to-rose-700',
  gray: 'from-zinc-700 to-zinc-800',
}

const sizeMap = {
  sm: { container: 'w-8 h-8', icon: 'text-sm' },
  md: { container: 'w-10 h-10', icon: 'text-xl' },
  lg: { container: 'w-14 h-14', icon: 'text-2xl' },
}

interface GradientAvatarProps {
  gradient?: string
  icon?: string
  emoji?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function GradientAvatar({ gradient = 'blue', icon, emoji, size = 'md', className = '' }: GradientAvatarProps) {
  const gradientClass = gradientPresets[gradient] || gradient
  const { container, icon: iconSize } = sizeMap[size]

  return (
    <div className={`${container} bg-gradient-to-br ${gradientClass} rounded-lg flex items-center justify-center flex-shrink-0 ${className}`}>
      {emoji ? (
        <span className={iconSize}>{emoji}</span>
      ) : icon ? (
        <Icon icon={icon} className={`text-white ${iconSize}`} />
      ) : (
        <Icon icon="lucide:bot" className={`text-white ${iconSize}`} />
      )}
    </div>
  )
}
