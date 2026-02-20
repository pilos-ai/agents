import { create } from 'zustand'
import { api } from '../api'

export type CliStatus = 'checking' | 'ready' | 'missing' | 'installing' | 'install_failed' | 'error'
export type SettingsSection = 'project' | 'agents' | 'mcp' | 'license' | 'general'

interface AppStore {
  // CLI Status
  cliStatus: CliStatus
  cliVersion?: string
  cliNpmAvailable: boolean
  cliError?: string
  cliInstallLog: string

  // UI State
  sidebarWidth: number
  rightPanelWidth: number
  rightPanelOpen: boolean
  settingsOpen: boolean
  activeSettingsSection: SettingsSection
  activeRightTab: 'terminal' | 'processes'

  // Global settings
  terminalFontSize: number

  // Actions
  checkCli: () => Promise<void>
  installCli: () => Promise<void>
  appendCliInstallLog: (text: string) => void
  setSidebarWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
  toggleRightPanel: () => void
  setSettingsOpen: (open: boolean) => void
  setActiveSettingsSection: (section: SettingsSection) => void
  setActiveRightTab: (tab: 'terminal' | 'processes') => void
  setTerminalFontSize: (size: number) => void
  loadSettings: () => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  cliStatus: 'checking',
  cliNpmAvailable: false,
  cliInstallLog: '',

  sidebarWidth: 220,
  rightPanelWidth: 350,
  rightPanelOpen: false,
  settingsOpen: false,
  activeSettingsSection: 'project',
  activeRightTab: 'terminal',
  terminalFontSize: 13,

  checkCli: async () => {
    set({ cliStatus: 'checking' })
    try {
      const result = await api.cli.check()
      if (result.available) {
        set({ cliStatus: 'ready', cliVersion: result.version, cliNpmAvailable: result.npmAvailable })
      } else {
        set({ cliStatus: 'missing', cliError: result.error, cliNpmAvailable: result.npmAvailable })
      }
    } catch (err) {
      set({ cliStatus: 'error', cliError: String(err) })
    }
  },

  installCli: async () => {
    set({ cliStatus: 'installing', cliInstallLog: '' })
    try {
      const success = await api.cli.install()
      if (success) {
        await get().checkCli()
      } else {
        set({ cliStatus: 'install_failed' })
      }
    } catch {
      set({ cliStatus: 'install_failed' })
    }
  },

  appendCliInstallLog: (text) => {
    set((s) => ({ cliInstallLog: s.cliInstallLog + text }))
  },

  setSidebarWidth: (w) => {
    set({ sidebarWidth: w })
    api.settings.set('sidebarWidth', w)
  },

  setRightPanelWidth: (w) => {
    set({ rightPanelWidth: w })
    api.settings.set('rightPanelWidth', w)
  },

  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  setSettingsOpen: (open) => set({ settingsOpen: open, ...(open ? { activeSettingsSection: 'project' as const } : {}) }),

  setActiveSettingsSection: (section) => set({ activeSettingsSection: section }),

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
