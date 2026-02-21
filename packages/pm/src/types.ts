import type {
  JiraTokens, JiraProject, JiraBoard, JiraSprint, JiraIssue, JiraUser, JiraTransition,
  Story, StoryCriterion, CoverageResult,
  StoryStatus, StoryPriority, JiraSyncStatus,
} from '../../../src/types'

// Re-export all PM-related types for internal use
export type {
  JiraTokens, JiraProject, JiraBoard, JiraSprint, JiraIssue, JiraUser, JiraTransition,
  Story, StoryCriterion, CoverageResult,
  StoryStatus, StoryPriority, JiraSyncStatus,
}

/** Subset of ElectronAPI needed by PM stores */
export interface PmApi {
  jira: {
    setActiveProject: (projectPath: string) => Promise<void>
    authorize: (projectPath: string) => Promise<JiraTokens>
    disconnect: (projectPath: string) => Promise<void>
    getTokens: (projectPath: string) => Promise<JiraTokens | null>
    getProjects: () => Promise<JiraProject[]>
    getBoards: (projectKey: string) => Promise<JiraBoard[]>
    getBoardIssues: (boardId: number) => Promise<JiraIssue[]>
    getSprints: (boardId: number) => Promise<JiraSprint[]>
    getSprintIssues: (sprintId: number) => Promise<JiraIssue[]>
    getIssues: (jql: string) => Promise<JiraIssue[]>
    createEpic: (projectKey: string, summary: string, description: string) => Promise<JiraIssue>
    createSubTask: (parentKey: string, summary: string, description: string) => Promise<JiraIssue>
    transitionIssue: (issueKey: string, transitionId: string) => Promise<void>
    getTransitions: (issueKey: string) => Promise<JiraTransition[]>
    getUsers: (projectKey: string) => Promise<JiraUser[]>
    getIssue: (issueKey: string) => Promise<JiraIssue>
    saveBoardConfig: (projectPath: string, config: { projectKey: string; boardId: number; boardName: string }) => Promise<void>
    getBoardConfig: (projectPath: string) => Promise<{ projectKey: string; boardId: number; boardName: string } | null>
  }
  stories: {
    list: (projectPath: string) => Promise<Story[]>
    get: (id: string) => Promise<Story | null>
    create: (story: Partial<Story>) => Promise<Story>
    update: (id: string, updates: Partial<Story>) => Promise<Story>
    delete: (id: string) => Promise<void>
    getCriteria: (storyId: string) => Promise<StoryCriterion[]>
    addCriterion: (storyId: string, description: string) => Promise<StoryCriterion>
    updateCriterion: (id: string, updates: Partial<StoryCriterion>) => Promise<StoryCriterion>
    deleteCriterion: (id: string) => Promise<void>
    reorderCriteria: (storyId: string, criterionIds: string[]) => Promise<void>
    pushToJira: (storyId: string, projectKey: string) => Promise<void>
    syncFromJira: (storyId: string) => Promise<void>
    analyzeCoverage: (storyId: string) => Promise<void>
    onCoverageProgress: (callback: (data: { storyId: string; progress: number; message: string }) => void) => () => void
  }
}

/** Dependencies injected from the main app into PM stores */
export interface PmDependencies {
  api: PmApi
  getProjectPath: () => string
  setActiveView: (view: string) => void
  subscribeProjectPath: (callback: (projectPath: string | null) => void) => () => void
}
