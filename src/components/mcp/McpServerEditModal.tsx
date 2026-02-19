import { useState } from 'react'
import type { McpServer, McpServerConfig, McpServerType } from '../../types'

interface Props {
  server: McpServer | null // null = creating new
  onSave: (server: McpServer) => void
  onClose: () => void
}

function defaultConfig(type: McpServerType): McpServerConfig {
  if (type === 'stdio') return { type: 'stdio', command: '', args: [], env: {} }
  if (type === 'http') return { type: 'http', url: '' }
  return { type: 'sse', url: '' }
}

export function McpServerEditModal({ server, onSave, onClose }: Props) {
  const isNew = !server
  const [name, setName] = useState(server?.name || '')
  const [icon, setIcon] = useState(server?.icon || '🔌')
  const [description, setDescription] = useState(server?.description || '')
  const [serverType, setServerType] = useState<McpServerType>(server?.config.type || 'stdio')
  const [command, setCommand] = useState(
    server?.config.type === 'stdio' ? server.config.command : ''
  )
  const [args, setArgs] = useState(
    server?.config.type === 'stdio' ? server.config.args.join(', ') : ''
  )
  const [url, setUrl] = useState(
    server?.config.type === 'http' || server?.config.type === 'sse' ? server.config.url : ''
  )
  const [envPairs, setEnvPairs] = useState<Array<{ key: string; value: string }>>(
    server?.config.type === 'stdio' && server.config.env
      ? Object.entries(server.config.env).map(([key, value]) => ({ key, value }))
      : []
  )
  const [headerPairs, setHeaderPairs] = useState<Array<{ key: string; value: string }>>(
    (server?.config.type === 'http' || server?.config.type === 'sse') && server.config.headers
      ? Object.entries(server.config.headers).map(([key, value]) => ({ key, value }))
      : []
  )

  const handleSave = () => {
    if (!name.trim()) return

    let config: McpServerConfig
    if (serverType === 'stdio') {
      const envObj: Record<string, string> = {}
      for (const { key, value } of envPairs) {
        if (key.trim()) envObj[key.trim()] = value
      }
      config = {
        type: 'stdio',
        command: command.trim(),
        args: args.split(',').map((a) => a.trim()).filter(Boolean),
        env: envObj,
      }
    } else {
      const headersObj: Record<string, string> = {}
      for (const { key, value } of headerPairs) {
        if (key.trim()) headersObj[key.trim()] = value
      }
      config = {
        type: serverType,
        url: url.trim(),
        headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
      }
    }

    onSave({
      id: server?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: name.trim(),
      icon,
      description: description.trim(),
      enabled: server?.enabled ?? true,
      config,
    })
  }

  const addEnvPair = () => setEnvPairs((p) => [...p, { key: '', value: '' }])
  const removeEnvPair = (i: number) => setEnvPairs((p) => p.filter((_, idx) => idx !== i))
  const updateEnvPair = (i: number, field: 'key' | 'value', val: string) =>
    setEnvPairs((p) => p.map((pair, idx) => (idx === i ? { ...pair, [field]: val } : pair)))

  const addHeaderPair = () => setHeaderPairs((p) => [...p, { key: '', value: '' }])
  const removeHeaderPair = (i: number) => setHeaderPairs((p) => p.filter((_, idx) => idx !== i))
  const updateHeaderPair = (i: number, field: 'key' | 'value', val: string) =>
    setHeaderPairs((p) => p.map((pair, idx) => (idx === i ? { ...pair, [field]: val } : pair)))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-[440px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
          <h3 className="text-sm font-semibold">{isNew ? 'Add MCP Server' : 'Edit MCP Server'}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name + Icon */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-400 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Server"
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500"
              />
            </div>
            <div className="w-16">
              <label className="block text-xs font-medium text-neutral-400 mb-1">Icon</label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500 text-center"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this server do?"
              className="w-full bg-neutral-800 text-neutral-100 text-sm rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500"
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Type</label>
            <div className="flex gap-2">
              {(['stdio', 'http', 'sse'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setServerType(t)}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    serverType === t
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                      : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* stdio fields */}
          {serverType === 'stdio' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Command</label>
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  className="w-full bg-neutral-800 text-neutral-100 text-sm rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Args (comma-separated)</label>
                <input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="-y, @some/package"
                  className="w-full bg-neutral-800 text-neutral-100 text-sm rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Environment Variables
                </label>
                <div className="space-y-2">
                  {envPairs.map((pair, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={pair.key}
                        onChange={(e) => updateEnvPair(i, 'key', e.target.value)}
                        placeholder="KEY"
                        className="flex-1 bg-neutral-800 text-neutral-100 text-xs rounded-md px-2 py-1.5 outline-none border border-neutral-700 focus:border-blue-500 font-mono"
                      />
                      <input
                        value={pair.value}
                        onChange={(e) => updateEnvPair(i, 'value', e.target.value)}
                        placeholder="value"
                        className="flex-[2] bg-neutral-800 text-neutral-100 text-xs rounded-md px-2 py-1.5 outline-none border border-neutral-700 focus:border-blue-500 font-mono"
                      />
                      <button
                        onClick={() => removeEnvPair(i)}
                        className="text-neutral-500 hover:text-red-400 transition-colors shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addEnvPair}
                    className="text-xs text-neutral-400 hover:text-blue-400 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add variable
                  </button>
                </div>
              </div>
            </>
          )}

          {/* http/sse fields */}
          {(serverType === 'http' || serverType === 'sse') && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">URL</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/mcp"
                  className="w-full bg-neutral-800 text-neutral-100 text-sm rounded-md px-3 py-2 outline-none border border-neutral-700 focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Headers</label>
                <div className="space-y-2">
                  {headerPairs.map((pair, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={pair.key}
                        onChange={(e) => updateHeaderPair(i, 'key', e.target.value)}
                        placeholder="Header-Name"
                        className="flex-1 bg-neutral-800 text-neutral-100 text-xs rounded-md px-2 py-1.5 outline-none border border-neutral-700 focus:border-blue-500 font-mono"
                      />
                      <input
                        value={pair.value}
                        onChange={(e) => updateHeaderPair(i, 'value', e.target.value)}
                        placeholder="value"
                        className="flex-[2] bg-neutral-800 text-neutral-100 text-xs rounded-md px-2 py-1.5 outline-none border border-neutral-700 focus:border-blue-500 font-mono"
                      />
                      <button
                        onClick={() => removeHeaderPair(i)}
                        className="text-neutral-500 hover:text-red-400 transition-colors shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addHeaderPair}
                    className="text-xs text-neutral-400 hover:text-blue-400 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add header
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-neutral-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm rounded-md transition-colors"
          >
            {isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
