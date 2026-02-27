import { useState, useMemo, useRef, useEffect } from 'react'
import { Icon } from './Icon'

// Curated icons organized by category for agent personas
const ICON_CATEGORIES: { label: string; icons: string[] }[] = [
  {
    label: 'People',
    icons: [
      'lucide:user', 'lucide:user-round', 'lucide:user-cog', 'lucide:user-check',
      'lucide:user-plus', 'lucide:users', 'lucide:contact', 'lucide:person-standing',
      'lucide:baby', 'lucide:accessibility', 'lucide:hand-metal', 'lucide:heart-handshake',
    ],
  },
  {
    label: 'Dev & Code',
    icons: [
      'lucide:code-2', 'lucide:terminal', 'lucide:file-code', 'lucide:braces',
      'lucide:bug', 'lucide:git-branch', 'lucide:git-merge', 'lucide:database',
      'lucide:server', 'lucide:cpu', 'lucide:binary', 'lucide:variable',
    ],
  },
  {
    label: 'Design',
    icons: [
      'lucide:palette', 'lucide:paintbrush', 'lucide:pen-tool', 'lucide:figma',
      'lucide:layout', 'lucide:image', 'lucide:frame', 'lucide:layers',
      'lucide:grid-3x3', 'lucide:component', 'lucide:shapes', 'lucide:brush',
    ],
  },
  {
    label: 'Business',
    icons: [
      'lucide:briefcase', 'lucide:building-2', 'lucide:landmark', 'lucide:banknote',
      'lucide:wallet', 'lucide:credit-card', 'lucide:receipt', 'lucide:chart-bar',
      'lucide:trending-up', 'lucide:calculator', 'lucide:coins', 'lucide:piggy-bank',
    ],
  },
  {
    label: 'Communication',
    icons: [
      'lucide:message-square', 'lucide:mail', 'lucide:phone', 'lucide:megaphone',
      'lucide:bell', 'lucide:radio', 'lucide:podcast', 'lucide:at-sign',
      'lucide:send', 'lucide:inbox', 'lucide:message-circle', 'lucide:speech',
    ],
  },
  {
    label: 'Management',
    icons: [
      'lucide:clipboard-list', 'lucide:list-checks', 'lucide:kanban',
      'lucide:calendar', 'lucide:clock', 'lucide:timer', 'lucide:target',
      'lucide:flag', 'lucide:milestone', 'lucide:gauge', 'lucide:blocks', 'lucide:workflow',
    ],
  },
  {
    label: 'Science & Research',
    icons: [
      'lucide:flask-conical', 'lucide:microscope', 'lucide:atom', 'lucide:dna',
      'lucide:brain', 'lucide:scan-eye', 'lucide:telescope', 'lucide:lightbulb',
      'lucide:sparkles', 'lucide:zap', 'lucide:wand-2', 'lucide:search',
    ],
  },
  {
    label: 'Security & Legal',
    icons: [
      'lucide:shield', 'lucide:shield-check', 'lucide:lock', 'lucide:key-round',
      'lucide:fingerprint', 'lucide:scan', 'lucide:scale', 'lucide:gavel',
      'lucide:scroll-text', 'lucide:file-check', 'lucide:badge-check', 'lucide:eye',
    ],
  },
  {
    label: 'General',
    icons: [
      'lucide:bot', 'lucide:cog', 'lucide:settings', 'lucide:wrench',
      'lucide:hammer', 'lucide:rocket', 'lucide:globe', 'lucide:compass',
      'lucide:map', 'lucide:bookmark', 'lucide:star', 'lucide:crown',
    ],
  },
]

const ALL_ICONS = ICON_CATEGORIES.flatMap((c) => c.icons)

interface IconPickerProps {
  value: string
  onChange: (icon: string) => void
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return null // show categories view
    const q = search.toLowerCase().replace('lucide:', '')
    return ALL_ICONS.filter((icon) => icon.toLowerCase().includes(q))
  }, [search])

  return (
    <div className="relative" ref={pickerRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 bg-neutral-800 rounded-md px-3 py-1.5 border transition-colors ${
          open ? 'border-blue-500' : 'border-neutral-700 hover:border-neutral-600'
        }`}
      >
        <Icon icon={value || 'lucide:bot'} className="text-white text-base" />
        <span className="text-xs text-neutral-400 truncate flex-1 text-left">
          {value ? value.replace('lucide:', '') : 'Select icon'}
        </span>
        <Icon icon={open ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-neutral-500 text-xs flex-shrink-0" />
      </button>

      {/* Picker dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl z-[70] w-[320px]">
          {/* Search */}
          <div className="p-2 border-b border-neutral-700">
            <div className="relative">
              <Icon icon="lucide:search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 text-xs" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search icons..."
                className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 text-xs text-white rounded-md border border-neutral-700 outline-none focus:border-blue-500 placeholder-neutral-600"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
            {filteredIcons ? (
              /* Search results */
              <div className="p-2">
                {filteredIcons.length > 0 ? (
                  <div className="grid grid-cols-8 gap-1">
                    {filteredIcons.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => { onChange(icon); setOpen(false); setSearch('') }}
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                          value === icon
                            ? 'bg-blue-500/20 ring-1 ring-blue-500/40'
                            : 'hover:bg-neutral-700'
                        }`}
                        title={icon.replace('lucide:', '')}
                      >
                        <Icon icon={icon} className="text-neutral-200 text-base" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 text-center py-4">No icons found</p>
                )}
              </div>
            ) : (
              /* Category view */
              <div className="p-2 space-y-2">
                {ICON_CATEGORIES.map((category) => {
                  const isExpanded = activeCategory === category.label || activeCategory === null
                  const icons = activeCategory === null ? category.icons.slice(0, 4) : category.icons
                  return (
                    <div key={category.label}>
                      <button
                        type="button"
                        onClick={() => setActiveCategory(activeCategory === category.label ? null : category.label)}
                        className="flex items-center justify-between w-full px-1 py-1 text-left"
                      >
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{category.label}</span>
                        <Icon
                          icon={activeCategory === category.label ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                          className="text-neutral-600 text-[10px]"
                        />
                      </button>
                      {isExpanded && (
                        <div className="grid grid-cols-8 gap-1 mt-0.5">
                          {icons.map((icon) => (
                            <button
                              key={icon}
                              type="button"
                              onClick={() => { onChange(icon); setOpen(false) }}
                              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                                value === icon
                                  ? 'bg-blue-500/20 ring-1 ring-blue-500/40'
                                  : 'hover:bg-neutral-700'
                              }`}
                              title={icon.replace('lucide:', '')}
                            >
                              <Icon icon={icon} className="text-neutral-200 text-base" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
