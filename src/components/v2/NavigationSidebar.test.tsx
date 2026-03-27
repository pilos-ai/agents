// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// Reset active view between tests (don't use `true` — it replaces action functions)
beforeEach(() => {
  useAppStore.setState({ activeView: 'dashboard' })
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
