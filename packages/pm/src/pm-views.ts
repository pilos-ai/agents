import type React from 'react'

export interface PmViewTab {
  key: string
  label: string
  icon: React.ReactNode
  requiresJira?: boolean
}

// These are created as data — the icons are inline SVG JSX.
// We use a function to avoid JSX at module level (needs React in scope).
export const PM_VIEW_TABS: PmViewTab[] = []

// Populated at init time by the barrel (after React is available)
export function getPmViewTabs(): PmViewTab[] {
  return [
    {
      key: 'stories',
      label: 'Stories',
      icon: null, // Will be provided inline by the consuming Sidebar
    },
    {
      key: 'board',
      label: 'Board',
      requiresJira: true,
      icon: null,
    },
    {
      key: 'dashboard',
      label: 'Sprint',
      requiresJira: true,
      icon: null,
    },
  ]
}
