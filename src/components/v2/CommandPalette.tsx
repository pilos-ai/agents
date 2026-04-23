import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Icon } from '../common/Icon'
import { useAppStore, type AppView } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useConversationStore } from '../../store/useConversationStore'

interface Command {
  id: string
  label: string
  icon: string
  category: 'navigation' | 'project' | 'action'
  shortcut?: string
  onSelect: () => void
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const setActiveView = useAppStore((s) => s.setActiveView)
  const openProjects = useProjectStore((s) => s.openProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'nav-dashboard', label: 'Go to Command Center', icon: 'lucide:layout-dashboard', category: 'navigation', onSelect: () => setActiveView('dashboard') },
      { id: 'nav-terminal', label: 'Go to Terminal', icon: 'lucide:terminal', category: 'navigation', onSelect: () => setActiveView('terminal') },
      { id: 'nav-tasks', label: 'Go to Tasks', icon: 'lucide:list-checks', category: 'navigation', onSelect: () => setActiveView('tasks') },
      { id: 'nav-config', label: 'Go to Agent Swarm', icon: 'lucide:bot', category: 'navigation', onSelect: () => setActiveView('config') },
      { id: 'nav-analytics', label: 'Go to Performance', icon: 'lucide:activity', category: 'navigation', onSelect: () => setActiveView('analytics') },
      { id: 'nav-mcp', label: 'Go to MCP Registry', icon: 'lucide:puzzle', category: 'navigation', onSelect: () => setActiveView('mcp') },
      { id: 'nav-settings', label: 'Go to Settings', icon: 'lucide:settings', category: 'navigation', onSelect: () => setActiveView('settings') },
    ]

    const projects: Command[] = openProjects
      .filter((p) => p.projectPath !== activeProjectPath)
      .map((p) => ({
        id: `proj-${p.projectPath}`,
        label: `Switch to ${p.projectName}`,
        icon: 'lucide:folder',
        category: 'project' as const,
        onSelect: () => setActiveProject(p.projectPath),
      }))

    const actions: Command[] = [
      {
        id: 'action-new-chat',
        label: 'New Chat',
        icon: 'lucide:message-square-plus',
        category: 'action',
        onSelect: () => {
          if (activeProjectPath) {
            setActiveView('terminal')
            useConversationStore.getState().createConversation()
          }
        },
      },
      {
        id: 'action-open-project',
        label: 'Open Project',
        icon: 'lucide:folder-open',
        category: 'action',
        onSelect: () => {
          useProjectStore.setState({ activeProjectPath: null })
          setActiveView('dashboard')
        },
      },
    ]

    return [...nav, ...projects, ...actions]
  }, [setActiveView, openProjects, activeProjectPath, setActiveProject])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(q))
  }, [commands, query])

  // Group by category for display
  const grouped = useMemo(() => {
    const groups: { label: string; items: Command[] }[] = []
    const navItems = filtered.filter((c) => c.category === 'navigation')
    const projItems = filtered.filter((c) => c.category === 'project')
    const actItems = filtered.filter((c) => c.category === 'action')
    if (navItems.length) groups.push({ label: 'Navigation', items: navItems })
    if (projItems.length) groups.push({ label: 'Projects', items: projItems })
    if (actItems.length) groups.push({ label: 'Actions', items: actItems })
    return groups
  }, [filtered])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      // rAF ensures the input exists (palette returns null when closed)
      const raf = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(raf)
    }
  }, [open])

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered.length, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const runCommand = useCallback((cmd: Command) => {
    onClose()
    cmd.onSelect()
  }, [onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filtered.length === 0) return
      setSelectedIndex((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filtered.length === 0) return
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        runCommand(filtered[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [filtered, selectedIndex, runCommand, onClose])

  if (!open) return null

  // Build a flat index mapping for keyboard nav
  let flatIndex = 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg bg-pilos-card border border-pilos-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-pilos-border">
          <Icon icon="lucide:search" className="text-zinc-500 text-sm" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
          />
          <kbd className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
          {grouped.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">No commands found</div>
          )}
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="px-4 py-1.5">
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">{group.label}</span>
              </div>
              {group.items.map((cmd) => {
                const idx = flatIndex++
                const isSelected = idx === selectedIndex
                return (
                  <button
                    key={cmd.id}
                    data-index={idx}
                    onClick={() => runCommand(cmd)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors text-zinc-300 hover:bg-zinc-800/50 ${
                      isSelected ? 'bg-blue-500/10 !text-blue-400' : ''
                    }`}
                  >
                    <Icon icon={cmd.icon} className={`text-sm ${isSelected ? 'text-blue-400' : 'text-zinc-500'}`} />
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">{cmd.shortcut}</kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-pilos-border">
          <div className="flex items-center gap-1 text-[10px] text-zinc-600">
            <kbd className="bg-zinc-800 px-1 py-0.5 rounded font-mono">↑↓</kbd>
            <span>navigate</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-600">
            <kbd className="bg-zinc-800 px-1 py-0.5 rounded font-mono">↵</kbd>
            <span>select</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-600">
            <kbd className="bg-zinc-800 px-1 py-0.5 rounded font-mono">esc</kbd>
            <span>close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
