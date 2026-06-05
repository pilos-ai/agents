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
            setActiveView('workflows')
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
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(5,5,7,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
      onClick={isGenerating ? undefined : onClose}
    >
      <div
        className="onb-card pop-in"
        style={{ width: 560, maxWidth: 'calc(100% - 32px)', padding: 0, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isGenerating && (
          <button
            type="button"
            className="onb-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon icon="lucide:x" style={{ fontSize: 15 }} />
          </button>
        )}

        {/* Header */}
        <div style={{ padding: '24px 24px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent-line)',
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
              color: 'var(--accent-2)',
            }}
          >
            <Icon icon="lucide:workflow" style={{ fontSize: 18 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 650, letterSpacing: '-0.015em', color: 'var(--ink)' }}>
              Save as Task
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
              Convert this conversation into a reusable workflow
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '0 24px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Conversation stats */}
          <div style={{ display: 'flex', gap: 10 }}>
            <StatTile icon="lucide:message-square" label="Messages" value={messages.length} />
            <StatTile icon="lucide:wrench" label="Tool calls" value={toolCalls.length} />
            <StatTile icon="lucide:layers" label="Unique tools" value={uniqueTools.length} />
          </div>

          {/* Detected tools preview */}
          {uniqueTools.length > 0 && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontFamily: 'var(--mono)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                Detected Tools
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {uniqueTools.map((tool) => (
                  <span key={tool} className="tag accent">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Optional description */}
          <div className="field" style={{ marginBottom: 0 }}>
            <label
              style={{
                display: 'block',
                fontSize: 10,
                fontFamily: 'var(--mono)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              Description (optional)
            </label>
            <textarea
              className="control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isGenerating}
              placeholder="Refine what this workflow should do, or leave empty to auto-detect from the conversation..."
              rows={3}
              style={{
                width: '100%',
                minHeight: 80,
                padding: '10px 12px',
                resize: 'vertical',
                lineHeight: 1.5,
                display: 'block',
                fontFamily: 'inherit',
                opacity: isGenerating ? 0.5 : 1,
              }}
            />
          </div>

          {/* Progress */}
          {isGenerating && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 'var(--r-sm)',
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-line)',
                color: 'var(--accent-2)',
              }}
            >
              <Icon icon="lucide:loader-2" className="animate-spin" style={{ fontSize: 14, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5 }}>{progress || 'Processing...'}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 'var(--r-sm)',
                background: 'rgba(251, 111, 111, 0.08)',
                border: '1px solid rgba(251, 111, 111, 0.3)',
                color: 'var(--err)',
              }}
            >
              <Icon icon="lucide:alert-circle" style={{ fontSize: 14, flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 12.5 }}>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '14px 24px',
            background: 'var(--panel)',
            borderTop: '1px solid var(--line)',
            borderBottomLeftRadius: 'var(--r-xl)',
            borderBottomRightRadius: 'var(--r-xl)',
          }}
        >
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {isGenerating ? 'Pilos is analyzing...' : 'Generates task + workflow from conversation'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isGenerating ? (
              <button
                type="button"
                className="btn"
                onClick={handleCancel}
                style={{
                  color: 'var(--err)',
                  borderColor: 'rgba(251, 111, 111, 0.35)',
                  background: 'rgba(251, 111, 111, 0.07)',
                }}
              >
                Cancel
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleConvert}
                  disabled={messages.length < 4}
                  style={messages.length < 4 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                >
                  <Icon icon="lucide:workflow" style={{ fontSize: 14 }} />
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

function StatTile({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div
      className="tile"
      style={{
        flex: 1,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--muted)',
        }}
      >
        <Icon icon={icon} style={{ fontSize: 13 }} />
        <span
          style={{
            fontSize: 10.5,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      <span style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  )
}
