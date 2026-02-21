import { useStoryStore } from '../stores/useStoryStore'

export function StorySidebarContent() {
  const stories = useStoryStore((s) => s.stories)
  const activeStoryId = useStoryStore((s) => s.activeStoryId)
  const setActiveStory = useStoryStore((s) => s.setActiveStory)

  const statusGroups = [
    { key: 'draft', label: 'Draft', color: 'text-neutral-400' },
    { key: 'ready', label: 'Ready', color: 'text-blue-400' },
    { key: 'in_progress', label: 'In Progress', color: 'text-yellow-400' },
    { key: 'in_review', label: 'In Review', color: 'text-purple-400' },
    { key: 'done', label: 'Done', color: 'text-green-400' },
  ]

  return (
    <div className="flex-1 overflow-y-auto px-2">
      {statusGroups.map((group) => {
        const groupStories = stories.filter((s) => s.status === group.key)
        if (groupStories.length === 0) return null
        return (
          <div key={group.key} className="mb-3">
            <div className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 ${group.color}`}>
              {group.label} ({groupStories.length})
            </div>
            {groupStories.map((story) => (
              <button
                key={story.id}
                onClick={() => setActiveStory(story.id)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm mb-0.5 transition-colors truncate ${
                  activeStoryId === story.id
                    ? 'bg-neutral-700/60 text-white'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
              >
                {story.title}
              </button>
            ))}
          </div>
        )
      })}
      {stories.length === 0 && (
        <p className="text-neutral-600 text-xs text-center mt-8">
          No stories yet. Ask Claude to create one in chat.
        </p>
      )}
    </div>
  )
}
