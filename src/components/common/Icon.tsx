import { Icon as IconifyIcon, addCollection } from '@iconify/react'

// Register icon sets inline — works offline in Electron
import mdiData from '@iconify-json/mdi/icons.json'
import lucideData from '@iconify-json/lucide/icons.json'
import simpleIconsData from '@iconify-json/simple-icons/icons.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
addCollection(mdiData as any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
addCollection(lucideData as any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
addCollection(simpleIconsData as any)

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
