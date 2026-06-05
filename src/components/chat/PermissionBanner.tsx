/**
 * PermissionBanner — pilos-prototype-styled tool permission request.
 * Renders as `.msg-tile.warn` with the request info in `.ctext` and the
 * Allow / Always Allow / Deny actions as `.btn` in the footer.
 * Same store wiring (respondPermission) as before.
 */
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
  const queueLength = useConversationStore((s) => s.permissionQueue.length)
  const respondPermission = useConversationStore((s) => s.respondPermission)

  if (!permissionRequest) return null

  const isBash = permissionRequest.toolName === 'Bash'
  const displayInfo = formatToolInfo(permissionRequest.toolName, permissionRequest.toolInput)

  return (
    <div className="msg-tile warn">
      <div className="msg-tile-head">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--warn)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span>
          Pilos wants to {isBash ? 'run' : 'use'}: <span style={{ color: 'var(--accent-2)' }}>{permissionRequest.toolName}</span>
        </span>
        {queueLength > 0 && (
          <span className="tag warn" style={{ marginLeft: 6 }}>+{queueLength} queued</span>
        )}
      </div>
      <div className="msg-tile-body">
        {displayInfo && (
          <div className="code-block" style={{ marginTop: 0, marginBottom: 0 }}>
            <div className="tline" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {isBash ? <><span className="cs">$</span> </> : null}
              {displayInfo}
            </div>
          </div>
        )}
      </div>
      <div className="msg-tile-foot">
        <button
          type="button"
          onClick={() => respondPermission(true)}
          className="btn sm primary"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => respondPermission(true, true)}
          className="btn sm"
        >
          Always Allow {permissionRequest.toolName}
        </button>
        <button
          type="button"
          onClick={() => respondPermission(false)}
          className="btn sm ghost"
        >
          Deny
        </button>
      </div>
    </div>
  )
}
