import { ipcMain } from 'electron'
import type { SettingsStore } from '../services/settings-store'
import type { JiraOAuthLike, JiraClientLike } from '../types/pm'

export function registerJiraHandlers(jiraOAuth: JiraOAuthLike, jiraClient: JiraClientLike, settings: SettingsStore) {
  ipcMain.handle('jira:setActiveProject', (_event, projectPath: string) => {
    jiraOAuth.setActiveProject(projectPath)
  })

  ipcMain.handle('jira:authorize', (_event, projectPath: string) => {
    jiraOAuth.setActiveProject(projectPath)
    return jiraOAuth.authorize()
  })

  ipcMain.handle('jira:disconnect', (_event, projectPath: string) => {
    jiraOAuth.setActiveProject(projectPath)
    jiraOAuth.disconnect()
  })

  ipcMain.handle('jira:getTokens', (_event, projectPath: string) => {
    jiraOAuth.setActiveProject(projectPath)
    return jiraOAuth.getValidTokens()
  })

  ipcMain.handle('jira:getProjects', () => jiraClient.getProjects())
  ipcMain.handle('jira:getBoards', (_event, projectKey: string) => jiraClient.getBoards(projectKey))
  ipcMain.handle('jira:getBoardIssues', (_event, boardId: number) => jiraClient.getBoardIssues(boardId))
  ipcMain.handle('jira:getSprints', (_event, boardId: number) => jiraClient.getSprints(boardId))
  ipcMain.handle('jira:getSprintIssues', (_event, sprintId: number) => jiraClient.getSprintIssues(sprintId))
  ipcMain.handle('jira:getIssues', (_event, jql: string) => jiraClient.getIssues(jql))

  ipcMain.handle('jira:createIssue', (_event, projectKey: string, summary: string, description: string, issueType: string) =>
    jiraClient.createIssue(projectKey, summary, description, issueType)
  )

  ipcMain.handle('jira:createEpic', (_event, projectKey: string, summary: string, description: string) =>
    jiraClient.createEpic(projectKey, summary, description)
  )

  ipcMain.handle('jira:createSubTask', (_event, parentKey: string, summary: string, description: string) =>
    jiraClient.createSubTask(parentKey, summary, description)
  )

  ipcMain.handle('jira:transitionIssue', (_event, issueKey: string, transitionId: string) =>
    jiraClient.transitionIssue(issueKey, transitionId)
  )

  ipcMain.handle('jira:getTransitions', (_event, issueKey: string) =>
    jiraClient.getTransitions(issueKey)
  )

  ipcMain.handle('jira:getUsers', (_event, projectKey: string) =>
    jiraClient.getUsers(projectKey)
  )

  ipcMain.handle('jira:getIssue', (_event, issueKey: string) =>
    jiraClient.getIssue(issueKey)
  )

  ipcMain.handle('jira:saveBoardConfig', (_event, projectPath: string, config: { projectKey: string; boardId: number; boardName: string }) => {
    const allConfigs = settings.get('jiraBoardConfigs') as Record<string, unknown> || {}
    allConfigs[projectPath] = config
    settings.set('jiraBoardConfigs', allConfigs)
  })

  ipcMain.handle('jira:getBoardConfig', (_event, projectPath: string) => {
    const allConfigs = settings.get('jiraBoardConfigs') as Record<string, unknown> || {}
    return allConfigs[projectPath] || null
  })
}
