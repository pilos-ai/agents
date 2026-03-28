import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from './useAppStore'

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  api: {
    deps: {
      checkAll: vi.fn(),
      browseForBinary: vi.fn(),
    },
    cli: {
      check: vi.fn(),
      checkAuth: vi.fn(),
      install: vi.fn(),
      login: vi.fn(),
    },
    settings: {
      getAll: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getApi() {
  const mod = await import('../api')
  return (mod as unknown as { api: Record<string, Record<string, ReturnType<typeof vi.fn>>> }).api
}

const initialState = useAppStore.getState()

beforeEach(() => {
  useAppStore.setState(initialState, true)
  vi.clearAllMocks()
})

// ── setActiveView ─────────────────────────────────────────────────────────────

describe('setActiveView', () => {
  it('updates activeView', () => {
    useAppStore.getState().setActiveView('tasks')
    expect(useAppStore.getState().activeView).toBe('tasks')
  })

  it('can be set to any string view', () => {
    useAppStore.getState().setActiveView('custom-view')
    expect(useAppStore.getState().activeView).toBe('custom-view')
  })
})

// ── checkDependencies ─────────────────────────────────────────────────────────

describe('checkDependencies', () => {
  it('sets setupStatus to deps_missing when not all deps found', async () => {
    const api = await getApi()
    api.deps.checkAll.mockResolvedValue({ allFound: false, dependencies: [] })

    await useAppStore.getState().checkDependencies()

    expect(useAppStore.getState().setupStatus).toBe('deps_missing')
    expect(useAppStore.getState().dependencyResult).toEqual({ allFound: false, dependencies: [] })
  })

  it('sets setupStatus to ready when deps found and CLI authenticated', async () => {
    const api = await getApi()
    api.deps.checkAll.mockResolvedValue({ allFound: true, dependencies: [] })
    api.cli.check.mockResolvedValue({ available: true, version: '1.0.0' })
    api.cli.checkAuth.mockResolvedValue({ authenticated: true, email: 'user@test.com', plan: 'pro' })

    await useAppStore.getState().checkDependencies()

    const state = useAppStore.getState()
    expect(state.setupStatus).toBe('ready')
    expect(state.cliStatus).toBe('ready')
    expect(state.cliVersion).toBe('1.0.0')
    expect(state.accountEmail).toBe('user@test.com')
    expect(state.accountPlan).toBe('pro')
  })

  it('sets setupStatus to needs_login when CLI present but not authenticated', async () => {
    const api = await getApi()
    api.deps.checkAll.mockResolvedValue({ allFound: true, dependencies: [] })
    api.cli.check.mockResolvedValue({ available: true, version: '2.0.0' })
    api.cli.checkAuth.mockResolvedValue({ authenticated: false })

    await useAppStore.getState().checkDependencies()

    expect(useAppStore.getState().setupStatus).toBe('needs_login')
    expect(useAppStore.getState().cliStatus).toBe('needs_login')
  })

  it('sets setupStatus to missing when CLI not available', async () => {
    const api = await getApi()
    api.deps.checkAll.mockResolvedValue({ allFound: true, dependencies: [] })
    api.cli.check.mockResolvedValue({ available: false, error: 'not found' })

    await useAppStore.getState().checkDependencies()

    expect(useAppStore.getState().setupStatus).toBe('missing')
    expect(useAppStore.getState().cliStatus).toBe('missing')
    expect(useAppStore.getState().cliError).toBe('not found')
  })

  it('falls through to ready when checkAuth throws (old CLI)', async () => {
    const api = await getApi()
    api.deps.checkAll.mockResolvedValue({ allFound: true, dependencies: [] })
    api.cli.check.mockResolvedValue({ available: true, version: '0.5.0' })
    api.cli.checkAuth.mockRejectedValue(new Error('not supported'))

    await useAppStore.getState().checkDependencies()

    expect(useAppStore.getState().setupStatus).toBe('ready')
    expect(useAppStore.getState().cliStatus).toBe('ready')
  })

  it('sets setupStatus to error on unexpected failure', async () => {
    const api = await getApi()
    api.deps.checkAll.mockRejectedValue(new Error('Network failure'))

    await useAppStore.getState().checkDependencies()

    expect(useAppStore.getState().setupStatus).toBe('error')
  })

  it('starts with setupStatus checking_deps', async () => {
    const api = await getApi()
    // Delay resolution so we can observe the in-flight state
    let resolve!: () => void
    api.deps.checkAll.mockReturnValue(new Promise((r) => { resolve = r as () => void }))

    const promise = useAppStore.getState().checkDependencies()
    expect(useAppStore.getState().setupStatus).toBe('checking_deps')
    expect(useAppStore.getState().dependencyResult).toBeNull()

    api.deps.checkAll.mockResolvedValue({ allFound: false, dependencies: [] })
    resolve()
    await promise
  })
})

// ── checkCli ──────────────────────────────────────────────────────────────────

describe('checkCli', () => {
  it('sets cliStatus to ready when CLI available and authenticated', async () => {
    const api = await getApi()
    api.cli.check.mockResolvedValue({ available: true, version: '1.2.3' })
    api.cli.checkAuth.mockResolvedValue({ authenticated: true, email: 'a@b.com', plan: 'free' })

    await useAppStore.getState().checkCli()

    const state = useAppStore.getState()
    expect(state.cliStatus).toBe('ready')
    expect(state.cliVersion).toBe('1.2.3')
    expect(state.accountEmail).toBe('a@b.com')
  })

  it('sets cliStatus to needs_login when CLI present but unauthenticated', async () => {
    const api = await getApi()
    api.cli.check.mockResolvedValue({ available: true, version: '1.2.3' })
    api.cli.checkAuth.mockResolvedValue({ authenticated: false })

    await useAppStore.getState().checkCli()

    expect(useAppStore.getState().cliStatus).toBe('needs_login')
  })

  it('sets cliStatus to missing when CLI not found', async () => {
    const api = await getApi()
    api.cli.check.mockResolvedValue({ available: false, error: 'command not found' })

    await useAppStore.getState().checkCli()

    expect(useAppStore.getState().cliStatus).toBe('missing')
    expect(useAppStore.getState().cliError).toBe('command not found')
  })

  it('sets cliStatus to error when check throws', async () => {
    const api = await getApi()
    api.cli.check.mockRejectedValue(new Error('IPC error'))

    await useAppStore.getState().checkCli()

    expect(useAppStore.getState().cliStatus).toBe('error')
    expect(useAppStore.getState().cliError).toContain('IPC error')
  })

  it('falls through to ready when checkAuth throws', async () => {
    const api = await getApi()
    api.cli.check.mockResolvedValue({ available: true, version: '1.0.0' })
    api.cli.checkAuth.mockRejectedValue(new Error('unsupported'))

    await useAppStore.getState().checkCli()

    expect(useAppStore.getState().cliStatus).toBe('ready')
  })
})

// ── installCli ────────────────────────────────────────────────────────────────

describe('installCli', () => {
  it('sets cliStatus to install_failed when install returns false', async () => {
    const api = await getApi()
    api.cli.install.mockResolvedValue(false)

    await useAppStore.getState().installCli()

    expect(useAppStore.getState().cliStatus).toBe('install_failed')
  })

  it('sets cliStatus to install_failed when install throws', async () => {
    const api = await getApi()
    api.cli.install.mockRejectedValue(new Error('disk full'))

    await useAppStore.getState().installCli()

    expect(useAppStore.getState().cliStatus).toBe('install_failed')
  })

  it('calls checkCli after successful install', async () => {
    const api = await getApi()
    api.cli.install.mockResolvedValue(true)
    api.cli.check.mockResolvedValue({ available: true, version: '1.0.0' })
    api.cli.checkAuth.mockResolvedValue({ authenticated: true, email: 'x@y.com', plan: 'free' })

    await useAppStore.getState().installCli()

    expect(api.cli.check).toHaveBeenCalled()
    expect(useAppStore.getState().cliStatus).toBe('ready')
  })

  it('sets cliStatus to installing at start', async () => {
    const api = await getApi()
    let resolve!: (v: boolean) => void
    api.cli.install.mockReturnValue(new Promise<boolean>((r) => { resolve = r }))

    const promise = useAppStore.getState().installCli()
    expect(useAppStore.getState().cliStatus).toBe('installing')
    expect(useAppStore.getState().cliInstallLog).toBe('')

    resolve(false)
    await promise
  })
})

// ── loginCli ──────────────────────────────────────────────────────────────────

describe('loginCli', () => {
  it('sets cliStatus to ready when login succeeds', async () => {
    const api = await getApi()
    api.cli.login.mockResolvedValue(true)

    await useAppStore.getState().loginCli()

    expect(useAppStore.getState().cliStatus).toBe('ready')
  })

  it('sets cliStatus to needs_login when login returns false', async () => {
    const api = await getApi()
    api.cli.login.mockResolvedValue(false)

    await useAppStore.getState().loginCli()

    expect(useAppStore.getState().cliStatus).toBe('needs_login')
  })

  it('sets cliStatus to needs_login when login throws', async () => {
    const api = await getApi()
    api.cli.login.mockRejectedValue(new Error('timeout'))

    await useAppStore.getState().loginCli()

    expect(useAppStore.getState().cliStatus).toBe('needs_login')
  })
})

// ── appendCliInstallLog / appendCliLoginLog ───────────────────────────────────

describe('appendCliInstallLog', () => {
  it('appends text to cliInstallLog', () => {
    useAppStore.getState().appendCliInstallLog('line 1\n')
    useAppStore.getState().appendCliInstallLog('line 2\n')
    expect(useAppStore.getState().cliInstallLog).toBe('line 1\nline 2\n')
  })
})

describe('appendCliLoginLog', () => {
  it('appends text to cliLoginLog', () => {
    useAppStore.getState().appendCliLoginLog('auth output ')
    useAppStore.getState().appendCliLoginLog('done')
    expect(useAppStore.getState().cliLoginLog).toBe('auth output done')
  })
})

// ── UI state actions ──────────────────────────────────────────────────────────

describe('setSidebarWidth', () => {
  it('updates sidebarWidth and persists setting', async () => {
    const api = await getApi()
    useAppStore.getState().setSidebarWidth(300)
    expect(useAppStore.getState().sidebarWidth).toBe(300)
    expect(api.settings.set).toHaveBeenCalledWith('sidebarWidth', 300)
  })
})

describe('setRightPanelWidth', () => {
  it('updates rightPanelWidth and persists setting', async () => {
    const api = await getApi()
    useAppStore.getState().setRightPanelWidth(450)
    expect(useAppStore.getState().rightPanelWidth).toBe(450)
    expect(api.settings.set).toHaveBeenCalledWith('rightPanelWidth', 450)
  })
})

describe('toggleRightPanel', () => {
  it('toggles rightPanelOpen', () => {
    expect(useAppStore.getState().rightPanelOpen).toBe(false)
    useAppStore.getState().toggleRightPanel()
    expect(useAppStore.getState().rightPanelOpen).toBe(true)
    useAppStore.getState().toggleRightPanel()
    expect(useAppStore.getState().rightPanelOpen).toBe(false)
  })
})

describe('setSettingsOpen', () => {
  it('opens settings and resets section to project', () => {
    useAppStore.setState({ activeSettingsSection: 'license' })
    useAppStore.getState().setSettingsOpen(true)
    expect(useAppStore.getState().settingsOpen).toBe(true)
    expect(useAppStore.getState().activeSettingsSection).toBe('project')
  })

  it('closes settings without resetting section', () => {
    useAppStore.setState({ settingsOpen: true, activeSettingsSection: 'agents' })
    useAppStore.getState().setSettingsOpen(false)
    expect(useAppStore.getState().settingsOpen).toBe(false)
    expect(useAppStore.getState().activeSettingsSection).toBe('agents')
  })
})

describe('setActiveSettingsSection', () => {
  it('updates activeSettingsSection', () => {
    useAppStore.getState().setActiveSettingsSection('mcp')
    expect(useAppStore.getState().activeSettingsSection).toBe('mcp')
  })
})

describe('setActiveRightTab', () => {
  it('updates activeRightTab', () => {
    useAppStore.getState().setActiveRightTab('session')
    expect(useAppStore.getState().activeRightTab).toBe('session')
  })
})

describe('setTerminalFontSize', () => {
  it('updates terminalFontSize and persists setting', async () => {
    const api = await getApi()
    useAppStore.getState().setTerminalFontSize(16)
    expect(useAppStore.getState().terminalFontSize).toBe(16)
    expect(api.settings.set).toHaveBeenCalledWith('terminalFontSize', 16)
  })
})

describe('markResultsViewed', () => {
  it('sets resultsLastViewedAt to a timestamp and persists it', async () => {
    const api = await getApi()
    const before = new Date()
    useAppStore.getState().markResultsViewed()
    const after = new Date()

    const ts = useAppStore.getState().resultsLastViewedAt
    expect(ts).not.toBeNull()
    expect(new Date(ts!).getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(new Date(ts!).getTime()).toBeLessThanOrEqual(after.getTime())
    expect(api.settings.set).toHaveBeenCalledWith('resultsLastViewedAt', ts)
  })
})

// ── loadSettings ──────────────────────────────────────────────────────────────

describe('loadSettings', () => {
  it('applies saved settings', async () => {
    const api = await getApi()
    api.settings.getAll.mockResolvedValue({
      terminalFontSize: 18,
      sidebarWidth: 280,
      rightPanelWidth: 400,
      resultsLastViewedAt: '2024-01-01T00:00:00.000Z',
    })

    await useAppStore.getState().loadSettings()

    const state = useAppStore.getState()
    expect(state.terminalFontSize).toBe(18)
    expect(state.sidebarWidth).toBe(280)
    expect(state.rightPanelWidth).toBe(400)
    expect(state.resultsLastViewedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('falls back to defaults for missing settings', async () => {
    const api = await getApi()
    api.settings.getAll.mockResolvedValue({})

    await useAppStore.getState().loadSettings()

    const state = useAppStore.getState()
    expect(state.terminalFontSize).toBe(13)
    expect(state.sidebarWidth).toBe(220)
    expect(state.rightPanelWidth).toBe(350)
    expect(state.resultsLastViewedAt).toBeNull()
  })
})

// ── loadWorkspaceSetup ────────────────────────────────────────────────────────

describe('loadWorkspaceSetup', () => {
  it('marks workspaceSetupComplete when completedAt is present', async () => {
    const api = await getApi()
    api.settings.get.mockResolvedValue({ completedAt: '2024-01-01T00:00:00.000Z', role: 'developer' })

    await useAppStore.getState().loadWorkspaceSetup()

    expect(useAppStore.getState().workspaceSetupLoaded).toBe(true)
    expect(useAppStore.getState().workspaceSetupComplete).toBe(true)
  })

  it('marks workspaceSetupComplete false when no completedAt', async () => {
    const api = await getApi()
    api.settings.get.mockResolvedValue(null)

    await useAppStore.getState().loadWorkspaceSetup()

    expect(useAppStore.getState().workspaceSetupLoaded).toBe(true)
    expect(useAppStore.getState().workspaceSetupComplete).toBe(false)
  })

  it('marks loaded even when settings.get throws', async () => {
    const api = await getApi()
    api.settings.get.mockRejectedValue(new Error('storage error'))

    await useAppStore.getState().loadWorkspaceSetup()

    expect(useAppStore.getState().workspaceSetupLoaded).toBe(true)
    expect(useAppStore.getState().workspaceSetupComplete).toBe(false)
  })
})

// ── completeWorkspaceSetup / resetWorkspaceSetup ──────────────────────────────

describe('completeWorkspaceSetup', () => {
  it('sets workspaceSetupComplete to true and persists', async () => {
    const api = await getApi()
    await useAppStore.getState().completeWorkspaceSetup('developer')

    expect(useAppStore.getState().workspaceSetupComplete).toBe(true)
    expect(api.settings.set).toHaveBeenCalledWith(
      'v2_workspace_setup',
      expect.objectContaining({ role: 'developer', completedAt: expect.any(String) }),
    )
  })

  it('uses null role when no role provided', async () => {
    const api = await getApi()
    await useAppStore.getState().completeWorkspaceSetup()

    expect(api.settings.set).toHaveBeenCalledWith(
      'v2_workspace_setup',
      expect.objectContaining({ role: null }),
    )
  })
})

describe('resetWorkspaceSetup', () => {
  it('sets workspaceSetupComplete to false and clears stored value', async () => {
    const api = await getApi()
    useAppStore.setState({ workspaceSetupComplete: true })

    await useAppStore.getState().resetWorkspaceSetup()

    expect(useAppStore.getState().workspaceSetupComplete).toBe(false)
    expect(api.settings.set).toHaveBeenCalledWith('v2_workspace_setup', null)
  })
})

// ── browseForBinary ───────────────────────────────────────────────────────────

describe('browseForBinary', () => {
  it('calls checkDependencies when result status is "found"', async () => {
    const api = await getApi()
    api.deps.browseForBinary.mockResolvedValue({ status: 'found', path: '/usr/local/bin/node' })
    // Set up checkDependencies mocks so it completes without error
    api.deps.checkAll.mockResolvedValue({ allFound: true, dependencies: [] })
    api.cli.check.mockResolvedValue({ available: true, version: '1.0.0' })
    api.cli.checkAuth.mockResolvedValue({ authenticated: true, email: 'x@y.com', plan: 'free' })

    await useAppStore.getState().browseForBinary('node')

    // checkDependencies calls checkAll under the hood
    expect(api.deps.checkAll).toHaveBeenCalled()
  })

  it('does not call checkDependencies when result is null', async () => {
    const api = await getApi()
    api.deps.browseForBinary.mockResolvedValue(null)

    await useAppStore.getState().browseForBinary('node')

    expect(api.deps.checkAll).not.toHaveBeenCalled()
  })

  it('does not call checkDependencies when result status is not "found"', async () => {
    const api = await getApi()
    api.deps.browseForBinary.mockResolvedValue({ status: 'not_found' })

    await useAppStore.getState().browseForBinary('node')

    expect(api.deps.checkAll).not.toHaveBeenCalled()
  })
})
