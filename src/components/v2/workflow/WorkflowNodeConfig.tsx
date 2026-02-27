import { useMemo } from 'react'
import { Icon } from '../../common/Icon'
import { FormInput } from '../components/FormInput'
import { FormTextarea } from '../components/FormTextarea'
import { FormSelect } from '../components/FormSelect'
import { FormToggle } from '../components/FormToggle'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import type { WorkflowParameter } from '../../../types/workflow'

function ParameterField({ param, onChange }: { param: WorkflowParameter; onChange: (value: unknown) => void }) {
  switch (param.type) {
    case 'string':
      return (
        <FormInput
          label={param.label}
          value={String(param.value || '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${param.label.toLowerCase()}...`}
        />
      )
    case 'number':
      return (
        <FormInput
          label={param.label}
          type="number"
          value={String(param.value || 0)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
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
          <FormTextarea
            label={param.label}
            codeEditor
            value={String(param.value || '{}')}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
          />
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
          label={param.label}
          value={String(param.value || '')}
          onChange={(e) => onChange(e.target.value)}
          options={param.options || []}
        />
      )
    default:
      return null
  }
}

export function WorkflowNodeConfig() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const nodes = useWorkflowStore((s) => s.nodes)
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const selectNode = useWorkflowStore((s) => s.selectNode)

  const node = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId])

  if (!node) return null

  const data = node.data
  const isStart = data.type === 'start'
  const isEnd = data.type === 'end'
  const params = data.parameters ? Object.values(data.parameters) : []
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
              <FormInput
                label="Expression"
                value={data.conditionExpression || ''}
                onChange={(e) => updateNodeData(node.id, { conditionExpression: e.target.value })}
                placeholder="e.g. result.status"
              />
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

        {/* Input Parameters */}
        {params.length > 0 && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Input Parameters</label>
            <div className="space-y-3">
              {params.map((param) => (
                <ParameterField
                  key={param.key}
                  param={param}
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
