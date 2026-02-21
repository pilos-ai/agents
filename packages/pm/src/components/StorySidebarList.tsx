import { useStoryStore } from '../stores/useStoryStore'
import type { Story, StoryStatus } from '../types'
import { StoryCard } from './StoryCard'

interface Props {
  stories: Story[]
}

const STATUS_ORDER: StoryStatus[] = ['in_progress', 'ready', 'draft', 'in_review', 'done']

export function StorySidebarList({ stories }: Props) {
  const activeStoryId = useStoryStore((s) => s.activeStoryId)
  const setActiveStory = useStoryStore((s) => s.setActiveStory)

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    stories: stories.filter((s) => s.status === status),
  })).filter((g) => g.stories.length > 0)

  if (stories.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-neutral-500">No stories match your filters.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1 p-2">
      {grouped.map((group) => (
        <div key={group.status}>
          {grouped.length > 1 && (
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 px-1 py-1 mt-2 first:mt-0">
              {group.status.replace('_', ' ')} ({group.stories.length})
            </div>
          )}
          {group.stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              isActive={activeStoryId === story.id}
              onClick={() => setActiveStory(story.id)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
