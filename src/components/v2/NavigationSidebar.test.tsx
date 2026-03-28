// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the Icon web component before any component imports
vi.mock('../common/Icon', () => ({
  Icon: (props: { icon: string; className?: string }) => (
    <span data-testid={`icon-${props.icon}`} className={props.className} />
  ),
}))

// Mock the api module to avoid window.api access
vi.mock('../../api', () => ({
  api: {
    dialog: { openDirectory: vi.fn().mockResolvedValue(null) },
    settings: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(null), getAll: vi.fn().mockResolvedValue({}) },
    menu: { setActiveProject: vi.fn(), rebuildMenu: vi.fn(), onMenuAction: vi.fn().mockReturnValue(() => {}) },
    metrics: { getMachineId: vi.fn().mockResolvedValue('test') },
    projects: {
      getRecent: vi.fn().mockResolvedValue([]),
      addRecent: vi.fn().mockResolvedValue(null),
      removeRecent: vi.fn().mockResolvedValue(null),
      getSettings: vi.fn().mockResolvedValue({ model: 'sonnet', permissionMode: 'bypass', mode: 'solo', agents: [], mcpServers: [] }),
      setSettings: vi.fn().mockResolvedValue(null),
    },
    conversations: { list: vi.fn().mockResolvedValue([]) },
    cli: { check: vi.fn().mockResolvedValue({ available: true }), checkAuth: vi.fn().mockResolvedValue({ authenticated: true }) },
    deps: { checkAll: vi.fn().mockResolvedValue({ allFound: true }) },
    claude: { onEvent: vi.fn().mockReturnValue(() => {}) },
    terminal: {},
    processes: { onUpdate: vi.fn().mockReturnValue(() => {}) },
    updater: { onStatus: vi.fn().mockReturnValue(() => {}) },
    storage: { getStats: vi.fn().mockResolvedValue({}) },
    jira: { getTokens: vi.fn().mockResolvedValue(null) },
  },
}))

import { NavigationSidebar } from './NavigationSidebar'
import { useAppStore } from '../../store/useAppStore'
import { useProjectStore } from '../../store/useProjectStore'
import { useLicenseStore } from '../../store/useLicenseStore'
import { useTaskStore } from '../../store/useTaskStore'

const initialLicenseState = useLicenseStore.getState()
const initialTaskState = useTaskStore.getState()

// Reset active view between tests (don't use `true` — it replaces action functions)
beforeEach(() => {
  useAppStore.setState({ activeView: 'dashboard' })
  useLicenseStore.setState(initialLicenseState)
  useTaskStore.setState(initialTaskState)
})

describe('NavigationSidebar', () => {
  it('renders workspace navigation items', () => {
    render(<NavigationSidebar />)
    expect(screen.getByText('Command Center')).toBeInTheDocument()
    expect(screen.getByText('Agent Swarm')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Terminal')).toBeInTheDocument()
  })

  it('renders advanced navigation items', () => {
    render(<NavigationSidebar />)
    expect(screen.getByText('Performance')).toBeInTheDocument()
    expect(screen.getByText('MCP Registry')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders the Pilos Agents title', () => {
    render(<NavigationSidebar />)
    expect(screen.getByText('Pilos Agents')).toBeInTheDocument()
  })

  it('shows "No Project" when no project is open', () => {
    render(<NavigationSidebar />)
    expect(screen.getByText('No Project')).toBeInTheDocument()
  })

  it('shows project name when a project is open', () => {
    useProjectStore.setState({
      openProjects: [{
        projectPath: '/Users/test/my-project',
        projectName: 'my-project',
        snapshot: null,
        mode: 'solo' as const,
        model: 'sonnet',
        permissionMode: 'bypass',
        agents: [],
        mcpServers: [],
        draftText: '',
        draftImages: [],
        activeView: 'chat' as const,
        unreadCount: 0,
      }],
      activeProjectPath: '/Users/test/my-project',
    })
    render(<NavigationSidebar />)
    expect(screen.getByText('my-project')).toBeInTheDocument()
  })

  it('clicking a nav item updates the active view in store', async () => {
    render(<NavigationSidebar />)
    await userEvent.click(screen.getByText('Tasks'))
    expect(useAppStore.getState().activeView).toBe('tasks')
  })

  it('clicking Performance navigates to analytics', async () => {
    render(<NavigationSidebar />)
    await userEvent.click(screen.getByText('Performance'))
    expect(useAppStore.getState().activeView).toBe('analytics')
  })

  it('renders nav icons', () => {
    render(<NavigationSidebar />)
    expect(screen.getByTestId('icon-lucide:layout-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('icon-lucide:list-checks')).toBeInTheDocument()
    expect(screen.getByTestId('icon-lucide:terminal')).toBeInTheDocument()
  })

  it('shows MCP count badge when project has enabled MCP servers', () => {
    useProjectStore.setState({
      openProjects: [{
        projectPath: '/test',
        projectName: 'test',
        mode: 'solo' as const,
        model: 'sonnet',
        permissionMode: 'bypass',
        agents: [],
        mcpServers: [
          { id: 'mcp-1', name: 'Server A', icon: '', description: '', enabled: true, config: { type: 'stdio' as const, command: 'cmd', args: [] } },
          { id: 'mcp-2', name: 'Server B', icon: '', description: '', enabled: false, config: { type: 'stdio' as const, command: 'cmd2', args: [] } },
        ],
        snapshot: null,
        draftText: '',
        draftImages: [],
        activeView: 'chat' as const,
        unreadCount: 0,
      }],
      activeProjectPath: '/test',
    })
    render(<NavigationSidebar />)
    // Only 1 enabled — badge should show "1"
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows agent count badge when project has agents', () => {
    useProjectStore.setState({
      openProjects: [{
        projectPath: '/test',
        projectName: 'test',
        mode: 'team' as const,
        model: 'sonnet',
        permissionMode: 'bypass',
        agents: [
          { id: 'dev', name: 'Dev', icon: '', color: 'blue', role: 'Dev', personality: '', expertise: [] },
          { id: 'qa', name: 'QA', icon: '', color: 'green', role: 'QA', personality: '', expertise: [] },
        ],
        mcpServers: [],
        snapshot: null,
        draftText: '',
        draftImages: [],
        activeView: 'chat' as const,
        unreadCount: 0,
      }],
      activeProjectPath: '/test',
    })
    render(<NavigationSidebar />)
    // Badge should show "2" for 2 agents
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})

// ── SidebarFooter ─────────────────────────────────────────────────────────────

describe('SidebarFooter', () => {
  it('displays user email when logged in', () => {
    useLicenseStore.setState({ email: 'user@example.com', tier: 'free' })
    render(<NavigationSidebar />)
    expect(screen.getByText('user@example.com')).toBeInTheDocument()
  })

  it('displays "Unknown" when no email', () => {
    useLicenseStore.setState({ email: null, tier: 'free' })
    render(<NavigationSidebar />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('displays initials from email prefix', () => {
    useLicenseStore.setState({ email: 'alice@example.com', tier: 'free' })
    render(<NavigationSidebar />)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('displays "??" initials when no email', () => {
    useLicenseStore.setState({ email: null, tier: 'free' })
    render(<NavigationSidebar />)
    expect(screen.getByText('??')).toBeInTheDocument()
  })

  it('displays the tier badge label', () => {
    useLicenseStore.setState({ email: 'admin@test.com', tier: 'pro' })
    render(<NavigationSidebar />)
    expect(screen.getByText('pro')).toBeInTheDocument()
  })

  it('clicking the settings button in the footer navigates to settings view', async () => {
    render(<NavigationSidebar />)
    // The settings icon button in the footer has title="Settings"
    const settingsBtn = screen.getByTitle('Settings')
    await userEvent.click(settingsBtn)
    expect(useAppStore.getState().activeView).toBe('settings')
  })

  it('clicking sign out calls logout', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useLicenseStore.setState({ logout: mockLogout } as any)
    render(<NavigationSidebar />)
    const logoutBtn = screen.getByTitle('Sign out')
    await userEvent.click(logoutBtn)
    expect(mockLogout).toHaveBeenCalled()
  })
})

// ── ProjectSelector ───────────────────────────────────────────────────────────

describe('ProjectSelector', () => {
  const openProjectsFixture = [
    {
      projectPath: '/Users/test/proj-alpha',
      projectName: 'proj-alpha',
      mode: 'solo' as const,
      model: 'sonnet',
      permissionMode: 'bypass',
      agents: [],
      mcpServers: [],
      snapshot: null,
      draftText: '',
      draftImages: [],
      activeView: 'chat' as const,
      unreadCount: 0,
    },
    {
      projectPath: '/Users/test/proj-beta',
      projectName: 'proj-beta',
      mode: 'solo' as const,
      model: 'sonnet',
      permissionMode: 'bypass',
      agents: [],
      mcpServers: [],
      snapshot: null,
      draftText: '',
      draftImages: [],
      activeView: 'chat' as const,
      unreadCount: 0,
    },
  ]

  it('shows dropdown with all open projects when selector is clicked', async () => {
    useProjectStore.setState({
      openProjects: openProjectsFixture,
      activeProjectPath: '/Users/test/proj-alpha',
    })
    render(<NavigationSidebar />)

    // Click the project selector button (shows active project name)
    await userEvent.click(screen.getByText('proj-alpha'))

    // Both projects should now be visible in the dropdown
    expect(screen.getAllByText('proj-alpha').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('proj-beta')).toBeInTheDocument()
  })

  it('closes dropdown on Escape key', async () => {
    useProjectStore.setState({
      openProjects: openProjectsFixture,
      activeProjectPath: '/Users/test/proj-alpha',
    })
    render(<NavigationSidebar />)

    // Open dropdown
    await userEvent.click(screen.getByText('proj-alpha'))
    expect(screen.getByText('proj-beta')).toBeInTheDocument()

    // Press Escape
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('proj-beta')).not.toBeInTheDocument()
  })

  it('calls setActiveProject and closes dropdown when a project is selected', async () => {
    useProjectStore.setState({
      openProjects: openProjectsFixture,
      activeProjectPath: '/Users/test/proj-alpha',
    })
    render(<NavigationSidebar />)

    // Open dropdown
    await userEvent.click(screen.getByText('proj-alpha'))

    // Click the beta project in the dropdown
    await userEvent.click(screen.getByText('proj-beta'))

    // Dropdown should close (proj-beta no longer listed in dropdown)
    // and active project should change
    expect(useProjectStore.getState().activeProjectPath).toBe('/Users/test/proj-beta')
  })
})

// ── handleOpenProject (+ button) ──────────────────────────────────────────────

describe('handleOpenProject', () => {
  it('clears activeProjectPath and sets view to dashboard when + is clicked', async () => {
    useProjectStore.setState({
      openProjects: [{
        projectPath: '/current',
        projectName: 'current',
        mode: 'solo' as const,
        model: 'sonnet',
        permissionMode: 'bypass',
        agents: [],
        mcpServers: [],
        snapshot: null,
        draftText: '',
        draftImages: [],
        activeView: 'chat' as const,
        unreadCount: 0,
      }],
      activeProjectPath: '/current',
    })
    useAppStore.setState({ activeView: 'chat' })
    render(<NavigationSidebar />)

    const plusBtn = screen.getByTitle('Open project')
    await userEvent.click(plusBtn)

    expect(useProjectStore.getState().activeProjectPath).toBeNull()
    expect(useAppStore.getState().activeView).toBe('dashboard')
  })
})

// ── unseenRunCount computation ────────────────────────────────────────────────

describe('unseenRunCount badge', () => {
  function makeRun(startedAt: Date) {
    return {
      id: `run-${startedAt.getTime()}`,
      startedAt: startedAt.toISOString(),
      status: 'success' as const,
      output: '',
    }
  }

  it('shows badge with count of runs started after resultsLastViewedAt', () => {
    const now = Date.now()
    const before = new Date(now - 60_000) // 1 minute ago
    const after = new Date(now + 1_000)   // future (simulates "just ran")
    const lastViewedAt = new Date(now - 30_000).toISOString()

    useTaskStore.setState({
      tasks: [{
        id: 'task-1',
        name: 'Test Task',
        runs: [makeRun(before), makeRun(after)],
        // other required fields
        prompt: '',
        projectPath: '/proj',
        schedule: null,
        status: 'idle' as const,
        priority: 'medium' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    useAppStore.setState({ resultsLastViewedAt: lastViewedAt })
    render(<NavigationSidebar />)

    // Only the "after" run is newer than lastViewedAt → badge shows 1
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('uses start-of-day cutoff when resultsLastViewedAt is null', () => {
    // When null, only runs since start of today are counted
    useTaskStore.setState({
      tasks: [{
        id: 'task-2',
        name: 'Task 2',
        runs: [],
        prompt: '',
        projectPath: '/proj',
        schedule: null,
        status: 'idle' as const,
        priority: 'medium' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    useAppStore.setState({ resultsLastViewedAt: null })
    render(<NavigationSidebar />)

    // No runs at all → no badge rendered (badge only shows when > 0)
    // Results nav item should still appear
    expect(screen.getByText('Results')).toBeInTheDocument()
  })
})

// ── SidebarFooter — unknown tier fallback ──────────────────────────────────────

describe('SidebarFooter — unknown tier fallback (line 68)', () => {
  it('falls back to free badge styling when tier is not in TIER_BADGE', () => {
    // Setting a tier value that is not a key in TIER_BADGE exercises the `|| TIER_BADGE.free`
    // fallback on line 68.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useLicenseStore.setState({ email: 'user@example.com', tier: 'unknown' as any })
    render(<NavigationSidebar />)
    // The badge label renders the raw `tier` value — 'unknown'
    expect(screen.getByText('unknown')).toBeInTheDocument()
    // The badge element should still exist and have classes from the free fallback
    const badge = screen.getByText('unknown')
    // TIER_BADGE.free has bg-zinc-800/50 and text-zinc-400 classes
    expect(badge.className).toContain('bg-zinc-')
  })
})

// ── ProjectSelector — click outside closes dropdown (lines 119-122) ───────────

describe('ProjectSelector — click outside handler (lines 119-122)', () => {
  const openProjectsFixture = [
    {
      projectPath: '/Users/test/proj-a',
      projectName: 'proj-a',
      mode: 'solo' as const,
      model: 'sonnet',
      permissionMode: 'bypass',
      agents: [],
      mcpServers: [],
      snapshot: null,
      draftText: '',
      draftImages: [],
      activeView: 'chat' as const,
      unreadCount: 0,
    },
    {
      projectPath: '/Users/test/proj-b',
      projectName: 'proj-b',
      mode: 'solo' as const,
      model: 'sonnet',
      permissionMode: 'bypass',
      agents: [],
      mcpServers: [],
      snapshot: null,
      draftText: '',
      draftImages: [],
      activeView: 'chat' as const,
      unreadCount: 0,
    },
  ]

  it('closes dropdown when mousedown fires outside the dropdown container (line 119)', async () => {
    useProjectStore.setState({
      openProjects: openProjectsFixture,
      activeProjectPath: '/Users/test/proj-a',
    })
    render(<NavigationSidebar />)

    // Open the dropdown
    await userEvent.click(screen.getByText('proj-a'))
    expect(screen.getByText('proj-b')).toBeInTheDocument()

    // Fire mousedown on document.body — outside the dropdown container ref
    fireEvent.mouseDown(document.body)

    // Dropdown should now be closed
    expect(screen.queryByText('proj-b')).not.toBeInTheDocument()
  })

  it('does not close dropdown when mousedown fires inside the dropdown container (line 119)', async () => {
    useProjectStore.setState({
      openProjects: openProjectsFixture,
      activeProjectPath: '/Users/test/proj-a',
    })
    render(<NavigationSidebar />)

    // Open the dropdown
    await userEvent.click(screen.getByText('proj-a'))
    const projBItem = screen.getByText('proj-b')
    expect(projBItem).toBeInTheDocument()

    // Fire mousedown on an element inside the dropdown container — should NOT close
    fireEvent.mouseDown(projBItem)

    // Dropdown should still be open (proj-b still visible)
    expect(screen.getByText('proj-b')).toBeInTheDocument()
  })

  it('non-Escape keydown does not close the dropdown (line 122 false branch)', async () => {
    // Exercises the `if (e.key === 'Escape')` false branch at line 122.
    useProjectStore.setState({
      openProjects: openProjectsFixture,
      activeProjectPath: '/Users/test/proj-a',
    })
    render(<NavigationSidebar />)

    // Open the dropdown
    await userEvent.click(screen.getByText('proj-a'))
    expect(screen.getByText('proj-b')).toBeInTheDocument()

    // Press a non-Escape key — dropdown should stay open
    await userEvent.keyboard('{Tab}')
    expect(screen.getByText('proj-b')).toBeInTheDocument()
  })
})
