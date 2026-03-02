import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useProjectStore } from '../store/useProjectStore'
import { useConversationStore } from '../store/useConversationStore'
import { useTaskStore } from '../store/useTaskStore'
import { useAnalyticsStore } from '../store/useAnalyticsStore'

// Capture initial states once at import time
const initialStates = {
  app: useAppStore.getState(),
  project: useProjectStore.getState(),
  conversation: useConversationStore.getState(),
  task: useTaskStore.getState(),
  analytics: useAnalyticsStore.getState(),
}

/** Reset all Zustand stores to initial state */
export function resetStores() {
  useAppStore.setState(initialStates.app, true)
  useProjectStore.setState(initialStates.project, true)
  useConversationStore.setState(initialStates.conversation, true)
  useTaskStore.setState(initialStates.task, true)
  useAnalyticsStore.setState(initialStates.analytics, true)
}

interface CustomRenderOptions extends RenderOptions {
  storeState?: {
    app?: Partial<ReturnType<typeof useAppStore.getState>>
    project?: Partial<ReturnType<typeof useProjectStore.getState>>
    conversation?: Partial<ReturnType<typeof useConversationStore.getState>>
    task?: Partial<ReturnType<typeof useTaskStore.getState>>
    analytics?: Partial<ReturnType<typeof useAnalyticsStore.getState>>
  }
}

/** Render with Zustand store state pre-populated */
export function renderWithStore(ui: ReactElement, options: CustomRenderOptions = {}) {
  const { storeState, ...renderOptions } = options

  resetStores()

  if (storeState?.app) useAppStore.setState(storeState.app)
  if (storeState?.project) useProjectStore.setState(storeState.project)
  if (storeState?.conversation) useConversationStore.setState(storeState.conversation)
  if (storeState?.task) useTaskStore.setState(storeState.task)
  if (storeState?.analytics) useAnalyticsStore.setState(storeState.analytics)

  return render(ui, renderOptions)
}
