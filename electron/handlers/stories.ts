import { ipcMain, BrowserWindow } from 'electron'
import { mapStoryRow, mapCriterionRow } from '../utils/row-mappers'
import type { Database } from '../core/database'
import type { JiraClientLike } from '../types/pm'

export function registerStoriesHandlers(database: Database, jiraClient: JiraClientLike, mainWindow: BrowserWindow) {
  ipcMain.handle('stories:list', (_event, projectPath: string) =>
    database.listStories(projectPath).map(mapStoryRow)
  )

  ipcMain.handle('stories:get', (_event, id: string) => {
    const row = database.getStory(id)
    return row ? mapStoryRow(row) : null
  })

  ipcMain.handle('stories:create', (_event, story: Record<string, unknown>) => {
    const row = database.createStory({
      project_path: story.projectPath,
      title: story.title,
      description: story.description,
      status: story.status,
      priority: story.priority,
      story_points: story.storyPoints,
      jira_epic_key: story.jiraEpicKey,
      jira_epic_id: story.jiraEpicId,
      jira_project_key: story.jiraProjectKey,
      jira_sync_status: story.jiraSyncStatus,
      coverage_data: story.coverageData ? JSON.stringify(story.coverageData) : null,
    })
    return mapStoryRow(row)
  })

  ipcMain.handle('stories:update', (_event, id: string, updates: Record<string, unknown>) => {
    const dbUpdates: Record<string, unknown> = {}
    if ('title' in updates) dbUpdates.title = updates.title
    if ('description' in updates) dbUpdates.description = updates.description
    if ('status' in updates) dbUpdates.status = updates.status
    if ('priority' in updates) dbUpdates.priority = updates.priority
    if ('storyPoints' in updates) dbUpdates.story_points = updates.storyPoints
    if ('jiraEpicKey' in updates) dbUpdates.jira_epic_key = updates.jiraEpicKey
    if ('jiraEpicId' in updates) dbUpdates.jira_epic_id = updates.jiraEpicId
    if ('jiraProjectKey' in updates) dbUpdates.jira_project_key = updates.jiraProjectKey
    if ('jiraSyncStatus' in updates) dbUpdates.jira_sync_status = updates.jiraSyncStatus
    if ('jiraLastSynced' in updates) dbUpdates.jira_last_synced = updates.jiraLastSynced
    if ('coverageData' in updates) dbUpdates.coverage_data = updates.coverageData ? JSON.stringify(updates.coverageData) : null
    const row = database.updateStory(id, dbUpdates)
    return mapStoryRow(row)
  })

  ipcMain.handle('stories:delete', (_event, id: string) => {
    database.deleteStory(id)
  })

  ipcMain.handle('stories:getCriteria', (_event, storyId: string) =>
    database.getStoryCriteria(storyId).map(mapCriterionRow)
  )

  ipcMain.handle('stories:addCriterion', (_event, storyId: string, description: string) => {
    const row = database.addStoryCriterion(storyId, description)
    return mapCriterionRow(row)
  })

  ipcMain.handle('stories:updateCriterion', (_event, id: string, updates: Record<string, unknown>) => {
    const dbUpdates: Record<string, unknown> = {}
    if ('description' in updates) dbUpdates.description = updates.description
    if ('orderIndex' in updates) dbUpdates.order_index = updates.orderIndex
    if ('isCovered' in updates) dbUpdates.is_covered = updates.isCovered ? 1 : 0
    if ('coveredFiles' in updates) dbUpdates.covered_files = updates.coveredFiles ? JSON.stringify(updates.coveredFiles) : null
    if ('coveredExplanation' in updates) dbUpdates.covered_explanation = updates.coveredExplanation
    if ('jiraTaskKey' in updates) dbUpdates.jira_task_key = updates.jiraTaskKey
    if ('jiraTaskId' in updates) dbUpdates.jira_task_id = updates.jiraTaskId
    const row = database.updateStoryCriterion(id, dbUpdates)
    return mapCriterionRow(row)
  })

  ipcMain.handle('stories:deleteCriterion', (_event, id: string) => {
    database.deleteStoryCriterion(id)
  })

  ipcMain.handle('stories:reorderCriteria', (_event, storyId: string, criterionIds: string[]) => {
    database.reorderStoryCriteria(storyId, criterionIds)
  })

  ipcMain.handle('stories:pushToJira', async (_event, storyId: string, projectKey: string) => {
    const storyRow = database.getStory(storyId)
    if (!storyRow) throw new Error('Story not found')
    const story = mapStoryRow(storyRow)

    const epic = await jiraClient.createEpic(projectKey, story.title, story.description) as { key: string; id: string }

    const criteria = database.getStoryCriteria(storyId)
    for (const row of criteria) {
      const criterion = mapCriterionRow(row)
      const subTask = await jiraClient.createSubTask(epic.key, criterion.description, '') as { key: string; id: string }
      database.updateStoryCriterion(criterion.id, {
        jira_task_key: subTask.key,
        jira_task_id: subTask.id,
      })
    }

    database.updateStory(storyId, {
      jira_epic_key: epic.key,
      jira_epic_id: epic.id,
      jira_project_key: projectKey,
      jira_sync_status: 'synced',
      jira_last_synced: new Date().toISOString(),
    })
  })

  ipcMain.handle('stories:syncFromJira', async (_event, storyId: string) => {
    const storyRow = database.getStory(storyId)
    if (!storyRow || !storyRow.jira_epic_key) throw new Error('Story not synced to Jira')

    const criteria = database.getStoryCriteria(storyId)
    for (const row of criteria) {
      if (row.jira_task_key) {
        const issue = await jiraClient.getIssue(row.jira_task_key as string) as { status: { categoryKey: string } }
        const isDone = issue.status.categoryKey === 'done'
        database.updateStoryCriterion(row.id as string, { is_covered: isDone ? 1 : 0 })
      }
    }

    database.updateStory(storyId, {
      jira_sync_status: 'synced',
      jira_last_synced: new Date().toISOString(),
    })
  })

  ipcMain.handle('stories:analyzeCoverage', (_event, storyId: string) => {
    mainWindow.webContents.send('stories:coverageStarted', { storyId })
  })
}
