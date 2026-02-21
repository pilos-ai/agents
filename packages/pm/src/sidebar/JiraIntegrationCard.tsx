import { useJiraStore } from '../stores/useJiraStore'

export function JiraIntegrationCard() {
  const connected = useJiraStore((s) => s.connected)
  const tokens = useJiraStore((s) => s.tokens)
  const connecting = useJiraStore((s) => s.connecting)
  const error = useJiraStore((s) => s.error)
  const authorize = useJiraStore((s) => s.authorize)
  const disconnect = useJiraStore((s) => s.disconnect)
  const selectedProjectKey = useJiraStore((s) => s.selectedProjectKey)
  const selectedBoardName = useJiraStore((s) => s.selectedBoardName)

  return (
    <div className="p-4 rounded-lg border border-neutral-700 bg-neutral-800/30 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-[#1868DB]/20 flex items-center justify-center">
          <svg className="w-[18px] h-[18px]" viewBox="0 0 256 256" fill="none">
            <defs>
              <linearGradient id="jira-grad-1" x1="98.03%" y1="0.16%" x2="58.89%" y2="40.77%">
                <stop stopColor="#0052CC" offset="18%" />
                <stop stopColor="#2684FF" offset="100%" />
              </linearGradient>
              <linearGradient id="jira-grad-2" x1="100.67%" y1="0.46%" x2="55.40%" y2="44.73%">
                <stop stopColor="#0052CC" offset="18%" />
                <stop stopColor="#2684FF" offset="100%" />
              </linearGradient>
            </defs>
            <path d="M244.658 0H121.707c0 14.72 5.847 28.837 16.256 39.246 10.409 10.409 24.526 16.256 39.246 16.256h22.649v21.867c.02 30.625 24.841 55.447 55.467 55.467V10.667C255.324 4.776 250.549 0 244.658 0z" fill="#2684FF" />
            <path d="M183.822 61.262H60.871c.02 30.625 24.841 55.447 55.467 55.467h22.649v21.938c.039 30.625 24.877 55.431 55.502 55.431V71.929c0-5.891-4.776-10.667-10.667-10.667z" fill="url(#jira-grad-1)" />
            <path d="M122.951 122.489H0c0 30.653 24.849 55.502 55.502 55.502h22.72v21.867c.02 30.596 24.798 55.406 55.396 55.467V133.156c0-5.892-4.776-10.667-10.667-10.667z" fill="url(#jira-grad-2)" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-200">Jira</p>
          <p className="text-xs text-neutral-500">Atlassian issue tracking</p>
        </div>
        {connected && <div className="w-2 h-2 bg-green-500 rounded-full" />}
      </div>

      {connected && tokens ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500">Site:</span>
            <span className="text-neutral-300">{tokens.siteName}</span>
            <span className="text-neutral-600">({tokens.siteUrl})</span>
          </div>

          {selectedProjectKey && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-500">Board:</span>
              <span className="text-neutral-300">{selectedProjectKey} / {selectedBoardName || 'All issues'}</span>
            </div>
          )}

          <button
            onClick={disconnect}
            className="px-3 py-1.5 text-xs text-red-400 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">
            Push stories as epics, view boards, and track progress.
          </p>

          <button
            onClick={authorize}
            disabled={connecting}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors flex items-center gap-2"
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>

          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
