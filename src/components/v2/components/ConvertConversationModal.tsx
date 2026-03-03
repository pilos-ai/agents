import { useState, useCallback, useEffect, useRef } from 'react'
import { Icon } from '../../common/Icon'
import { api } from '../../../api'
import { useTaskStore, computeNextRunAt, type ScheduleInterval, type TaskPriority } from '../../../store/useTaskStore'
import { normalizeNodeTypes } from '../../../store/useWorkflowStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { useAppStore } from '../../../store/useAppStore'
import { extractJson, hydrateToolNodes, validateAiPromptNodes } from '../../../utils/workflow-ai'
import { serializeConversation, buildConversationToWorkflowPrompt } from '../../../utils/conversation-to-workflow'
import type { ConversationMessage, ClaudeEvent } from '../../../types'
import type { WorkflowNodeData } from '../../../types/workflow'
import type { Node, Edge } from '@xyflow/react'

interface Props {
  messages: ConversationMessage[]
  conversationId?: string | null
  onClose: () => void
}

const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']
const VALID_INTERVALS: ScheduleInterval[] = ['manual', '15min', '30min', '1h', '2h', '4h', '8h', '12h', '1d', '1w']

export function ConvertConversationModal({ messages, conversationId, onClose }: Props) {
  const [description, setDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const sessionIdRef = useRef<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  const addTask = useTaskStore((s) => s.addTask)
  const selectTask = useTaskStore((s) => s.selectTask)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const setActiveView = useAppStore((s) => s.setActiveView)

  // Compute stats for preview
  const toolCalls = messages.filter((m) => m.type === 'tool_use')
  const uniqueTools = [...new Set(toolCalls.map((m) => {
    const block = m.contentBlocks?.[0]
    return block?.type === 'tool_use' ? block.name : m.toolName || 'unknown'
  }))]

  useEffect(() => {
    return () => {
      if (sessionIdRef.current) api.claude.abort(sessionIdRef.current)
      if (unsubRef.current) unsubRef.current()
    }
  }, [])

  const handleConvert = useCallback(async () => {
    if (isGenerating) return

    setIsGenerating(true)
    setError(null)
    setProgress('Analyzing conversation...')

    const sessionId = `conv-to-wf-${crypto.randomUUID()}`
    sessionIdRef.current = sessionId

    let resultText = ''

    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      if (event.sessionId !== sessionId) return

      if (event.type === 'assistant') {
        setProgress('Generating workflow...')
        const msg = event.message as { content?: Array<{ type: string; text?: string }> }
        if (msg?.content) {
          const text = msg.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('')
          if (text) resultText = text
        }
      }

      if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string }
        if (delta?.type === 'text_delta' && delta.text) {
          resultText += delta.text
        }
      }

      if (event.type === 'result') {
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

        try {
          const cleaned = extractJson(finalText)
          const generated = JSON.parse(cleaned) as {
            title?: string
            description?: string
            priority?: string
            schedule?: { interval?: string }
            workflow?: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] }
          }

          const title = generated.title?.trim() || 'Conversation Workflow'
          const desc = generated.description?.trim() || ''
          const priority: TaskPriority = VALID_PRIORITIES.includes(generated.priority as TaskPriority)
            ? (generated.priority as TaskPriority)
            : 'medium'
          const interval: ScheduleInterval = VALID_INTERVALS.includes(generated.schedule?.interval as ScheduleInterval)
            ? (generated.schedule!.interval as ScheduleInterval)
            : 'manual'

          let workflow = undefined
          if (generated.workflow?.nodes && Array.isArray(generated.workflow.nodes)) {
            const typedNodes = normalizeNodeTypes(generated.workflow.nodes as unknown as Array<Record<string, unknown>>)
            const hydratedNodes = hydrateToolNodes(typedNodes)
            const validatedNodes = validateAiPromptNodes(hydratedNodes, generated.workflow.edges || [])
            workflow = {
              nodes: validatedNodes,
              edges: (generated.workflow.edges || []).map((e) => ({
                ...e,
                type: e.type || 'dashed',
              })),
            }
          }

          const now = new Date().toISOString()
          const enabled = interval !== 'manual'
          const nextRunAt = enabled ? computeNextRunAt(now, interval) : null

          addTask({
            title,
            description: desc,
            template: 'custom',
            status: 'idle',
            priority,
            agentId: null,
            agentName: null,
            progress: 0,
            integrations: [],
            schedule: { interval, enabled, nextRunAt, lastRunAt: null },
            sourceConversationId: conversationId || undefined,
            ...(workflow ? { workflow } : {}),
          }).then(() => {
            const tasks = useTaskStore.getState().tasks
            const newTask = tasks[tasks.length - 1]
            if (newTask) selectTask(newTask.id)
            setActiveView('tasks')
          })

          setProgress('')
          setIsGenerating(false)
          onClose()
        } catch (parseError) {
          setError(`Failed to parse response: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`)
          setIsGenerating(false)
          setProgress('')
        }

        unsub()
        unsubRef.current = null
        sessionIdRef.current = null
      }
    })

    unsubRef.current = unsub

    try {
      const serialized = serializeConversation(messages)
      const prompt = buildConversationToWorkflowPrompt(serialized, description.trim() || undefined)

      await api.claude.startSession(sessionId, {
        prompt,
        resume: false,
        workingDirectory: activeProjectPath || undefined,
        model: 'sonnet',
        permissionMode: 'plan',
      })
    } catch (err) {
      setError(`Failed to start session: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setIsGenerating(false)
      setProgress('')
      unsub()
      unsubRef.current = null
      sessionIdRef.current = null
    }
  }, [isGenerating, messages, description, conversationId, activeProjectPath, onClose, addTask, selectTask, setActiveView])

  const handleCancel = useCallback(() => {
    if (sessionIdRef.current) {
      api.claude.abort(sessionIdRef.current)
      sessionIdRef.current = null
    }
    if (unsubRef.current) {
      unsubRef.current()
      unsubRef.current = null
    }
    setIsGenerating(false)
    setProgress('')
    setError(null)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={isGenerating ? undefined : onClose} />

      <div className="relative w-full max-w-lg mx-4 bg-pilos-card border border-pilos-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pilos-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center">
              <Icon icon="lucide:workflow" className="text-emerald-400 text-sm" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Save as Task</h2>
              <p className="text-[10px] text-zinc-500">Convert this conversation into a reusable workflow</p>
            </div>
          </div>
          {!isGenerating && (
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
              <Icon icon="lucide:x" className="text-sm" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Conversation stats */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-pilos-bg border border-pilos-border">
            <div className="flex items-center gap-1.5">
              <Icon icon="lucide:message-square" className="text-zinc-500 text-[10px]" />
              <span className="text-[10px] text-zinc-400">{messages.length} messages</span>
            </div>
            <div className="w-px h-3 bg-pilos-border" />
            <div className="flex items-center gap-1.5">
              <Icon icon="lucide:wrench" className="text-zinc-500 text-[10px]" />
              <span className="text-[10px] text-zinc-400">{toolCalls.length} tool calls</span>
            </div>
            <div className="w-px h-3 bg-pilos-border" />
            <div className="flex items-center gap-1.5">
              <Icon icon="lucide:layers" className="text-zinc-500 text-[10px]" />
              <span className="text-[10px] text-zinc-400">{uniqueTools.length} unique tools</span>
            </div>
          </div>

          {/* Detected tools preview */}
          {uniqueTools.length > 0 && (
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">
                Detected Tools
              </label>
              <div className="flex flex-wrap gap-1.5">
                {uniqueTools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-0.5 rounded-md bg-pilos-bg border border-pilos-border text-[10px] text-zinc-400"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Optional description */}
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isGenerating}
              placeholder="Refine what this workflow should do, or leave empty to auto-detect from the conversation..."
              rows={3}
              className="w-full px-3 py-2.5 bg-pilos-bg border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-pilos-blue resize-none disabled:opacity-50"
            />
          </div>

          {/* Progress */}
          {isGenerating && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <Icon icon="lucide:loader-2" className="text-emerald-400 text-sm animate-spin flex-shrink-0" />
              <span className="text-xs text-emerald-300">{progress || 'Processing...'}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
              <Icon icon="lucide:alert-circle" className="text-red-400 text-sm flex-shrink-0 mt-0.5" />
              <span className="text-xs text-red-300">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-pilos-border bg-pilos-bg/50">
          <span className="text-[10px] text-zinc-600">
            {isGenerating ? 'Pilos is analyzing...' : 'Generates task + workflow from conversation'}
          </span>
          <div className="flex items-center gap-2">
            {isGenerating ? (
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
              >
                Cancel
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConvert}
                  disabled={messages.length < 4}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
                >
                  <Icon icon="lucide:workflow" className="text-xs" />
                  Convert
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
