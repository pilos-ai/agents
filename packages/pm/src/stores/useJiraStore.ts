import { create } from 'zustand'
import { getApi, getProjectPath, setOnProjectChange } from './pm-context'
import type { JiraTokens, JiraProject, JiraBoard, JiraSprint, JiraIssue, JiraUser } from '../types'

interface JiraStore {
  // Connection
  connected: boolean
  tokens: JiraTokens | null
  connecting: boolean
  error: string | null

  // Data
  projects: JiraProject[]
  boards: JiraBoard[]
  sprints: JiraSprint[]
  boardIssues: JiraIssue[]  // all issues on board (Kanban or sprint)
  users: JiraUser[]

  // Board config
  selectedProjectKey: string | null
  selectedBoardId: number | null
  selectedBoardName: string | null
  selectedSprintId: number | null
  isKanban: boolean  // true when board has no sprints

  // Loading states
  loadingProjects: boolean
  loadingBoards: boolean
  loadingSprints: boolean
  loadingIssues: boolean

  // Actions
  checkConnection: () => Promise<void>
  authorize: () => Promise<void>
  disconnect: () => Promise<void>
  loadProjects: () => Promise<void>
  loadBoards: (projectKey: string) => Promise<void>
  loadSprints: (boardId: number) => Promise<void>
  loadSprintIssues: (sprintId: number) => Promise<void>
  loadBoardIssues: (boardId: number) => Promise<void>
  loadUsers: (projectKey: string) => Promise<void>
  selectProject: (projectKey: string) => void
  selectBoard: (boardId: number, boardName: string) => void
  selectSprint: (sprintId: number) => void
  saveBoardConfig: () => Promise<void>
  loadBoardConfig: () => Promise<void>
  refreshBoard: () => Promise<void>
}

export const useJiraStore = create<JiraStore>((set, get) => ({
  connected: false,
  tokens: null,
  connecting: false,
  error: null,
  projects: [],
  boards: [],
  sprints: [],
  boardIssues: [],
  users: [],
  selectedProjectKey: null,
  selectedBoardId: null,
  selectedBoardName: null,
  selectedSprintId: null,
  isKanban: false,
  loadingProjects: false,
  loadingBoards: false,
  loadingSprints: false,
  loadingIssues: false,

  checkConnection: async () => {
    const projectPath = getProjectPath()
    if (!projectPath) {
      set({ connected: false, tokens: null })
      return
    }
    try {
      const api = getApi()
      await api.jira.setActiveProject(projectPath)
      const tokens = await api.jira.getTokens(projectPath)
      set({ connected: !!tokens, tokens })
      if (tokens) {
        await get().loadBoardConfig()
      }
    } catch {
      set({ connected: false, tokens: null })
    }
  },

  authorize: async () => {
    const projectPath = getProjectPath()
    if (!projectPath) return
    set({ connecting: true, error: null })
    try {
      const api = getApi()
      const tokens = await api.jira.authorize(projectPath)
      set({ connected: true, tokens, connecting: false })
    } catch (err) {
      set({ connecting: false, error: String(err) })
    }
  },

  disconnect: async () => {
    const projectPath = getProjectPath()
    if (projectPath) {
      await getApi().jira.disconnect(projectPath)
    }
    set({
      connected: false,
      tokens: null,
      projects: [],
      boards: [],
      sprints: [],
      boardIssues: [],
      users: [],
      selectedProjectKey: null,
      selectedBoardId: null,
      selectedBoardName: null,
      selectedSprintId: null,
      isKanban: false,
    })
  },

  loadProjects: async () => {
    set({ loadingProjects: true })
    try {
      const projects = await getApi().jira.getProjects()
      set({ projects, loadingProjects: false })
    } catch {
      set({ loadingProjects: false })
    }
  },

  loadBoards: async (projectKey) => {
    set({ loadingBoards: true })
    try {
      const boards = await getApi().jira.getBoards(projectKey)
      console.log('[JiraStore] loadBoards:', boards.length, 'boards found for', projectKey)
      set({ boards, loadingBoards: false })
    } catch (err) {
      console.error('[JiraStore] loadBoards failed:', err)
      set({ loadingBoards: false })
    }
  },

  loadSprints: async (boardId) => {
    // boardId 0 = no board, use JQL mode
    if (boardId === 0) {
      set({ loadingSprints: false, isKanban: true, sprints: [] })
      await get().loadBoardIssues(0)
      return
    }

    set({ loadingSprints: true })
    try {
      const sprints = await getApi().jira.getSprints(boardId)
      console.log('[JiraStore] getSprints returned:', sprints.length, 'sprints')
      set({ sprints, loadingSprints: false })
      if (sprints.length === 0) {
        // Kanban board — no sprints, load all board issues directly
        console.log('[JiraStore] No sprints found — treating as Kanban board')
        set({ isKanban: true, selectedSprintId: null })
        await get().loadBoardIssues(boardId)
      } else {
        set({ isKanban: false })
        // Auto-select active sprint
        const active = sprints.find((s) => s.state === 'active')
        if (active) {
          set({ selectedSprintId: active.id })
          await get().loadSprintIssues(active.id)
        }
      }
    } catch (err) {
      // getSprints can 400 on Kanban boards — fallback to board issues
      console.log('[JiraStore] getSprints failed (likely Kanban board):', err)
      set({ loadingSprints: false, isKanban: true, sprints: [] })
      await get().loadBoardIssues(boardId)
    }
  },

  loadSprintIssues: async (sprintId) => {
    set({ loadingIssues: true })
    try {
      const boardIssues = await getApi().jira.getSprintIssues(sprintId)
      set({ boardIssues, loadingIssues: false })
    } catch {
      set({ loadingIssues: false })
    }
  },

  loadBoardIssues: async (boardId) => {
    set({ loadingIssues: true })
    const { selectedProjectKey } = get()
    const api = getApi()

    // If boardId is 0 (no board selected), use JQL directly
    if (boardId === 0 && selectedProjectKey) {
      try {
        const boardIssues = await api.jira.getIssues(
          `project = "${selectedProjectKey}" ORDER BY created DESC`
        )
        console.log('[JiraStore] JQL loaded', boardIssues.length, 'issues')
        set({ boardIssues, loadingIssues: false })
      } catch (err) {
        console.error('[JiraStore] JQL load failed:', err)
        set({ loadingIssues: false })
      }
      return
    }

    try {
      const boardIssues = await api.jira.getBoardIssues(boardId)
      console.log('[JiraStore] Board API loaded', boardIssues.length, 'issues')
      set({ boardIssues, loadingIssues: false })
    } catch (err) {
      console.warn('[JiraStore] getBoardIssues failed, falling back to JQL:', err)
      if (selectedProjectKey) {
        try {
          const boardIssues = await api.jira.getIssues(
            `project = "${selectedProjectKey}" ORDER BY created DESC`
          )
          set({ boardIssues, loadingIssues: false })
          return
        } catch (jqlErr) {
          console.warn('[JiraStore] JQL fallback also failed:', jqlErr)
        }
      }
      set({ loadingIssues: false })
    }
  },

  loadUsers: async (projectKey) => {
    try {
      const users = await getApi().jira.getUsers(projectKey)
      set({ users })
    } catch {
      // ignore
    }
  },

  selectProject: (projectKey) => {
    set({ selectedProjectKey: projectKey, boards: [], sprints: [], boardIssues: [], isKanban: false })
  },

  selectBoard: (boardId, boardName) => {
    set({ selectedBoardId: boardId, selectedBoardName: boardName, sprints: [], boardIssues: [], isKanban: false })
  },

  selectSprint: (sprintId) => {
    set({ selectedSprintId: sprintId })
  },

  saveBoardConfig: async () => {
    const { selectedProjectKey, selectedBoardId, selectedBoardName } = get()
    const projectPath = getProjectPath()
    if (selectedProjectKey && selectedBoardId !== null && selectedBoardName && projectPath) {
      await getApi().jira.saveBoardConfig(projectPath, {
        projectKey: selectedProjectKey,
        boardId: selectedBoardId,
        boardName: selectedBoardName,
      })
    }
  },

  loadBoardConfig: async () => {
    const projectPath = getProjectPath()
    if (!projectPath) return
    const config = await getApi().jira.getBoardConfig(projectPath)
    if (config) {
      set({
        selectedProjectKey: config.projectKey,
        selectedBoardId: config.boardId,
        selectedBoardName: config.boardName,
      })
    } else {
      set({
        selectedProjectKey: null,
        selectedBoardId: null,
        selectedBoardName: null,
      })
    }
  },

  refreshBoard: async () => {
    const { selectedSprintId, isKanban, selectedBoardId } = get()
    if (isKanban && selectedBoardId !== null) {
      await get().loadBoardIssues(selectedBoardId)
    } else if (selectedSprintId) {
      await get().loadSprintIssues(selectedSprintId)
    }
  },
}))

// Wire up project-path change handler
setOnProjectChange((currentPath) => {
  // Clear project-specific data, keep connection state
  useJiraStore.setState({
    selectedProjectKey: null,
    selectedBoardId: null,
    selectedBoardName: null,
    selectedSprintId: null,
    sprints: [],
    boardIssues: [],
    boards: [],
    users: [],
    isKanban: false,
  })
  // Re-check Jira connection for the new project (tokens are per-project)
  if (currentPath) {
    useJiraStore.getState().checkConnection()
  } else {
    useJiraStore.setState({ connected: false, tokens: null })
  }
})
