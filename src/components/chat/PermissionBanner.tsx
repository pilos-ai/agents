import { useConversationStore } from '../../store/useConversationStore'

function formatToolInfo(toolName: string, toolInput: Record<string, unknown> | string) {
  if (typeof toolInput === 'string') return toolInput

  switch (toolName) {
    case 'Bash':
      return String(toolInput.command || JSON.stringify(toolInput, null, 2))
    case 'Write':
      return `Write to ${toolInput.file_path || 'file'}`
    case 'Edit':
      return `Edit ${toolInput.file_path || 'file'}`
    default:
      return JSON.stringify(toolInput, null, 2)
  }
}

export function PermissionBanner() {
  const permissionRequest = useConversationStore((s) => s.permissionRequest)
  const respondPermission = useConversationStore((s) => s.respondPermission)

  if (!permissionRequest) return null

  const isBash = permissionRequest.toolName === 'Bash'
  const displayInfo = formatToolInfo(permissionRequest.toolName, permissionRequest.toolInput)

  return (
    <div className="mx-3 mb-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 text-yellow-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-yellow-200">
            Claude wants to {isBash ? 'run' : 'use'}: <span className="text-white">{permissionRequest.toolName}</span>
          </p>
          {displayInfo && (
            <pre className={`mt-1.5 text-xs rounded px-2 py-1.5 overflow-x-auto max-h-40 whitespace-pre-wrap ${
              isBash
                ? 'text-green-300 bg-neutral-900/80 font-mono'
                : 'text-neutral-300 bg-neutral-900/60'
            }`}>
              {isBash ? '$ ' : ''}{displayInfo}
            </pre>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 ml-8">
        <button
          onClick={() => respondPermission(true)}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-green-600 hover:bg-green-500 text-white transition-colors cursor-pointer"
        >
          Approve
        </button>
        <button
          onClick={() => respondPermission(true, true)}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
        >
          Always Allow {permissionRequest.toolName}
        </button>
        <button
          onClick={() => respondPermission(false)}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors cursor-pointer"
        >
          Deny
        </button>
      </div>
    </div>
  )
}
