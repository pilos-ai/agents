import { create } from 'zustand'
import { getApi } from './pm-context'
import type { Story, StoryCriterion } from '../types'

interface StoryStore {
  stories: Story[]
  activeStoryId: string | null
  activeStory: Story | null
  criteria: StoryCriterion[]
  loading: boolean
  filterStatus: string | null
  filterSearch: string

  // Actions
  loadStories: (projectPath: string) => Promise<void>
  setActiveStory: (id: string | null) => Promise<void>
  createStory: (story: Partial<Story>) => Promise<Story>
  updateStory: (id: string, updates: Partial<Story>) => Promise<void>
  deleteStory: (id: string) => Promise<void>
  addCriterion: (storyId: string, description: string) => Promise<void>
  updateCriterion: (id: string, updates: Partial<StoryCriterion>) => Promise<void>
  deleteCriterion: (id: string) => Promise<void>
  reorderCriteria: (storyId: string, criterionIds: string[]) => Promise<void>
  pushToJira: (storyId: string, projectKey: string) => Promise<void>
  syncFromJira: (storyId: string) => Promise<void>
  analyzeCoverage: (storyId: string) => Promise<void>
  setFilterStatus: (status: string | null) => void
  setFilterSearch: (search: string) => void
}

export const useStoryStore = create<StoryStore>((set, get) => ({
  stories: [],
  activeStoryId: null,
  activeStory: null,
  criteria: [],
  loading: false,
  filterStatus: null,
  filterSearch: '',

  loadStories: async (projectPath) => {
    set({ loading: true })
    try {
      const stories = await getApi().stories.list(projectPath)
      set({ stories, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setActiveStory: async (id) => {
    if (!id) {
      set({ activeStoryId: null, activeStory: null, criteria: [] })
      return
    }
    set({ activeStoryId: id })
    const api = getApi()
    const story = await api.stories.get(id)
    const criteria = story ? await api.stories.getCriteria(id) : []
    set({ activeStory: story, criteria })
  },

  createStory: async (story) => {
    const created = await getApi().stories.create(story)
    const stories = get().stories
    set({ stories: [created, ...stories] })
    return created
  },

  updateStory: async (id, updates) => {
    const updated = await getApi().stories.update(id, updates)
    set({
      stories: get().stories.map((s) => (s.id === id ? updated : s)),
      activeStory: get().activeStoryId === id ? updated : get().activeStory,
    })
  },

  deleteStory: async (id) => {
    await getApi().stories.delete(id)
    set({
      stories: get().stories.filter((s) => s.id !== id),
      activeStoryId: get().activeStoryId === id ? null : get().activeStoryId,
      activeStory: get().activeStoryId === id ? null : get().activeStory,
      criteria: get().activeStoryId === id ? [] : get().criteria,
    })
  },

  addCriterion: async (storyId, description) => {
    const criterion = await getApi().stories.addCriterion(storyId, description)
    set({ criteria: [...get().criteria, criterion] })
  },

  updateCriterion: async (id, updates) => {
    const updated = await getApi().stories.updateCriterion(id, updates)
    set({ criteria: get().criteria.map((c) => (c.id === id ? updated : c)) })
  },

  deleteCriterion: async (id) => {
    await getApi().stories.deleteCriterion(id)
    set({ criteria: get().criteria.filter((c) => c.id !== id) })
  },

  reorderCriteria: async (storyId, criterionIds) => {
    await getApi().stories.reorderCriteria(storyId, criterionIds)
    // Re-sort local criteria
    const criteria = get().criteria
    const sorted = criterionIds.map((id, i) => {
      const c = criteria.find((c) => c.id === id)
      return c ? { ...c, orderIndex: i } : null
    }).filter(Boolean) as StoryCriterion[]
    set({ criteria: sorted })
  },

  pushToJira: async (storyId, projectKey) => {
    await getApi().stories.pushToJira(storyId, projectKey)
    // Reload story and criteria
    await get().setActiveStory(storyId)
    // Reload stories list
    const story = get().activeStory
    if (story) {
      set({ stories: get().stories.map((s) => (s.id === storyId ? story : s)) })
    }
  },

  syncFromJira: async (storyId) => {
    await getApi().stories.syncFromJira(storyId)
    await get().setActiveStory(storyId)
    const story = get().activeStory
    if (story) {
      set({ stories: get().stories.map((s) => (s.id === storyId ? story : s)) })
    }
  },

  analyzeCoverage: async (storyId) => {
    await getApi().stories.analyzeCoverage(storyId)
  },

  setFilterStatus: (status) => set({ filterStatus: status }),
  setFilterSearch: (search) => set({ filterSearch: search }),
}))
