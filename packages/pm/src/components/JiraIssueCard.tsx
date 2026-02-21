import type { JiraIssue } from '../types'
import { useJiraStore } from '../stores/useJiraStore'

interface Props {
  issue: JiraIssue
}

const STATUS_CATEGORY_COLORS: Record<string, string> = {
  'new': 'border-l-neutral-500',
  'indeterminate': 'border-l-blue-500',
  'done': 'border-l-green-500',
  'undefined': 'border-l-neutral-600',
}

const PRIORITY_ICONS: Record<string, string> = {
  'Highest': '⬆',
  'High': '↑',
  'Medium': '→',
  'Low': '↓',
  'Lowest': '⬇',
}

export function JiraIssueCard({ issue }: Props) {
  const siteUrl = useJiraStore((s) => s.tokens?.siteUrl)
  const borderColor = STATUS_CATEGORY_COLORS[issue.status.categoryKey] || STATUS_CATEGORY_COLORS.undefined

  return (
    <div className={`bg-neutral-800/50 rounded-lg border border-neutral-700/50 border-l-2 ${borderColor} p-3 hover:bg-neutral-800 transition-colors cursor-default`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => siteUrl && window.open(`${siteUrl}/browse/${issue.key}`, '_blank')}
            className="text-[10px] font-mono text-blue-400 hover:text-blue-300 mb-0.5 block"
          >
            {issue.key}
          </button>
          <p className="text-sm text-neutral-200 line-clamp-2">{issue.summary}</p>
        </div>
        {issue.priority && (
          <span className="text-xs flex-shrink-0" title={issue.priority.name}>
            {PRIORITY_ICONS[issue.priority.name] || '→'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] text-neutral-500 bg-neutral-700/50 rounded px-1.5 py-0.5">
          {issue.issuetype.name}
        </span>
        <span className="text-[10px] text-neutral-400">
          {issue.status.name}
        </span>
        <div className="flex-1" />
        {issue.assignee && (
          <div className="flex items-center gap-1">
            {issue.assignee.avatarUrl ? (
              <img src={issue.assignee.avatarUrl} className="w-4 h-4 rounded-full" alt="" />
            ) : (
              <div className="w-4 h-4 rounded-full bg-neutral-600 flex items-center justify-center text-[8px] text-white">
                {issue.assignee.displayName.charAt(0)}
              </div>
            )}
            <span className="text-[10px] text-neutral-500">{issue.assignee.displayName.split(' ')[0]}</span>
          </div>
        )}
        {issue.storyPoints != null && (
          <span className="text-[10px] text-neutral-500 bg-neutral-700 rounded-full px-1.5">
            {issue.storyPoints}pt
          </span>
        )}
      </div>
    </div>
  )
}
