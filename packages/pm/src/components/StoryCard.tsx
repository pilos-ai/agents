import type { Story, StoryStatus, StoryPriority } from '../types'
import { StatusBadge } from './StatusBadge'
import { PriorityBadge } from './PriorityBadge'
import { CoverageBar } from './CoverageBar'
import { JiraLinkBadge } from './JiraLinkBadge'
import { useJiraStore } from '../stores/useJiraStore'

interface Props {
  story: Story
  isActive: boolean
  onClick: () => void
}

export function StoryCard({ story, isActive, onClick }: Props) {
  const siteUrl = useJiraStore((s) => s.tokens?.siteUrl)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isActive
          ? 'border-blue-500/50 bg-blue-500/5'
          : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-sm font-medium text-neutral-100 line-clamp-2">{story.title}</h3>
        {story.storyPoints && (
          <span className="text-[10px] font-medium text-neutral-500 bg-neutral-800 rounded-full px-1.5 py-0.5 flex-shrink-0">
            {story.storyPoints}pt
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={story.status as StoryStatus} />
        <PriorityBadge priority={story.priority as StoryPriority} />
        {story.jiraEpicKey && <JiraLinkBadge issueKey={story.jiraEpicKey} siteUrl={siteUrl} />}
      </div>

      {story.coverageData && story.coverageData.totalCriteria > 0 && (
        <div className="mt-2">
          <CoverageBar covered={story.coverageData.coveredCriteria} total={story.coverageData.totalCriteria} />
        </div>
      )}
    </button>
  )
}
