interface Props {
  issueKey: string
  siteUrl?: string
}

export function JiraLinkBadge({ issueKey, siteUrl }: Props) {
  const handleClick = () => {
    if (siteUrl) {
      window.open(`${siteUrl}/browse/${issueKey}`, '_blank')
    }
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-medium text-blue-400 bg-blue-500/10 rounded hover:bg-blue-500/20 transition-colors"
      title={`Open ${issueKey} in Jira`}
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 24V12.518a1.005 1.005 0 00-1.005-1.005z" />
        <path d="M5.024 5.26H16.59a5.218 5.218 0 01-5.232 5.214h-2.13v2.058A5.216 5.216 0 014.018 17.745V6.265A1.005 1.005 0 015.024 5.26z" opacity=".65" />
        <path d="M11.571 0H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 12.485V1.005A1.005 1.005 0 0011.571 0z" opacity=".3" />
      </svg>
      {issueKey}
    </button>
  )
}
