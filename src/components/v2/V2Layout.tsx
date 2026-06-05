import { useState, useEffect, useCallback } from 'react'
import { PilosRail } from './PilosRail'
import { PilosTitlebar } from './PilosTitlebar'
import { ViewRouter } from './ViewRouter'
import { CommandPalette } from './CommandPalette'
import { ExpiryBanner } from './ExpiryBanner'
import { SearchPanel } from '../chat/SearchPanel'
import { useSearchStore } from '../../store/useSearchStore'
import { useAppStore } from '../../store/useAppStore'
import { useUsageStore } from '../../store/useUsageStore'

export function V2Layout() {
  const activeView = useAppStore((s) => s.activeView)

  // Start usage polling
  useEffect(() => {
    useUsageStore.getState().startPolling()
    return () => useUsageStore.getState().stopPolling()
  }, [])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  // Cmd/Ctrl+K toggles command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Cmd/Ctrl+F toggles search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        const store = useSearchStore.getState()
        if (store.isOpen) store.close()
        else store.open()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    // The host BrowserWindow is already the OS chrome (frameless / hiddenInset),
    // so we render the prototype's .win flush — no extra rounded frame.
    <div className="desktop flush">
      <div className="win flush">
        <PilosTitlebar />
        <div className="win-body">
          <PilosRail />
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <ExpiryBanner />
            <ViewRouter view={activeView} />
          </main>
        </div>
        <CommandPalette open={paletteOpen} onClose={closePalette} />
        <SearchPanel />
      </div>
    </div>
  )
}
