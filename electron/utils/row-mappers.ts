/**
 * Pure functions that map snake_case DB rows to camelCase renderer objects.
 * Extracted here so they can be imported by handlers and tested in isolation.
 */

export function mapMessageRow(r: Record<string, unknown>) {
  return {
    id: r.id as number,
    role: r.role as string,
    type: r.type as string,
    content: r.content as string,
    toolName: r.tool_name as string | undefined,
    toolInput: r.tool_input as string | undefined,
    toolResult: r.tool_result as string | undefined,
    agentName: r.agent_name as string | undefined,
    agentEmoji: r.agent_emoji as string | undefined,
    agentColor: r.agent_color as string | undefined,
    contentBlocks: r.content_blocks ? JSON.parse(r.content_blocks as string) : undefined,
    replyToId: (r.reply_to_id as number | null) ?? undefined,
    timestamp: new Date(r.created_at as string).getTime(),
  }
}

export function mapStoryRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    projectPath: row.project_path as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as string,
    priority: row.priority as string,
    storyPoints: row.story_points as number | undefined,
    jiraEpicKey: row.jira_epic_key as string | undefined,
    jiraEpicId: row.jira_epic_id as string | undefined,
    jiraProjectKey: row.jira_project_key as string | undefined,
    jiraSyncStatus: (row.jira_sync_status as string) || 'local',
    jiraLastSynced: row.jira_last_synced as string | undefined,
    coverageData: row.coverage_data ? JSON.parse(row.coverage_data as string) : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function mapCriterionRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    storyId: row.story_id as string,
    description: row.description as string,
    orderIndex: row.order_index as number,
    isCovered: Boolean(row.is_covered),
    coveredFiles: row.covered_files ? JSON.parse(row.covered_files as string) : undefined,
    coveredExplanation: row.covered_explanation as string | undefined,
    jiraTaskKey: row.jira_task_key as string | undefined,
    jiraTaskId: row.jira_task_id as string | undefined,
    createdAt: row.created_at as string,
  }
}
