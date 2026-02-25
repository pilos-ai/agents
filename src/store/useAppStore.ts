import { create } from 'zustand'
import { api } from '../api'
import type { DependencyCheckResult, DependencyName } from '../types'

export type CliStatus = 'checking' | 'ready' | 'missing' | 'installing' | 'install_failed' | 'error' | 'needs_login' | 'logging_in'
export type SetupStatus = 'checking_deps' | 'deps_missing' | 'checking_cli' | 'ready' | 'missing' | 'installing' | 'install_failed' | 'error' | 'needs_login' | 'logging_in'
export type SettingsSection = 'project' | 'agents' | 'mcp' | 'integrations' | 'license' | 'general'
export type AppView = 'chat' | (string & {})

interface AppStore {
  // Setup / Dependencies
  setupStatus: SetupStatus
  dependencyResult: DependencyCheckResult | null

  // CLI Status
  cliStatus: CliStatus
  cliVersion?: string
  cliError?: string
  cliInstallLog: string
  cliLoginLog: string
  accountEmail?: string
  accountPlan?: string

  // UI State
  activeView: AppView
  sidebarWidth: number
  rightPanelWidth: number
  rightPanelOpen: boolean
  settingsOpen: boolean
  activeSettingsSection: SettingsSection
  activeRightTab: 'terminal' | 'session'

  // Global settings
  terminalFontSize: number

  // Actions
  setActiveView: (view: AppView) => void
  checkDependencies: () => Promise<void>
  browseForBinary: (tool: DependencyName) => Promise<void>
  checkCli: () => Promise<void>
  installCli: () => Promise<void>
  loginCli: () => Promise<void>
  appendCliInstallLog: (text: string) => void
  appendCliLoginLog: (text: string) => void
  setSidebarWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
  toggleRightPanel: () => void
  setSettingsOpen: (open: boolean) => void
  setActiveSettingsSection: (section: SettingsSection) => void
  setActiveRightTab: (tab: 'terminal' | 'session') => void
  setTerminalFontSize: (size: number) => void
  loadSettings: () => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  setupStatus: 'checking_deps',
  dependencyResult: null,

  cliStatus: 'checking',
  cliInstallLog: '',
  cliLoginLog: '',

  activeView: 'chat',
  sidebarWidth: 220,
  rightPanelWidth: 350,
  rightPanelOpen: false,
  settingsOpen: false,
  activeSettingsSection: 'project',
  activeRightTab: 'terminal',
  terminalFontSize: 13,

  setActiveView: (view) => set({ activeView: view }),

  checkDependencies: async () => {
    set({ setupStatus: 'checking_deps', dependencyResult: null })
    try {
      const result = await api.deps.checkAll()
      set({ dependencyResult: result })

      if (!result.allFound) {
        set({ setupStatus: 'deps_missing' })
        return
      }

      // All deps found — proceed to CLI auth check
      set({ setupStatus: 'checking_cli' })
      const cliCheck = await api.cli.check()
      if (cliCheck.available) {
        try {
          const auth = await api.cli.checkAuth()
          if (auth.authenticated) {
            set({ setupStatus: 'ready', cliStatus: 'ready', cliVersion: cliCheck.version, accountEmail: auth.email, accountPlan: auth.plan })
          } else {
            set({ setupStatus: 'needs_login', cliStatus: 'needs_login', cliVersion: cliCheck.version })
          }
        } catch {
          // If auth check fails, still allow through (older CLI versions may not support it)
          set({ setupStatus: 'ready', cliStatus: 'ready', cliVersion: cliCheck.version })
        }
      } else {
        set({ setupStatus: 'missing', cliStatus: 'missing', cliError: cliCheck.error })
      }
    } catch (err) {
      set({ setupStatus: 'error', cliError: String(err) })
    }
  },

  browseForBinary: async (tool) => {
    const result = await api.deps.browseForBinary(tool)
    if (result && result.status === 'found') {
      await get().checkDependencies()
    }
  },

  checkCli: async () => {
    set({ cliStatus: 'checking' })
    try {
      const result = await api.cli.check()
      if (result.available) {
        // CLI is installed — now check authentication
        try {
          const auth = await api.cli.checkAuth()
          if (auth.authenticated) {
            set({ cliStatus: 'ready', cliVersion: result.version, accountEmail: auth.email, accountPlan: auth.plan })
          } else {
            set({ cliStatus: 'needs_login', cliVersion: result.version })
          }
        } catch {
          // If auth check fails, still allow through (older CLI versions may not support it)
          set({ cliStatus: 'ready', cliVersion: result.version })
        }
      } else {
        set({ cliStatus: 'missing', cliError: result.error })
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

  loginCli: async () => {
    set({ cliStatus: 'logging_in', cliLoginLog: '' })
    try {
      const success = await api.cli.login()
      if (success) {
        set({ cliStatus: 'ready' })
      } else {
        set({ cliStatus: 'needs_login' })
      }
    } catch {
      set({ cliStatus: 'needs_login' })
    }
  },

  appendCliInstallLog: (text) => {
    set((s) => ({ cliInstallLog: s.cliInstallLog + text }))
  },

  appendCliLoginLog: (text) => {
    set((s) => ({ cliLoginLog: s.cliLoginLog + text }))
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
