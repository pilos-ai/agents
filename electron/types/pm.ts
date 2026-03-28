/** Minimal interface satisfied by @pilos/agents-pm JiraOAuth */
export interface JiraOAuthLike {
  setActiveProject(projectPath: string): void
  authorize(): Promise<unknown>
  disconnect(): void
  getValidTokens(): Promise<void>
}

/** Minimal interface satisfied by @pilos/agents-pm JiraClient */
export interface JiraClientLike {
  getProjects(): Promise<unknown[]>
  getBoards(projectKey: string): Promise<unknown[]>
  getBoardIssues(boardId: number): Promise<unknown[]>
  getSprints(boardId: number): Promise<unknown[]>
  getSprintIssues(sprintId: number): Promise<unknown[]>
  getIssues(jql: string): Promise<unknown[]>
  createIssue(projectKey: string, summary: string, description: string, issueType: string): Promise<unknown>
  createEpic(projectKey: string, summary: string, description: string): Promise<unknown>
  createSubTask(parentKey: string, summary: string, description: string): Promise<unknown>
  transitionIssue(issueKey: string, transitionId: string): Promise<void>
  getTransitions(issueKey: string): Promise<unknown[]>
  getUsers(projectKey: string): Promise<unknown[]>
  getIssue(issueKey: string): Promise<unknown>
}
