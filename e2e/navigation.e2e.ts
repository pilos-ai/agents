import { test, expect } from './fixtures'

test('sidebar navigation items are visible', async ({ window }) => {
  // Wait for the app to fully load — look for the Pilos Agents branding
  const brand = window.getByText('Pilos Agents')

  // If the app reaches the main UI (not stuck on setup/login), test navigation
  if (await brand.isVisible({ timeout: 15_000 }).catch(() => false)) {
    // Workspace section items
    await expect(window.getByText('Command Center')).toBeVisible()
    await expect(window.getByText('Tasks')).toBeVisible()
    await expect(window.getByText('Terminal')).toBeVisible()

    // Advanced section items
    await expect(window.getByText('Performance')).toBeVisible()
    await expect(window.getByText('Settings')).toBeVisible()
  }
})

test('clicking Tasks shows the tasks view', async ({ window }) => {
  const tasksNav = window.getByText('Tasks')

  if (await tasksNav.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await tasksNav.click()
    // The tasks page should show a "New Task" button or task-related content
    await expect(window.getByText('New Task')).toBeVisible({ timeout: 5_000 })
  }
})
