import { useState } from 'react'
import { useStoryStore } from '../stores/useStoryStore'
import { useJiraStore } from '../stores/useJiraStore'
import type { StoryStatus, StoryPriority } from '../types'
import { StatusBadge } from './StatusBadge'
import { PriorityBadge } from './PriorityBadge'
import { JiraLinkBadge } from './JiraLinkBadge'
import { CoveragePanel } from './CoveragePanel'

export function StoryDetailPanel() {
  const story = useStoryStore((s) => s.activeStory)
  const criteria = useStoryStore((s) => s.criteria)
  const updateStory = useStoryStore((s) => s.updateStory)
  const deleteStory = useStoryStore((s) => s.deleteStory)
  const addCriterion = useStoryStore((s) => s.addCriterion)
  const deleteCriterion = useStoryStore((s) => s.deleteCriterion)
  const pushToJira = useStoryStore((s) => s.pushToJira)
  const syncFromJira = useStoryStore((s) => s.syncFromJira)
  const analyzeCoverage = useStoryStore((s) => s.analyzeCoverage)

  const jiraConnected = useJiraStore((s) => s.connected)
  const siteUrl = useJiraStore((s) => s.tokens?.siteUrl)
  const selectedProjectKey = useJiraStore((s) => s.selectedProjectKey)

  const [newCriterion, setNewCriterion] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
  const [pushing, setPushing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  if (!story) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Select a story to view details
      </div>
    )
  }

  const handleAddCriterion = async () => {
    if (!newCriterion.trim()) return
    await addCriterion(story.id, newCriterion.trim())
    setNewCriterion('')
  }

  const handlePushToJira = async () => {
    if (!selectedProjectKey) return
    setPushing(true)
    try {
      await pushToJira(story.id, selectedProjectKey)
    } finally {
      setPushing(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await syncFromJira(story.id)
    } finally {
      setSyncing(false)
    }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      await analyzeCoverage(story.id)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div>
        {editingTitle ? (
          <input
            autoFocus
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={() => {
              if (titleValue.trim()) updateStory(story.id, { title: titleValue.trim() })
              setEditingTitle(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (titleValue.trim()) updateStory(story.id, { title: titleValue.trim() })
                setEditingTitle(false)
              }
              if (e.key === 'Escape') setEditingTitle(false)
            }}
            className="w-full bg-neutral-800 text-xl font-semibold text-white px-2 py-1 rounded border border-blue-500/50 outline-none"
          />
        ) : (
          <h2
            onClick={() => { setTitleValue(story.title); setEditingTitle(true) }}
            className="text-xl font-semibold text-white cursor-pointer hover:text-blue-400 transition-colors"
          >
            {story.title}
          </h2>
        )}

        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <StatusBadge status={story.status as StoryStatus} size="md" />
          <PriorityBadge priority={story.priority as StoryPriority} />
          {story.jiraEpicKey && <JiraLinkBadge issueKey={story.jiraEpicKey} siteUrl={siteUrl} />}
          {story.storyPoints && (
            <span className="text-xs text-neutral-500">{story.storyPoints} points</span>
          )}
        </div>
      </div>

      {/* Status & Priority controls */}
      <div className="flex gap-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Status</label>
          <select
            value={story.status}
            onChange={(e) => updateStory(story.id, { status: e.target.value as StoryStatus })}
            className="bg-neutral-800 text-sm text-neutral-200 rounded px-2 py-1 border border-neutral-700 outline-none"
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Priority</label>
          <select
            value={story.priority}
            onChange={(e) => updateStory(story.id, { priority: e.target.value as StoryPriority })}
            className="bg-neutral-800 text-sm text-neutral-200 rounded px-2 py-1 border border-neutral-700 outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Points</label>
          <input
            type="number"
            min={0}
            max={100}
            value={story.storyPoints || ''}
            onChange={(e) => updateStory(story.id, { storyPoints: e.target.value ? Number(e.target.value) : undefined })}
            className="w-16 bg-neutral-800 text-sm text-neutral-200 rounded px-2 py-1 border border-neutral-700 outline-none"
            placeholder="–"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Description</label>
        {editingDesc ? (
          <textarea
            autoFocus
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={() => {
              updateStory(story.id, { description: descValue })
              setEditingDesc(false)
            }}
            className="w-full bg-neutral-800 text-sm text-neutral-200 rounded-lg px-3 py-2 border border-blue-500/50 outline-none resize-y min-h-[80px]"
          />
        ) : (
          <div
            onClick={() => { setDescValue(story.description); setEditingDesc(true) }}
            className="text-sm text-neutral-300 bg-neutral-800/50 rounded-lg px-3 py-2 min-h-[40px] cursor-pointer hover:bg-neutral-800 transition-colors whitespace-pre-wrap"
          >
            {story.description || 'Click to add description...'}
          </div>
        )}
      </div>

      {/* Acceptance Criteria */}
      <div>
        <label className="block text-xs text-neutral-500 mb-2">Acceptance Criteria ({criteria.length})</label>
        <div className="space-y-1.5 mb-3">
          {criteria.map((c) => (
            <div key={c.id} className="flex items-start gap-2 group">
              <span className={`mt-1 text-xs ${c.isCovered ? 'text-green-400' : 'text-neutral-600'}`}>
                {c.isCovered ? '✓' : '○'}
              </span>
              <span className="flex-1 text-sm text-neutral-200">{c.description}</span>
              {c.jiraTaskKey && <JiraLinkBadge issueKey={c.jiraTaskKey} siteUrl={siteUrl} />}
              <button
                onClick={() => deleteCriterion(c.id)}
                className="hidden group-hover:block text-neutral-600 hover:text-red-400 text-xs"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add acceptance criterion..."
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCriterion() }}
            className="flex-1 bg-neutral-800 text-sm text-neutral-200 rounded px-3 py-1.5 border border-neutral-700 outline-none focus:border-blue-500 placeholder:text-neutral-600"
          />
          <button
            onClick={handleAddCriterion}
            disabled={!newCriterion.trim()}
            className="px-3 py-1.5 text-xs bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white rounded transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Jira sync */}
      {jiraConnected && (
        <div className="border-t border-neutral-800 pt-4">
          <label className="block text-xs text-neutral-500 mb-2">Jira Integration</label>
          <div className="flex gap-2">
            {!story.jiraEpicKey ? (
              <button
                onClick={handlePushToJira}
                disabled={pushing || !selectedProjectKey}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-md transition-colors"
              >
                {pushing ? 'Pushing...' : `Push to Jira (${selectedProjectKey})`}
              </button>
            ) : (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-3 py-1.5 text-xs bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-md transition-colors"
              >
                {syncing ? 'Syncing...' : 'Sync from Jira'}
              </button>
            )}
            {story.jiraLastSynced && (
              <span className="text-[10px] text-neutral-600 self-center">
                Last synced: {new Date(story.jiraLastSynced).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Coverage */}
      <div className="border-t border-neutral-800 pt-4">
        <CoveragePanel criteria={criteria} analyzing={analyzing} onAnalyze={handleAnalyze} />
      </div>

      {/* Delete */}
      <div className="border-t border-neutral-800 pt-4">
        <button
          onClick={() => deleteStory(story.id)}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Delete Story
        </button>
      </div>
    </div>
  )
}
