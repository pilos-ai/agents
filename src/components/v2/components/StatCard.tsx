import { Icon } from '../../common/Icon'

interface StatCardProps {
  label: string
  value: string | number
  icon?: string
  trend?: { value: string; positive: boolean }
  className?: string
}

export function StatCard({ label, value, icon, trend, className = '' }: StatCardProps) {
  return (
    <div className={`p-4 bg-pilos-card border border-pilos-border rounded-xl ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
        {icon && <Icon icon={icon} className="text-zinc-600" />}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {trend && (
          <span className={`text-xs font-medium ${trend.positive ? 'text-emerald-400' : 'text-red-400'} mb-0.5`}>
            {trend.positive ? '+' : ''}{trend.value}
          </span>
        )}
      </div>
    </div>
  )
}
