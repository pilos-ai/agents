interface TokenMeterProps {
  used: number
  total: number
  size?: number
  color?: string
  label?: string
}

export function TokenMeter({ used, total, size = 64, color = '#3b82f6', label }: TokenMeterProps) {
  const radius = (size / 2) - 4
  const circumference = 2 * Math.PI * radius
  const percent = Math.min(used / total, 1)
  const offset = circumference * (1 - percent)
  const center = size / 2

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 w-full h-full -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth="4"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="text-[9px] font-bold text-white z-10">
        {label ?? `${Math.round(percent * 100)}%`}
      </span>
    </div>
  )
}
