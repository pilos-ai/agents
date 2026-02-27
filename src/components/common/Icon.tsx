import { Icon as IconifyIcon } from '@iconify-icon/react'

interface IconProps {
  icon: string
  className?: string
  size?: string
}

export function Icon({ icon, className = '', size }: IconProps) {
  return (
    <IconifyIcon
      icon={icon}
      className={className}
      style={size ? { fontSize: size } : undefined}
    />
  )
}
