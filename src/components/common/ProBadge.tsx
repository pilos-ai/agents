import { api } from '../../api'

interface Props {
  label?: string
  onClick?: () => void
}

export function ProBadge({ label = 'Upgrade to Pro to unlock', onClick }: Props) {
  const handleClick = onClick ?? (() => api.dialog.openExternal('https://pilos.net/pricing'))
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20 cursor-pointer"
      title={onClick ? label : 'Upgrade to Pro'}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      PRO
    </span>
  )
}
