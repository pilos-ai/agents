import { useState, useCallback } from 'react'
import { TerminalTab } from './TerminalTab'
import { api } from '../../api'

interface Tab {
  id: string
  label: string
}

export function TerminalPanel() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const createTab = useCallback(() => {
    const id = `term-${Date.now()}`
    const label = `Terminal ${tabs.length + 1}`
    setTabs((prev) => [...prev, { id, label }])
    setActiveTabId(id)
  }, [tabs.length])

  const closeTab = useCallback((id: string) => {
    api.terminal.destroy(id)
    setTabs((prev) => prev.filter((t) => t.id !== id))
    setActiveTabId((prev) => {
      if (prev !== id) return prev
      const remaining = tabs.filter((t) => t.id !== id)
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null
    })
  }, [tabs])

  if (tabs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <button
          onClick={createTab}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-md transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Terminal
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center bg-neutral-900/60 border-b border-neutral-800 px-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group flex items-center gap-1 px-2 py-1 text-xs cursor-pointer border-b-2 transition-colors ${
              activeTabId === tab.id
                ? 'text-white border-blue-400'
                : 'text-neutral-500 border-transparent hover:text-neutral-300'
            }`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span>{tab.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="hidden group-hover:block p-0.5 hover:text-red-400"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        <button
          onClick={createTab}
          className="p-1 text-neutral-500 hover:text-white transition-colors"
          title="New terminal"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 relative">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${activeTabId === tab.id ? 'block' : 'hidden'}`}
          >
            <TerminalTab id={tab.id} />
          </div>
        ))}
      </div>
    </div>
  )
}
