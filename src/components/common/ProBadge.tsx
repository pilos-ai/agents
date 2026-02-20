interface Props {
  label?: string
}

export function ProBadge({ label = 'Upgrade to Pro to unlock' }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20 cursor-default"
      title={label}
    >
      PRO
    </span>
  )
}
