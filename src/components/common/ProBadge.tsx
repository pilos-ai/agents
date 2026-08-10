import { api } from '../../api'
import { useShowPaidUi } from '../../lib/entitlements'

interface Props {
  label?: string
  onClick?: () => void
}

export function ProBadge({ label = 'Upgrade to Pro to unlock', onClick }: Props) {
  const showPaidUi = useShowPaidUi()
  const handleClick = onClick ?? (() => api.dialog.openExternal('https://pilos.net/'))

  // Pilos is free — there is nothing to upgrade to, so the badge renders
  // nothing. Call sites keep using it, so paid mode restores every badge at once.
  if (!showPaidUi) return null

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
