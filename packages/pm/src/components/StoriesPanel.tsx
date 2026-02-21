import { useEffect, useMemo, useState } from 'react'
import { useStoryStore } from '../stores/useStoryStore'
import { getProjectPath, getSetActiveView } from '../stores/pm-context'
import { StoryFilters } from './StoryFilters'
import { StorySidebarList } from './StorySidebarList'
import { StoryDetailPanel } from './StoryDetailPanel'

export function StoriesPanel() {
  const stories = useStoryStore((s) => s.stories)
  const loadStories = useStoryStore((s) => s.loadStories)
  const createStory = useStoryStore((s) => s.createStory)
  const setActiveStory = useStoryStore((s) => s.setActiveStory)
  const filterStatus = useStoryStore((s) => s.filterStatus)
  const filterSearch = useStoryStore((s) => s.filterSearch)

  const activeProjectPath = getProjectPath()
  const setActiveView = getSetActiveView()

  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (activeProjectPath) {
      loadStories(activeProjectPath)
    }
  }, [activeProjectPath])

  const filteredStories = useMemo(() => {
    let result = stories
    if (filterStatus) {
      result = result.filter((s) => s.status === filterStatus)
    }
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      result = result.filter((s) =>
        s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    }
    return result
  }, [stories, filterStatus, filterSearch])

  const handleCreateStory = async () => {
    setCreating(true)
    try {
      const story = await createStory({
        title: 'Untitled Story',
        projectPath: activeProjectPath || '',
        status: 'draft',
        priority: 'medium',
      })
      await setActiveStory(story.id)
    } finally {
      setCreating(false)
    }
  }

  if (stories.length === 0 && !filterStatus && !filterSearch) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md px-8 space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-neutral-800/80 flex items-center justify-center">
            <svg className="w-8 h-8 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">User Stories</h3>
            <p className="text-sm text-neutral-400 mt-2">
              Create user stories with acceptance criteria, track their status, push them to Jira as epics, and analyze code coverage.
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={handleCreateStory}
              disabled={creating}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? 'Creating...' : 'Create Story'}
            </button>
            <button
              onClick={() => setActiveView('chat')}
              className="w-full px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm rounded-lg transition-colors"
            >
              Ask Claude in Chat
            </button>
          </div>
          <p className="text-xs text-neutral-600">
            Tip: In chat, ask Claude to "create a user story for [feature]" and it will generate one you can save here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <StoryFilters onCreateStory={handleCreateStory} creating={creating} />
      <div className="flex flex-1 overflow-hidden">
        {/* Story list (left) */}
        <div className="w-80 flex-shrink-0 border-r border-neutral-800 overflow-y-auto">
          <StorySidebarList stories={filteredStories} />
        </div>
        {/* Story detail (right) */}
        <div className="flex-1 overflow-hidden">
          <StoryDetailPanel />
        </div>
      </div>
    </div>
  )
}
