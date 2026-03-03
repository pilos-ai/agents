import { useState, useEffect, useRef } from 'react'
import { useConversationStore } from '../store/useConversationStore'
import { shouldSuggestWorkflow } from '../utils/conversation-to-workflow'

const DISMISSED_KEY = 'pilos:dismissed-workflow-suggestions'
const DEBOUNCE_MS = 3000

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function addDismissedId(id: string) {
  const ids = getDismissedIds()
  ids.add(id)
  // Keep only last 200 entries to avoid unbounded growth
  const arr = [...ids].slice(-200)
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr))
}

/**
 * Hook that monitors conversation state and suggests saving as workflow
 * when the conversation looks like a repeatable multi-step process.
 */
export function useWorkflowDetection() {
  const messages = useConversationStore((s) => s.messages)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)

  const [showSuggestion, setShowSuggestion] = useState(false)
  const prevStreamingRef = useRef(isStreaming)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Detect when streaming ends (transition from true → false)
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = isStreaming

    if (wasStreaming && !isStreaming && activeConversationId) {
      // Clear any pending debounce
      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(() => {
        // Check if already dismissed for this conversation
        if (getDismissedIds().has(activeConversationId)) return

        // Run heuristic
        if (shouldSuggestWorkflow(messages)) {
          setShowSuggestion(true)
        }
      }, DEBOUNCE_MS)
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [isStreaming, messages, activeConversationId])

  // Reset suggestion when conversation changes
  useEffect(() => {
    setShowSuggestion(false)
  }, [activeConversationId])

  const dismiss = () => {
    setShowSuggestion(false)
    if (activeConversationId) {
      addDismissedId(activeConversationId)
    }
  }

  return { showSuggestion, dismiss }
}
