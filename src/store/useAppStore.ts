import { create } from 'zustand'
import { api } from '../api'

interface AppStore {
  // UI State
  sidebarWidth: number
  rightPanelWidth: number
  rightPanelOpen: boolean
  settingsOpen: boolean
  activeRightTab: 'terminal' | 'processes'

  // Global settings
  terminalFontSize: number

  // Actions
  setSidebarWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
  toggleRightPanel: () => void
  setSettingsOpen: (open: boolean) => void
  setActiveRightTab: (tab: 'terminal' | 'processes') => void
  setTerminalFontSize: (size: number) => void
  loadSettings: () => Promise<void>
}

export const useAppStore = create<AppStore>((set) => ({
  sidebarWidth: 220,
  rightPanelWidth: 350,
  rightPanelOpen: false,
  settingsOpen: false,
  activeRightTab: 'terminal',
  terminalFontSize: 13,

  setSidebarWidth: (w) => {
    set({ sidebarWidth: w })
    api.settings.set('sidebarWidth', w)
  },

  setRightPanelWidth: (w) => {
    set({ rightPanelWidth: w })
    api.settings.set('rightPanelWidth', w)
  },

  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setActiveRightTab: (tab) => set({ activeRightTab: tab }),

  setTerminalFontSize: (size) => {
    set({ terminalFontSize: size })
    api.settings.set('terminalFontSize', size)
  },

  loadSettings: async () => {
    const all = await api.settings.getAll()
    set({
      terminalFontSize: (all.terminalFontSize as number) || 13,
      sidebarWidth: (all.sidebarWidth as number) || 220,
      rightPanelWidth: (all.rightPanelWidth as number) || 350,
    })
  },
}))
