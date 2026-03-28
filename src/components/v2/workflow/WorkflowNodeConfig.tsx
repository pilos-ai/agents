import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { Icon } from '../../common/Icon'
import { FormInput } from '../components/FormInput'
import { FormTextarea } from '../components/FormTextarea'
import { FormSelect } from '../components/FormSelect'
import { FormToggle } from '../components/FormToggle'
import { DataPicker } from './DataPicker'
import { PromptEditor } from './PromptEditor'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { resolveTemplates } from '../../../utils/workflow-executor'
import { api } from '../../../api'
import type { ExecutionContext } from '../../../utils/workflow-executor'
import type { ClaudeEvent } from '../../../types'
import type { WorkflowParameter, WorkflowStepResult, WorkflowExecution, WorkflowNodeData } from '../../../types/workflow'
import { WORKFLOW_TOOL_CATEGORIES } from '../../../data/workflow-tools'

/** Heuristic: does this param key look like a file/folder path? */
const PATH_KEYS = ['path', 'file', 'filepath', 'file_path', 'directory', 'folder', 'dir']
function isFilePathParam(param: WorkflowParameter): boolean {
  return param.type === 'string' && PATH_KEYS.some((k) => param.key.toLowerCase().includes(k))
}

function isParamEmpty(value: unknown): boolean {
  return value === '' || value === undefined || value === null
}

function RequiredLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

function RequiredHint({ show }: { show: boolean }) {
  if (!show) return null
  return <p className="text-[10px] text-red-400/60 mt-0.5">Required</p>
}

function FilePathInput({ param, onChange }: { param: WorkflowParameter; onChange: (value: unknown) => void }) {
  const showHint = param.required && isParamEmpty(param.value)
  const handleBrowse = async () => {
    const dirOnly = param.key.toLowerCase().includes('dir') || param.key.toLowerCase().includes('folder')
    const selected = await api.dialog.openPath({ directory: dirOnly })
    if (selected) onChange(selected)
  }
  return (
    <div>
      <RequiredLabel label={param.label} required={param.required} />
      <div className="flex gap-1.5">
        <input
          type="text"
          value={String(param.value || '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${param.label.toLowerCase()}...`}
          className={`form-input flex-1 min-w-0 ${showHint ? 'border-red-500/30' : ''}`}
        />
        <button
          type="button"
          onClick={handleBrowse}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-pilos-card border border-pilos-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors flex-shrink-0"
          title="Browse for file or folder"
        >
          <Icon icon="lucide:folder-open" className="text-xs" />
        </button>
      </div>
      <RequiredHint show={!!showHint} />
      <TemplatePreview value={String(param.value || '')} />
    </div>
  )
}

function DataPickerButton({ nodeId, onSelect, filterArrays }: { nodeId: string; onSelect: (ref: string) => void; filterArrays?: boolean }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setAnchorEl(anchorEl ? null : btnRef.current)}
        className={`flex items-center justify-center w-7 h-7 rounded-md border transition-colors flex-shrink-0 ${
          anchorEl ? 'bg-blue-600/20 border-blue-500/30 text-blue-400' : 'bg-pilos-card border-pilos-border text-zinc-500 hover:text-white hover:border-zinc-600'
        }`}
        title="Pick data from upstream steps"
      >
        <Icon icon="lucide:braces" className="text-[10px]" />
      </button>
      {anchorEl && (
        <DataPicker
          currentNodeId={nodeId}
          onSelect={(ref) => { onSelect(ref); setAnchorEl(null) }}
          filterArrays={filterArrays}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
        />
      )}
    </>
  )
}

function AiJqlButton({ onChange }: { onChange: (value: unknown) => void }) {
  const jiraProjectKey = useWorkflowStore((s) => s.jiraProjectKey)
  const [isOpen, setIsOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generatingRef = useRef(false)

  const handleGenerate = useCallback(async () => {
    const text = description.trim()
    if (!text || generatingRef.current) return

    setIsGenerating(true)
    generatingRef.current = true
    setError(null)

    const sessionId = `jql-gen-${Date.now()}`
    let resultText = ''

    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      if (event.sessionId !== sessionId) return

      if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string }
        if (delta?.type === 'text_delta' && delta.text) {
          resultText += delta.text
        }
      }

      if (event.type === 'assistant') {
        // Extract text from assistant message content blocks
        const msg = event.message as { content?: Array<{ type: string; text?: string }> }
        if (msg?.content) {
          const text = msg.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('')
          if (text) resultText = text
        }
      }

      if (event.type === 'result') {
        unsub()
        const rawResult = event.result
        let finalText = resultText
        if (typeof rawResult === 'string') {
          finalText = rawResult
        } else if (rawResult && typeof rawResult === 'object') {
          const resultObj = rawResult as { content?: Array<{ type: string; text?: string }> }
          if (resultObj.content) {
            const extracted = resultObj.content
              .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
              .map((b) => b.text)
              .join('')
            if (extracted) finalText = extracted
          }
        }

        // Clean: strip quotes, backticks, whitespace, newlines
        const jql = finalText.replace(/^[\s`"'\n]+|[\s`"'\n]+$/g, '').trim()
        if (jql) {
          onChange(jql)
          setDescription('')
          setIsOpen(false)
        } else {
          setError('No JQL generated')
        }
        setIsGenerating(false)
        generatingRef.current = false
      }
    })

    const prompt = `Generate a JQL query for Jira. Output ONLY the raw JQL string, nothing else. No explanation, no backticks, no quotes around it.
${jiraProjectKey ? `Project key: ${jiraProjectKey}` : ''}
User request: "${text}"`

    try {
      await api.claude.startSession(sessionId, {
        prompt,
        resume: false,
        model: 'haiku',
        permissionMode: 'plan',
      })
    } catch (err) {
      unsub()
      setError(err instanceof Error ? err.message : 'Failed')
      setIsGenerating(false)
      generatingRef.current = false
    }

    // 30s timeout
    setTimeout(() => {
      if (generatingRef.current) {
        unsub()
        api.claude.abort(sessionId).catch(() => {})
        setError('Timed out')
        setIsGenerating(false)
        generatingRef.current = false
      }
    }, 30_000)
  }, [description, jiraProjectKey, onChange])

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center w-7 h-7 rounded-md border bg-pilos-card border-pilos-border text-purple-400 hover:text-purple-300 hover:border-purple-500/30 transition-colors flex-shrink-0"
        title="Generate JQL with AI"
      >
        <Icon icon="lucide:sparkles" className="text-[10px]" />
      </button>
    )
  }

  return (
    <div className="mt-1.5 p-2.5 bg-purple-500/5 border border-purple-500/20 rounded-lg">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon icon="lucide:sparkles" className="text-[10px] text-purple-400" />
        <span className="text-[10px] font-bold text-purple-300">AI JQL Generator</span>
        <button onClick={() => { setIsOpen(false); setError(null) }} className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors">
          <Icon icon="lucide:x" className="text-[10px]" />
        </button>
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGenerate() } }}
          placeholder="e.g. open bugs assigned to me"
          disabled={isGenerating}
          className="flex-1 min-w-0 bg-pilos-card border border-pilos-border rounded-md px-2 py-1 text-[10px] text-white placeholder-zinc-600 outline-none focus:border-purple-500/50 disabled:opacity-50"
          autoFocus
        />
        <button
          onClick={handleGenerate}
          disabled={!description.trim() || isGenerating}
          className="flex items-center justify-center px-2 py-1 rounded-md text-[10px] font-medium bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 transition-colors disabled:opacity-30"
        >
          {isGenerating ? <Icon icon="lucide:loader-2" className="text-[10px] animate-spin" /> : 'Generate'}
        </button>
      </div>
      {error && <p className="text-[9px] text-red-400 mt-1">{error}</p>}
    </div>
  )
}

function ParameterField({ param, onChange, nodeId }: { param: WorkflowParameter; onChange: (value: unknown) => void; nodeId: string }) {
  const showHint = param.required && isParamEmpty(param.value)
  switch (param.type) {
    case 'string':
      if (isFilePathParam(param)) {
        return <FilePathInput param={param} onChange={onChange} />
      }
      return (
        <div>
          <RequiredLabel label={param.label} required={param.required} />
          {param.key === 'jql' && (
            <div className="flex justify-end mb-1">
              <AiJqlButton onChange={onChange} />
            </div>
          )}
          <PromptEditor
            key={`${nodeId}-${param.key}`}
            compact
            defaultValue={String(param.value || '')}
            onChange={(v) => onChange(v)}
            placeholder={`Enter ${param.label.toLowerCase()}...`}
            nodeId={nodeId}
          />
          <RequiredHint show={!!showHint} />
          <TemplatePreview value={String(param.value || '')} />
        </div>
      )
    case 'number':
      return (
        <div>
          <RequiredLabel label={param.label} required={param.required} />
          <input
            type="number"
            value={String(param.value || 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="form-input w-full"
          />
        </div>
      )
    case 'boolean':
      return (
        <FormToggle
          label={param.label}
          checked={Boolean(param.value)}
          onChange={() => onChange(!param.value)}
        />
      )
    case 'json':
      return (
        <div>
          <RequiredLabel label={param.label} required={param.required} />
          <PromptEditor
            key={`${nodeId}-${param.key}`}
            defaultValue={String(param.value || '{}')}
            onChange={(v) => onChange(v)}
            placeholder="{}"
            nodeId={nodeId}
          />
          <TemplatePreview value={String(param.value || '')} />
          {param.format && (
            <div className="flex gap-1 mt-1">
              {['json', 'csv', 'yaml'].map((fmt) => (
                <button
                  key={fmt}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                    param.format === fmt
                      ? 'bg-blue-600 text-white'
                      : 'bg-pilos-card border border-pilos-border text-zinc-500 hover:text-white'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          )}
        </div>
      )
    case 'select':
      return (
        <FormSelect
          label={param.required ? `${param.label} *` : param.label}
          value={String(param.value || '')}
          onChange={(e) => onChange(e.target.value)}
          options={param.options || []}
        />
      )
    default:
      return null
  }
}

/** Build a flat list of referenceable output paths from execution results */
function getOutputPaths(output: unknown, prefix: string, maxDepth = 2): { path: string; preview: string; isArray: boolean }[] {
  const paths: { path: string; preview: string; isArray: boolean }[] = []
  if (maxDepth <= 0 || output === undefined || output === null) return paths

  if (typeof output === 'object' && !Array.isArray(output)) {
    for (const [key, val] of Object.entries(output as Record<string, unknown>)) {
      const fullPath = prefix ? `${prefix}.${key}` : key
      const isArr = Array.isArray(val)
      let preview = ''
      if (isArr) {
        preview = `array[${val.length}]`
      } else if (typeof val === 'string') {
        preview = val.length > 30 ? val.slice(0, 30) + '...' : val
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        preview = String(val)
      } else if (val && typeof val === 'object') {
        preview = '{...}'
      }
      paths.push({ path: fullPath, preview, isArray: isArr })
      // Recurse into objects (not arrays) for nested fields
      if (val && typeof val === 'object' && !isArr) {
        paths.push(...getOutputPaths(val, fullPath, maxDepth - 1))
      }
    }
  }
  return paths
}

function NodeRefPicker({ value, onChange, nodeId, format, filterArrays }: {
  value: string
  onChange: (val: string) => void
  nodeId: string
  format: 'bare' | 'template'
  filterArrays?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="form-input flex-1 min-w-0 text-[10px] font-mono"
          placeholder={format === 'template' ? '{{nodeId.field}}' : 'nodeId.field'}
        />
        <DataPickerButton
          nodeId={nodeId}
          filterArrays={filterArrays}
          onSelect={(ref) => {
            if (format === 'bare') {
              // Strip {{ and }} for bare format
              onChange(ref.replace(/^\{\{|\}\}$/g, ''))
            } else {
              onChange(ref)
            }
          }}
        />
      </div>
    </div>
  )
}

function formatResultOutput(output: unknown): string {
  if (output === undefined || output === null) return ''
  if (typeof output === 'string') return output
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

function StepResultPreview({ result }: { result: WorkflowStepResult }) {
  const [expanded, setExpanded] = useState(false)
  const isCompleted = result.status === 'completed'
  const isFailed = result.status === 'failed'
  const output = isFailed ? result.error : formatResultOutput(result.output)
  const duration = result.duration < 1000 ? `${result.duration}ms` : `${(result.duration / 1000).toFixed(1)}s`
  const truncated = output && output.length > 200 && !expanded

  return (
    <div className={`p-3 rounded-lg border ${
      isCompleted ? 'bg-emerald-500/5 border-emerald-500/20'
      : isFailed ? 'bg-red-500/5 border-red-500/20'
      : 'bg-zinc-800/50 border-pilos-border'
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon
            icon={isCompleted ? 'lucide:check-circle-2' : isFailed ? 'lucide:x-circle' : 'lucide:skip-forward'}
            className={`text-xs ${isCompleted ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-zinc-500'}`}
          />
          <span className={`text-[10px] font-bold uppercase ${isCompleted ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-zinc-500'}`}>
            {result.status}
          </span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">{duration}</span>
      </div>
      {output && (
        <div className="relative">
          <pre className={`text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-all ${
            isFailed ? 'text-red-400/70' : 'text-zinc-400'
          } ${truncated ? 'max-h-[120px] overflow-hidden' : ''}`}>
            {truncated ? output.slice(0, 200) + '...' : output}
          </pre>
          {output.length > 200 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-blue-400 hover:text-blue-300 mt-1"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Build an ExecutionContext from step results for template preview */
function buildPreviewContext(execution: WorkflowExecution | null): ExecutionContext | null {
  if (!execution || execution.stepResults.length === 0) return null
  const ctx: ExecutionContext = {
    variables: {},
    nodeOutputs: {},
    aborted: false,
    visitCounts: {},
    createdIssueSummaries: new Set(),
  }
  for (const r of execution.stepResults) {
    if (r.status === 'completed' && r.output) {
      ctx.nodeOutputs[r.nodeId] = r.output
    }
  }
  return ctx
}

function TemplatePreview({ value }: { value: string }) {
  const execution = useWorkflowStore((s) => s.execution)
  const ctx = useMemo(() => buildPreviewContext(execution), [execution])

  if (!ctx || typeof value !== 'string' || !value.includes('{{')) return null

  const resolved = resolveTemplates(value, ctx)
  const isUnresolved = resolved.includes('{{') || resolved === value

  return (
    <div className={`mt-1 text-[10px] font-mono truncate ${isUnresolved ? 'text-orange-400/60' : 'text-emerald-400/60'}`}>
      {isUnresolved ? '⚠ unresolved' : `→ ${resolved.slice(0, 80)}${resolved.length > 80 ? '...' : ''}`}
    </div>
  )
}

export function WorkflowNodeConfig() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const nodes = useWorkflowStore((s) => s.nodes)
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const execution = useWorkflowStore((s) => s.execution)
  const isFixing = useWorkflowStore((s) => s.isFixing)
  const aiFixWorkflow = useWorkflowStore((s) => s.aiFixWorkflow)
  const retryNode = useWorkflowStore((s) => s.retryNode)

  const node = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId])

  const stepResult = useMemo(() => {
    if (!selectedNodeId || !execution?.stepResults) return null
    // Get the last result for this node (loops may have multiple)
    const results = execution.stepResults.filter((r) => r.nodeId === selectedNodeId)
    return results.length > 0 ? results[results.length - 1] : null
  }, [selectedNodeId, execution?.stepResults])

  // Auto-populate or repair parameters from tool definition when:
  // 1. Node has a toolId but no parameters at all
  // 2. Parameters exist but are missing key/label/type (AI-generated with only { value: "..." })
  useEffect(() => {
    if (!node) return
    const d = node.data
    if (d.type === 'mcp_tool' && d.toolId) {
      let toolDef: { parameters: WorkflowParameter[] } | null = null
      for (const cat of WORKFLOW_TOOL_CATEGORIES) {
        const found = cat.tools.find((t) => t.id === d.toolId)
        if (found) { toolDef = found; break }
      }
      if (!toolDef || toolDef.parameters.length === 0) return

      const existingParams = d.parameters ? Object.values(d.parameters).filter(Boolean) : []
      const needsRepair = existingParams.length === 0 || existingParams.some((p) => !p.type || !p.key)

      if (needsRepair) {
        const params: Record<string, WorkflowParameter> = {}
        for (const p of toolDef.parameters) {
          const existing = d.parameters?.[p.key]
          if (existing && typeof existing === 'object') {
            params[p.key] = { ...p, value: existing.value ?? p.value }
          } else {
            params[p.key] = { ...p }
          }
        }
        updateNodeData(node.id, { parameters: params })
      }
    }
  }, [node?.id, node?.data.toolId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null

  const data = node.data
  const isStart = data.type === 'start'
  const isEnd = data.type === 'end'
  const params = data.parameters ? Object.values(data.parameters).filter((p): p is WorkflowParameter => p != null) : []
  const errorHandling = data.errorHandling || { autoRetry: false, maxRetries: 3, failureAction: 'stop' as const }

  const otherNodes = nodes.filter((n) => n.id !== node.id && n.data.type !== 'start').map((n) => ({
    value: n.id,
    label: n.data.label,
  }))

  return (
    <div className="w-80 border-l border-pilos-border flex flex-col bg-pilos-bg flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pilos-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Step Config</p>
            <h3 className="text-sm font-bold text-white mt-0.5">{data.label}</h3>
          </div>
          <button onClick={() => selectNode(null)} className="text-zinc-500 hover:text-white transition-colors">
            <Icon icon="lucide:x" className="text-sm" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Step Details */}
        <div>
          <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Step Details</label>
          <div className="space-y-3">
            <FormInput
              label="Friendly Name"
              value={data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
            <FormTextarea
              label="Description"
              value={data.description || ''}
              onChange={(e) => updateNodeData(node.id, { description: e.target.value })}
              rows={2}
              placeholder="Describe what this step does..."
            />
          </div>
        </div>

        {/* Condition config */}
        {data.type === 'condition' && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Condition</label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Expression</label>
                <NodeRefPicker
                  value={data.conditionExpression || ''}
                  onChange={(val) => updateNodeData(node.id, { conditionExpression: val })}
                  nodeId={node.id}
                  format="bare"
                />
              </div>
              <FormSelect
                label="Operator"
                value={data.conditionOperator || 'equals'}
                onChange={(e) => updateNodeData(node.id, { conditionOperator: e.target.value as 'equals' | 'contains' | 'greater_than' | 'less_than' | 'regex' })}
                options={[
                  { value: 'equals', label: 'Equals' },
                  { value: 'contains', label: 'Contains' },
                  { value: 'greater_than', label: 'Greater Than' },
                  { value: 'less_than', label: 'Less Than' },
                  { value: 'regex', label: 'Regex Match' },
                ]}
              />
              <FormInput
                label="Value"
                value={data.conditionValue || ''}
                onChange={(e) => updateNodeData(node.id, { conditionValue: e.target.value })}
                placeholder="Expected value"
              />
            </div>
          </div>
        )}

        {/* Loop config */}
        {data.type === 'loop' && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Loop Config</label>
            <div className="space-y-3">
              <FormSelect
                label="Loop Type"
                value={data.loopType || 'count'}
                onChange={(e) => updateNodeData(node.id, { loopType: e.target.value as 'count' | 'collection' | 'while' })}
                options={[
                  { value: 'count', label: 'Fixed Count' },
                  { value: 'collection', label: 'For Each (Collection)' },
                  { value: 'while', label: 'While Condition' },
                ]}
              />
              {(data.loopType || 'count') === 'count' && (
                <FormInput
                  label="Iterations"
                  type="number"
                  value={String(data.loopCount ?? 3)}
                  onChange={(e) => updateNodeData(node.id, { loopCount: Number(e.target.value) })}
                />
              )}
              {data.loopType === 'collection' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Collection</label>
                  <NodeRefPicker
                    value={data.loopCollection || ''}
                    onChange={(val) => updateNodeData(node.id, { loopCollection: val })}
                    nodeId={node.id}
                    format="template"
                    filterArrays
                  />
                  <p className="text-[9px] text-zinc-700 mt-1">Leave empty to auto-detect from upstream</p>
                </div>
              )}
              {data.loopType === 'while' && (
                <FormInput
                  label="Condition"
                  value={data.loopCondition || ''}
                  onChange={(e) => updateNodeData(node.id, { loopCondition: e.target.value })}
                  placeholder="e.g. {{counter}} < 10"
                />
              )}
            </div>
          </div>
        )}

        {/* Variable config */}
        {data.type === 'variable' && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Variable</label>
            <div className="space-y-3">
              <FormSelect
                label="Operation"
                value={data.variableOperation || 'set'}
                onChange={(e) => updateNodeData(node.id, { variableOperation: e.target.value as 'set' | 'append' | 'increment' | 'transform' })}
                options={[
                  { value: 'set', label: 'Set' },
                  { value: 'append', label: 'Append' },
                  { value: 'increment', label: 'Increment' },
                  { value: 'transform', label: 'Transform' },
                ]}
              />
              <FormInput
                label="Variable Name"
                value={data.variableName || ''}
                onChange={(e) => updateNodeData(node.id, { variableName: e.target.value })}
                placeholder="e.g. jqlQuery"
              />
              <PromptEditor
                key={`${node.id}-val`}
                label="Value"
                compact
                defaultValue={data.variableValue || ''}
                onChange={(v) => updateNodeData(node.id, { variableValue: v })}
                placeholder="e.g. {{upstream.result}} or plain text"
                nodeId={node.id}
              />
              {/* JSON hint: shown when value looks like JSON */}
              {(() => {
                const raw = (data.variableValue || '').trim()
                const looksLikeJson = raw.startsWith('{') || raw.startsWith('[')
                if (!looksLikeJson) return null
                try {
                  const parsed = JSON.parse(raw)
                  const name = data.variableName || 'VAR'
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const allKeys = Object.keys(parsed)
                    const keys = allKeys.slice(0, 6)
                    return (
                      <div className="rounded-md bg-emerald-950/40 border border-emerald-800/30 px-2.5 py-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <p className="text-[10px] text-emerald-400 font-medium">Valid JSON</p>
                          <span className="text-[9px] text-emerald-700 font-mono">{`{{${name}.field}}`}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {keys.map((k) => (
                            <span key={k} className="inline-block px-1.5 py-0.5 rounded bg-emerald-900/50 text-[9px] text-emerald-300 font-mono border border-emerald-800/40">{k}</span>
                          ))}
                          {allKeys.length > 6 && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-900/30 text-[9px] text-emerald-700 font-mono">+{allKeys.length - 6}</span>
                          )}
                        </div>
                      </div>
                    )
                  }
                  if (Array.isArray(parsed)) {
                    return (
                      <div className="rounded-md bg-emerald-950/40 border border-emerald-800/30 px-2.5 py-2">
                        <p className="text-[10px] text-emerald-400 font-medium">Valid JSON array ({parsed.length} items)</p>
                        <code className="block text-[10px] text-emerald-300 font-mono">{`{{${data.variableName || 'VAR'}}}`}</code>
                      </div>
                    )
                  }
                } catch {
                  return (
                    <div className="rounded-md bg-red-950/40 border border-red-800/30 px-2.5 py-2">
                      <p className="text-[10px] text-red-400 font-medium">Invalid JSON — keys must be quoted</p>
                      <code className="block text-[10px] text-red-300 font-mono mt-0.5">{`{"key": "value"}`}</code>
                    </div>
                  )
                }
                return null
              })()}
            </div>
          </div>
        )}

        {/* Delay config */}
        {data.type === 'delay' && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Delay</label>
            <div className="space-y-3">
              <FormInput
                label="Duration"
                type="number"
                value={String(data.delayMs ?? 5)}
                onChange={(e) => updateNodeData(node.id, { delayMs: Number(e.target.value) })}
              />
              <FormSelect
                label="Unit"
                value={data.delayUnit || 's'}
                onChange={(e) => updateNodeData(node.id, { delayUnit: e.target.value as 'ms' | 's' | 'min' | 'h' })}
                options={[
                  { value: 'ms', label: 'Milliseconds' },
                  { value: 's', label: 'Seconds' },
                  { value: 'min', label: 'Minutes' },
                  { value: 'h', label: 'Hours' },
                ]}
              />
            </div>
          </div>
        )}

        {/* AI Prompt config */}
        {data.type === 'ai_prompt' && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">AI Prompt</label>
            <div className="space-y-3">
              <FormSelect
                label="Model"
                value={data.aiModel || 'sonnet'}
                onChange={(e) => updateNodeData(node.id, { aiModel: e.target.value as 'haiku' | 'sonnet' | 'opus' })}
                options={[
                  { value: 'haiku', label: 'Haiku (Fast)' },
                  { value: 'sonnet', label: 'Sonnet (Balanced)' },
                  { value: 'opus', label: 'Opus (Powerful)' },
                ]}
              />
              <PromptEditor
                key={node.id}
                label="Prompt"
                defaultValue={data.aiPrompt || ''}
                onChange={(v) => updateNodeData(node.id, { aiPrompt: v })}
                placeholder={'Describe what AI should do...\n\nType {{ to reference upstream data'}
                nodeId={node.id}
              />
              <TemplatePreview value={data.aiPrompt || ''} />
              <p className="text-[9px] text-zinc-700">
                Claude will have access to MCP tools and upstream outputs.
              </p>
            </div>
          </div>
        )}

        {/* Agent config */}
        {data.type === 'agent' && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Agent Session</label>
            <div className="space-y-3">
              <FormSelect
                label="Model"
                value={data.agentModel || 'sonnet'}
                onChange={(e) => updateNodeData(node.id, { agentModel: e.target.value as 'haiku' | 'sonnet' | 'opus' })}
                options={[
                  { value: 'haiku', label: 'Haiku (Fast)' },
                  { value: 'sonnet', label: 'Sonnet (Balanced)' },
                  { value: 'opus', label: 'Opus (Powerful)' },
                ]}
              />
              <PromptEditor
                key={node.id}
                label="Agent Prompt"
                defaultValue={data.agentPrompt || ''}
                onChange={(v) => updateNodeData(node.id, { agentPrompt: v })}
                placeholder={'Describe what the agent should accomplish...\n\nThe agent gets a full Claude Code session with file editing, bash, git, and all MCP tools.\n\nType {{ to insert a variable'}
                nodeId={node.id}
              />
              <FormInput
                label="Max Turns"
                value={String(data.agentMaxTurns ?? 25)}
                onChange={(e) => updateNodeData(node.id, { agentMaxTurns: parseInt(e.target.value) || 25 })}
                placeholder="25"
              />
              <FormInput
                label="Timeout (seconds)"
                value={String(data.agentTimeoutSeconds ?? 600)}
                onChange={(e) => updateNodeData(node.id, { agentTimeoutSeconds: parseInt(e.target.value) || 600 })}
                placeholder="600"
              />
              <TemplatePreview value={data.agentPrompt || ''} />
              <p className="text-[9px] text-zinc-700">
                Full Claude Code session with tool access (file editing, bash, git, MCP tools). Use for complex multi-step tasks.
              </p>
            </div>
          </div>
        )}

        {data.type === 'results_display' && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Results Display</label>
            <div className="space-y-3">
              <FormInput
                label="Display Title"
                value={(data.displayTitle as string) || ''}
                onChange={(e) => updateNodeData(node.id, { displayTitle: e.target.value })}
                placeholder="e.g. Search Results"
              />
              <div>
                <PromptEditor
                  key={`${node.id}-src`}
                  label="Data Source"
                  compact
                  defaultValue={(data.displaySource as string) || ''}
                  onChange={(v) => updateNodeData(node.id, { displaySource: v })}
                  placeholder="Auto (upstream output) or {{NODE_ID.field}}"
                  nodeId={node.id}
                />
                <p className="text-[9px] text-zinc-700 mt-1">Leave empty to auto-collect from connected nodes.</p>
              </div>
              <FormSelect
                label="Display Format"
                value={(data.displayFormat as string) || 'auto'}
                onChange={(e) => updateNodeData(node.id, { displayFormat: e.target.value as 'auto' | 'table' | 'list' | 'json' })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'table', label: 'Table' },
                  { value: 'list', label: 'List' },
                  { value: 'json', label: 'JSON' },
                ]}
              />
              {data.displaySource && <TemplatePreview value={(data.displaySource as string) || ''} />}
            </div>
          </div>
        )}

        {/* MCP Tool info */}
        {data.type === 'mcp_tool' && data.toolId && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Tool</label>
            <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg space-y-1.5">
              <div className="flex items-center gap-2">
                <Icon icon={data.toolIcon || 'lucide:zap'} className="text-blue-400 text-sm" />
                <span className="text-xs font-medium text-white">{data.toolId}</span>
              </div>
              {data.toolCategory && (
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{data.toolCategory}</span>
              )}
            </div>
          </div>
        )}

        {/* Input Parameters */}
        {params.length > 0 && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Input Parameters</label>
            <div className="space-y-3">
              {params.map((param) => (
                <ParameterField
                  key={param.key}
                  param={param}
                  nodeId={node.id}
                  onChange={(value) => {
                    const updated = { ...data.parameters }
                    if (updated[param.key]) {
                      updated[param.key] = { ...updated[param.key], value }
                    }
                    updateNodeData(node.id, { parameters: updated })
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Last Execution Result */}
        {stepResult && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Last Result</label>
            <StepResultPreview result={stepResult} />
            {stepResult.status === 'failed' && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => retryNode(node.id)}
                  className="flex-1 flex items-center gap-1.5 justify-center px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-bold rounded-lg hover:bg-blue-600/30 transition-colors"
                >
                  <Icon icon="lucide:refresh-cw" className="text-[10px]" />
                  Retry
                </button>
                <button
                  onClick={() => aiFixWorkflow(node.id)}
                  disabled={isFixing}
                  className="flex-1 flex items-center gap-1.5 justify-center px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs font-bold rounded-lg hover:bg-violet-600/30 transition-colors disabled:opacity-50"
                >
                  <Icon icon={isFixing ? 'lucide:loader-2' : 'lucide:sparkles'} className={`text-[10px] ${isFixing ? 'animate-spin' : ''}`} />
                  {isFixing ? 'Fixing...' : 'AI Fix'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error Handling */}
        {!isStart && !isEnd && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Error Handling</label>
            <div className="p-3 bg-pilos-card border border-pilos-border rounded-lg space-y-3">
              <FormToggle
                label="Auto-Retry"
                checked={errorHandling.autoRetry}
                onChange={() =>
                  updateNodeData(node.id, {
                    errorHandling: { ...errorHandling, autoRetry: !errorHandling.autoRetry },
                  })
                }
              />
              {errorHandling.autoRetry && (
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">Max Retries</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={errorHandling.maxRetries}
                      onChange={(e) =>
                        updateNodeData(node.id, {
                          errorHandling: { ...errorHandling, maxRetries: Number(e.target.value) },
                        })
                      }
                      className="flex-1 accent-blue-500"
                    />
                    <span className="text-xs text-zinc-400 w-4 text-right">{errorHandling.maxRetries}</span>
                  </div>
                </div>
              )}
              <FormSelect
                label="On Failure Jump To"
                value={errorHandling.failureJumpNodeId || ''}
                onChange={(e) =>
                  updateNodeData(node.id, {
                    errorHandling: { ...errorHandling, failureAction: e.target.value ? 'jump' : 'stop', failureJumpNodeId: e.target.value || undefined },
                  })
                }
                options={[{ value: '', label: 'Stop Workflow' }, ...otherNodes]}
              />
            </div>
          </div>
        )}

        {/* Delete */}
        {!isStart && (
          <div className="pt-2 border-t border-pilos-border">
            <button
              onClick={() => { removeNode(node.id); selectNode(null) }}
              className="flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors"
            >
              <Icon icon="lucide:trash-2" className="text-xs" />
              Delete step
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
