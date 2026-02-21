import { useStoryStore } from '../stores/useStoryStore'
import type { StoryStatus } from '../types'

const STATUSES: { key: StoryStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'ready', label: 'Ready' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'done', label: 'Done' },
]

export function StoryFilters({ onCreateStory, creating }: { onCreateStory?: () => void; creating?: boolean }) {
  const filterStatus = useStoryStore((s) => s.filterStatus)
  const setFilterStatus = useStoryStore((s) => s.setFilterStatus)
  const filterSearch = useStoryStore((s) => s.filterSearch)
  const setFilterSearch = useStoryStore((s) => s.setFilterSearch)

  return (
    <div className="flex items-center gap-3 p-3 border-b border-neutral-800">
      <input
        type="text"
        placeholder="Search stories..."
        value={filterSearch}
        onChange={(e) => setFilterSearch(e.target.value)}
        className="flex-1 bg-neutral-800 text-sm text-neutral-100 rounded-lg px-3 py-1.5 outline-none border border-neutral-700 focus:border-blue-500 placeholder:text-neutral-600"
      />
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilterStatus(s.key === 'all' ? null : s.key)}
            className={`px-2 py-1 text-[10px] rounded-full font-medium transition-colors ${
              (s.key === 'all' && !filterStatus) || filterStatus === s.key
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {onCreateStory && (
        <button
          onClick={onCreateStory}
          disabled={creating}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap"
        >
          + Story
        </button>
      )}
    </div>
  )
}
