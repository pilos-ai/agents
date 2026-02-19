import { create } from 'zustand'
import { api } from '../api'

interface AppStore {
  // UI State
  sidebarWidth: number
  rightPanelWidth: number
  rightPanelOpen: boolean
  settingsOpen: boolean
  activeRightTab: 'terminal' | 'processes'

  // Settings
  model: string
  workingDirectory: string
  terminalFontSize: number
  permissionMode: string

  // Actions
  setSidebarWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
  toggleRightPanel: () => void
  setSettingsOpen: (open: boolean) => void
  setActiveRightTab: (tab: 'terminal' | 'processes') => void
  setModel: (model: string) => void
  setWorkingDirectory: (dir: string) => void
  setTerminalFontSize: (size: number) => void
  setPermissionMode: (mode: string) => void
  loadSettings: () => Promise<void>
}

export const useAppStore = create<AppStore>((set) => ({
  sidebarWidth: 220,
  rightPanelWidth: 350,
  rightPanelOpen: false,
  settingsOpen: false,
  activeRightTab: 'terminal',
  model: 'sonnet',
  workingDirectory: '',
  terminalFontSize: 13,
  permissionMode: 'bypass',

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

  setModel: (model) => {
    set({ model })
    api.settings.set('model', model)
  },

  setWorkingDirectory: (dir) => {
    set({ workingDirectory: dir })
    api.settings.set('workingDirectory', dir)
  },

  setTerminalFontSize: (size) => {
    set({ terminalFontSize: size })
    api.settings.set('terminalFontSize', size)
  },

  setPermissionMode: (mode) => {
    set({ permissionMode: mode })
    api.settings.set('permissionMode', mode)
  },

  loadSettings: async () => {
    const all = await api.settings.getAll()
    set({
      model: (all.model as string) || 'sonnet',
      workingDirectory: (all.workingDirectory as string) || '',
      terminalFontSize: (all.terminalFontSize as number) || 13,
      permissionMode: (all.permissionMode as string) || 'bypass',
      sidebarWidth: (all.sidebarWidth as number) || 220,
      rightPanelWidth: (all.rightPanelWidth as number) || 350,
    })
  },
}))
