import { useState, useCallback, useEffect, useRef } from 'react'
import { Icon } from '../../common/Icon'
import { api } from '../../../api'
import { useWorkflowStore } from '../../../store/useWorkflowStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { extractJson, hydrateToolNodes, validateAiPromptNodes, WORKFLOW_RUNTIME_GUIDE } from '../../../utils/workflow-ai'
import { normalizeNodeTypes } from '../../../store/useWorkflowStore'
import type { ClaudeEvent } from '../../../types'
import type { WorkflowNodeData } from '../../../types/workflow'
import type { Node, Edge } from '@xyflow/react'

interface Props {
  open: boolean
  onClose: () => void
}

const SUGGESTIONS = [
  'Review all open Jira tickets, create a summary, and post to Slack',
  'Read GitHub PRs, run code review, and create Jira issues for findings',
  'Fetch data from API, transform JSON, filter results, and send email alert',
  'Monitor repo for new commits, run tests, and notify on failures',
]

// Build the prompt sent to Claude (combined user description + generation instructions)
function buildGenerationPrompt(userDescription: string): string {
  return `Generate a workflow for: "${userDescription}"

OUTPUT ONLY THE RAW JSON OBJECT. Do not include any text before or after the JSON. No markdown code fences. No explanation. Start your response with { and end with }.

JSON schema:
{"nodes":[{"id":"NODE_START_01","type":"start|end|mcp_tool|ai_prompt|agent|condition|loop|delay|parallel|merge|variable|note","position":{"x":300,"y":50},"data":{"type":"(same as node type)","label":"short name","description":"optional for mcp_tool","toolId":"optional: git_checkout|git_pull|git_push|git_merge|git_commit|git_diff|create_pr|read_files|write_file|edit_file|transform_json|filter_data|aggregate|jira_search|jira_get_issue|jira_create|jira_transition|jira_get_transitions|jira_delete|slack_message|slack_thread|run_command|run_script|web_search|api_request|webhook|email_alert","toolCategory":"optional","toolIcon":"optional: lucide:icon-name","aiPrompt":"for ai_prompt: the prompt text for Claude","aiModel":"for ai_prompt: haiku|sonnet|opus","agentPrompt":"for agent nodes - detailed instruction of what to accomplish","agentModel":"haiku|sonnet|opus","agentMaxTurns":25,"conditionExpression":"for condition","conditionOperator":"equals|contains|greater_than|less_than|regex","conditionValue":"for condition","loopType":"count|collection|while","loopCount":3,"loopCollection":"for collection loops: use {{NODE_ID.arrayField}} to reference upstream output","delayMs":5,"delayUnit":"s|ms|min|h","variableName":"for variable","variableValue":"for variable","variableOperation":"set|append|increment|transform","noteText":"for note"}}],"edges":[{"id":"edge_01","source":"node id","target":"node id","sourceHandle":"null or yes/no for condition, body/done for loop, branch_1/branch_2 for parallel","type":"dashed"}]}

COMPLETENESS — Break the description into individual steps. Create a SEPARATE node for each step:
- Every distinct operation = its own mcp_tool node (e.g. git_checkout, git_pull, git_commit, git_push, create_pr are ALL separate)
- Every analysis/reasoning step = its own ai_prompt node
- Every complex multi-step task (code editing, debugging) = its own agent node
- Repeated operations on a list = wrap in a loop node
- Dynamic values = use variable nodes
- Use up to 20 nodes — as many as the workflow requires. Never merge distinct steps.

ORDERING — Think about what logically must happen first:
- Setup/preparation steps first (creating branches, setting variables, fetching configs)
- Data gathering next (API calls, database queries, fetching issues)
- Processing/transformation in the middle (loops, analysis, code changes)
- Finalization after processing (commits, pushes, saves — OUTSIDE loops)
- Delivery/notification at the end (PRs, deploys, Slack messages, email alerts, reports)

Layout & structure:
- Always include start and end nodes
- Top-to-bottom: start y:50, increment y by ~150
- Parallel branches: spread x (100 vs 400); single column: center at x:300
- condition: sourceHandle "yes"/"no"; loop: sourceHandle "body"/"done"; parallel/merge for concurrency
- Keep labels 2-4 words; only include data fields relevant to each node type

Node type guide:
- mcp_tool: Single concrete operations — API calls, git commands, file ops, Jira/Slack actions
- ai_prompt: Pure reasoning/analysis/summarization (no tool access). Must have aiPrompt with {{NODE_ID.field}} refs
- agent: Complex multi-step tasks needing tool access. Must have agentPrompt with specific instructions
- Collection loops MUST set loopCollection to "{{NODE_ID.arrayField}}"

${WORKFLOW_RUNTIME_GUIDE}`
}

export function WorkflowGenerateModal({ open, onClose }: Props) {
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const sessionIdRef = useRef<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        api.claude.abort(sessionIdRef.current)
      }
      if (unsubRef.current) {
        unsubRef.current()
      }
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return

    setIsGenerating(true)
    setError(null)
    setProgress('Starting Pilos session...')

    const sessionId = `workflow-gen-${crypto.randomUUID()}`
    sessionIdRef.current = sessionId

    // Collect streamed text
    let resultText = ''

    // Listen for events from this session
    const unsub = api.claude.onEvent((event: ClaudeEvent) => {
      if (event.sessionId !== sessionId) return

      if (event.type === 'assistant') {
        setProgress('Generating workflow...')
        // Extract text content
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
        // Extract final text from result
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

        // Parse the workflow JSON
        try {
          const cleaned = extractJson(finalText)

          const workflow = JSON.parse(cleaned) as {
            nodes: Node<WorkflowNodeData>[]
            edges: Edge[]
          }

          if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
            throw new Error('Invalid workflow: missing nodes array')
          }

          // Normalize node types, hydrate tool definitions, validate ai_prompt nodes
          const typedNodes = normalizeNodeTypes(workflow.nodes as unknown as Array<Record<string, unknown>>)
          const hydratedNodes = hydrateToolNodes(typedNodes)
          const validatedNodes = validateAiPromptNodes(hydratedNodes, workflow.edges || [])

          // Load the generated workflow into the store
          const store = useWorkflowStore.getState()

          // Push current state to history first
          store.pushHistory()

          // Replace nodes and edges with generated workflow
          useWorkflowStore.setState({
            nodes: validatedNodes,
            edges: (workflow.edges || []).map((e) => ({
              ...e,
              type: e.type || 'dashed',
            })),
            selectedNodeId: null,
          })

          setProgress('')
          setIsGenerating(false)
          setPrompt('')
          onClose()
        } catch (parseError) {
          setError(`Failed to parse workflow: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`)
          setIsGenerating(false)
          setProgress('')
        }

        // Clean up
        unsub()
        unsubRef.current = null
        sessionIdRef.current = null
      }
    })

    unsubRef.current = unsub

    try {
      await api.claude.startSession(sessionId, {
        prompt: buildGenerationPrompt(prompt.trim()),
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
  }, [prompt, isGenerating, activeProjectPath, onClose])

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

  if (!open) return null

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
              <h2 className="text-sm font-bold text-white">Generate Workflow</h2>
              <p className="text-[10px] text-zinc-500">Describe your workflow and Pilos will build it</p>
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
          {/* Prompt input */}
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">
              Describe your workflow
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder="e.g. Fetch all open Jira tickets, analyze each one, create a summary report, and send it to Slack..."
              rows={4}
              className="w-full px-3 py-2.5 bg-pilos-bg border border-pilos-border rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-pilos-blue resize-none disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleGenerate()
                }
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
            {isGenerating ? 'Pilos is generating...' : '⌘+Enter to generate'}
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
