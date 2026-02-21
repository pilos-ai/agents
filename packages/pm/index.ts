// Renderer barrel — re-exports everything the main app needs

// Store injection
export { initPmStores } from './src/stores/pm-context'

// Stores
export { useJiraStore } from './src/stores/useJiraStore'
export { useStoryStore } from './src/stores/useStoryStore'

// Types
export type { PmApi, PmDependencies } from './src/types'
export type {
  JiraTokens, JiraProject, JiraBoard, JiraSprint, JiraIssue, JiraUser, JiraTransition,
  Story, StoryCriterion, CoverageResult,
  StoryStatus, StoryPriority, JiraSyncStatus,
} from './src/types'

// Components (will be added in Phase 3)
export { StoriesPanel } from './src/components/StoriesPanel'
export { JiraBoardPanel } from './src/components/JiraBoardPanel'
export { JiraDashboardPanel } from './src/components/JiraDashboardPanel'
export { StorySidebarContent } from './src/sidebar/StorySidebarContent'
export { JiraIntegrationCard } from './src/sidebar/JiraIntegrationCard'
export { detectStoryBlocks, parseStoryBlock } from './src/components/StoryCreationParser'

// Views
export { PM_VIEW_TABS, getPmViewTabs } from './src/pm-views'
export type { PmViewTab } from './src/pm-views'

// Utils
export { parseCoverageBlocks } from './src/utils/coverage-parser'
export { buildCoveragePrompt } from './src/utils/coverage-prompt-builder'
