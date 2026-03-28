/**
 * Vitest globalSetup for electron tests.
 *
 * better-sqlite3 is compiled for Electron by `electron-builder install-app-deps`.
 * For unit tests we need the regular Node.js build. We save the Electron binary,
 * rebuild for Node, run tests, then restore the Electron binary.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const nativePath = path.join(root, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node')
const electronBackup = nativePath + '.electron'

export async function setup() {
  if (!fs.existsSync(nativePath)) return

  // Back up Electron binary
  fs.copyFileSync(nativePath, electronBackup)

  // Rebuild for the current Node.js
  try {
    execSync('npm rebuild better-sqlite3', { cwd: root, stdio: 'pipe' })
    console.log('[test setup] Rebuilt better-sqlite3 for Node.js')
  } catch (err) {
    console.warn('[test setup] better-sqlite3 rebuild failed — database tests may fail:', err)
  }
}

export async function teardown() {
  // Restore Electron binary so the app still works after tests
  if (fs.existsSync(electronBackup)) {
    fs.copyFileSync(electronBackup, nativePath)
    fs.unlinkSync(electronBackup)
    console.log('[test teardown] Restored better-sqlite3 Electron binary')
  }
}
