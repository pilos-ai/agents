import { useAppStore } from '../../store/useAppStore'
import { api } from '../../api'

export function SettingsDialog() {
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const model = useAppStore((s) => s.model)
  const setModel = useAppStore((s) => s.setModel)
  const workingDirectory = useAppStore((s) => s.workingDirectory)
  const setWorkingDirectory = useAppStore((s) => s.setWorkingDirectory)
  const terminalFontSize = useAppStore((s) => s.terminalFontSize)
  const setTerminalFontSize = useAppStore((s) => s.setTerminalFontSize)
  const permissionMode = useAppStore((s) => s.permissionMode)
  const setPermissionMode = useAppStore((s) => s.setPermissionMode)

  const handleSelectDirectory = async () => {
    const dir = await api.dialog.openDirectory()
    if (dir) setWorkingDirectory(dir)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5">
          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">Default Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-neutral-800 text-neutral-100 text-sm rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500"
            >
              <option value="sonnet">Claude Sonnet</option>
              <option value="opus">Claude Opus</option>
              <option value="haiku">Claude Haiku</option>
            </select>
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">Working Directory</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                placeholder="Default: current directory"
                className="flex-1 bg-neutral-800 text-neutral-100 text-sm rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500"
              />
              <button
                onClick={handleSelectDirectory}
                className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-sm rounded-md transition-colors"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Permission Mode */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">Permission Mode</label>
            <div className="space-y-2">
              {[
                {
                  value: 'bypass',
                  label: 'Full access',
                  desc: 'Claude can do everything without asking',
                  color: 'text-green-400',
                },
                {
                  value: 'supervised',
                  label: 'Ask before changes',
                  desc: 'Approve/deny each write or command (like the terminal)',
                  color: 'text-yellow-400',
                },
                {
                  value: 'plan',
                  label: 'Read only',
                  desc: 'Claude can only read files — no edits, no commands',
                  color: 'text-red-400',
                },
              ].map((mode) => (
                <label
                  key={mode.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    permissionMode === mode.value
                      ? 'border-blue-500/50 bg-blue-500/10'
                      : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="permissionMode"
                    value={mode.value}
                    checked={permissionMode === mode.value}
                    onChange={(e) => setPermissionMode(e.target.value)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div>
                    <span className={`text-sm font-medium ${mode.color}`}>{mode.label}</span>
                    <p className="text-xs text-neutral-500 mt-0.5">{mode.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-xs text-neutral-500 mt-2 italic">
              Changes apply to new sessions. Restart the chat after changing.
            </p>
          </div>

          {/* Terminal Font Size */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">
              Terminal Font Size: {terminalFontSize}px
            </label>
            <input
              type="range"
              min={10}
              max={20}
              value={terminalFontSize}
              onChange={(e) => setTerminalFontSize(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-800 flex justify-end">
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
