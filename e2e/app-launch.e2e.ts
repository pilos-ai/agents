import { test, expect } from './fixtures'

test('app launches and shows the window', async ({ window }) => {
  // The window should be visible
  const title = await window.title()
  expect(title).toBeTruthy()
})

test('app window has correct minimum dimensions', async ({ window }) => {
  const size = await window.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  // Window is configured with min 1000x600
  expect(size.width).toBeGreaterThanOrEqual(1000)
  expect(size.height).toBeGreaterThanOrEqual(600)
})

test('app renders content', async ({ window }) => {
  // Wait for any content to appear
  await window.waitForSelector('body', { timeout: 10_000 })
  const bodyText = await window.textContent('body')
  expect(bodyText).toBeTruthy()
})
