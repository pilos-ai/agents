import { useState, useCallback, useEffect, useRef } from 'react'
import { Icon } from '../../common/Icon'
import { api } from '../../../api'
import { useTaskStore, computeNextRunAt, type ScheduleInterval, type TaskPriority } from '../../../store/useTaskStore'
import { normalizeNodeTypes } from '../../../store/useWorkflowStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { extractJson, hydrateToolNodes, validateAiPromptNodes, WORKFLOW_RUNTIME_GUIDE } from '../../../utils/workflow-ai'
import { WORKFLOW_TOOL_CATEGORIES } from '../../../data/workflow-tools'
import type { ClaudeEvent } from '../../../types'
import type { WorkflowNodeData } from '../../../types/workflow'
import type { Node, Edge } from '@xyflow/react'

interface Props {
  onClose: () => void
}

const SUGGESTIONS = [
  'Monitor Jira for stale issues older than 7 days and move them to Done',
  'Generate daily standup report from sprint board and post to Slack',
  'Review open PRs, summarize changes, and create Jira tickets for findings',
  'Track sprint progress every 4 hours and alert on blockers',
]

const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']
const VALID_INTERVALS: ScheduleInterval[] = ['manual', '15min', '30min', '1h', '2h', '4h', '8h', '12h', '1d', '1w']

function buildTaskGenerationPrompt(userDescription: string): string {
  const toolCatalog = WORKFLOW_TOOL_CATEGORIES.flatMap((c) => c.tools.map((t) => t.id)).join(', ')

  return `Generate a complete automated task for: "${userDescription}"

OUTPUT ONLY THE RAW JSON OBJECT. No markdown fences. No explanation. Start with { and end with }.

JSON schema:
{
  "title": "Short task name (2-5 words)",
  "description": "What this task does (1-2 sentences)",
  "priority": "low|medium|high|critical",
  "schedule": {
    "interval": "manual|15min|30min|1h|2h|4h|8h|12h|1d|1w"
  },
  "workflow": {
    "nodes": [{"id":"NODE_START_01","type":"start|end|mcp_tool|ai_prompt|condition|loop|delay|variable|note","position":{"x":300,"y":50},"data":{"type":"(same as node type)","label":"short name","toolId":"optional tool id","toolCategory":"optional","toolIcon":"optional: lucide:icon-name","aiPrompt":"for ai_prompt nodes","aiModel":"haiku|sonnet|opus","conditionExpression":"for condition","conditionOperator":"equals|contains|greater_than|less_than|regex","conditionValue":"for condition","loopType":"count|collection|while","loopCount":3,"loopCollection":"{{NODE_ID.arrayField}}","parameters":{"key":{"value":"..."}}}}],
    "edges": [{"id":"edge_01","source":"node id","target":"node id","sourceHandle":"null or yes/no for condition, body/done for loop","type":"dashed"}]
  }
}

Task rules:
- Pick a clear, short title
- Set priority based on urgency/impact of the described task
- Set schedule interval based on how often the task should run (use "manual" if user doesn't specify frequency)
- Description should explain what the task automates

Workflow rules:
- Always include start and end nodes
- Top-to-bottom layout: start y:50, increment y by ~150, center at x:300
- condition: sourceHandle "yes"/"no"
- loop: sourceHandle "body"/"done"
- Keep labels 2-4 words
- Keep workflows simple: 4-8 nodes maximum
- Use mcp_tool for standard operations (Jira, API calls, etc.)
- Use ai_prompt ONLY for reasoning/analysis/summarization — set aiPrompt with detailed instructions
- ai_prompt nodes MUST have a non-empty "aiPrompt" with specific references to upstream data using {{NODE_ID.field}}
- collection loops MUST set loopCollection to "{{NODE_ID.arrayField}}"
- All edges must have type: "dashed"

Available toolIds: ${toolCatalog}

${WORKFLOW_RUNTIME_GUIDE}`
}

export function GenerateTaskModal({ onClose }: Props) {
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const sessionIdRef = useRef<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  const addTask = useTaskStore((s) => s.addTask)
  const selectTask = useTaskStore((s) => s.selectTask)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) api.claude.abort(sessionIdRef.current)
      if (unsubRef.current) unsubRef.current()
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return

    setIsGenerating(true)
    setError(null)
    setProgress('Starting Pilos session...')

    const sessionId = `task-gen-${crypto.randomUUID()}`
    sessionIdRef.current = sessionId

    let resultText = ''

    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      if (event.sessionId !== sessionId) return

      if (event.type === 'assistant') {
        setProgress('Generating task...')
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

          // Validate and normalize fields
          const title = generated.title?.trim() || 'AI Generated Task'
          const description = generated.description?.trim() || ''
          const priority: TaskPriority = VALID_PRIORITIES.includes(generated.priority as TaskPriority)
            ? (generated.priority as TaskPriority)
            : 'medium'
          const interval: ScheduleInterval = VALID_INTERVALS.includes(generated.schedule?.interval as ScheduleInterval)
            ? (generated.schedule!.interval as ScheduleInterval)
            : 'manual'

          // Process workflow
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

          // Compute nextRunAt if scheduled
          const now = new Date().toISOString()
          const enabled = interval !== 'manual'
          const nextRunAt = enabled ? computeNextRunAt(now, interval) : null

          // Create the task
          addTask({
            title,
            description,
            template: 'custom',
            status: 'idle',
            priority,
            agentId: null,
            agentName: null,
            progress: 0,
            integrations: [],
            schedule: { interval, enabled, nextRunAt, lastRunAt: null },
            ...(workflow ? { workflow } : {}),
          }).then(() => {
            // Select the newly created task
            const tasks = useTaskStore.getState().tasks
            const newTask = tasks[tasks.length - 1]
            if (newTask) selectTask(newTask.id)
          })

          setProgress('')
          setIsGenerating(false)
          setPrompt('')
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
      await api.claude.startSession(sessionId, {
        prompt: buildTaskGenerationPrompt(prompt.trim()),
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
  }, [prompt, isGenerating, activeProjectPath, onClose, addTask, selectTask])

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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
              <Icon icon="lucide:sparkles" className="text-blue-400 text-sm" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Generate Task with AI</h2>
              <p className="text-[10px] text-zinc-500">Describe your task and Pilos will build it with a full workflow</p>
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
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">
              Describe your task
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder="e.g. Monitor Jira for stale issues older than 7 days, analyze priority, and move resolved ones to Done..."
              rows={4}
              className="w-full px-3 py-2.5 bg-pilos-bg border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-pilos-blue resize-none disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
              }}
            />
          </div>

          {/* Suggestions */}
          {!isGenerating && !prompt && (
            <div>
              <p className="text-[10px] text-zinc-600 mb-2">Try one of these:</p>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    className="w-full text-left px-3 py-2 rounded-lg border border-pilos-border hover:border-zinc-600 bg-pilos-bg text-[11px] text-zinc-400 hover:text-white transition-colors truncate"
                  >
                    <Icon icon="lucide:sparkles" className="text-blue-500/50 text-[10px] mr-1.5 inline" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {isGenerating && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <Icon icon="lucide:loader-2" className="text-blue-400 text-sm animate-spin flex-shrink-0" />
              <span className="text-xs text-blue-300">{progress || 'Processing...'}</span>
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
            {isGenerating ? 'Pilos is generating...' : 'Generates task + workflow'}
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
                  onClick={handleGenerate}
                  disabled={!prompt.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 transition-colors flex items-center gap-1.5"
                >
                  <Icon icon="lucide:sparkles" className="text-xs" />
                  Generate
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
