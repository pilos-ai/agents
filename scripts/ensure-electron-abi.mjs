/**
 * predev guard — ensure better-sqlite3 (and friends) are built for Electron's
 * ABI before `npm run dev`.
 *
 * `npm test` (electron/test/sqlite-setup.ts) runs `npm rebuild better-sqlite3`
 * to get a Node-ABI build for vitest, and restores the Electron build on
 * teardown. When a test run is interrupted — or the restored backup was itself
 * a Node build — `better_sqlite3.node` is left on Node's ABI, and the Electron
 * main process then crashes on DB open:
 *   "NODE_MODULE_VERSION 127 ... requires 143" (ERR_DLOPEN_FAILED)
 * which looks like the app silently failing to start.
 *
 * Detection: a classic native addon loads only under a runtime whose ABI it was
 * compiled for. We `process.dlopen` the EXACT .node file under THIS Node (in a
 * child process, on the real file — no `bindings` caller-relative resolution to
 * fool us). If it loads, the binary is on Node's ABI and Electron can't use it,
 * so we rebuild. If dlopen fails, it's built for a different (Electron) ABI — we
 * skip, so a normal dev start stays instant.
 */
import { spawnSync } from 'node:child_process'
import { rmSync, existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const isWin = process.platform === 'win32'
const sqliteNode = path.join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')

/** True when the compiled binary loads under Node (→ Node ABI → wrong for Electron). */
function builtForNode() {
  if (!existsSync(sqliteNode)) return true // missing → needs a (re)build
  const r = spawnSync(
    process.execPath,
    ['-e', `try{process.dlopen({exports:{}}, ${JSON.stringify(sqliteNode)});process.exit(0)}catch{process.exit(3)}`],
    { stdio: 'ignore' },
  )
  return r.status === 0
}

if (!builtForNode()) {
  console.log('[predev] better-sqlite3 is built for Electron — OK')
  process.exit(0)
}

console.log('[predev] better-sqlite3 is on Node ABI (left over from `npm test`) — rebuilding for Electron…')

// @electron/rebuild records a ".forge-meta" (arch--abi) cache marker and SKIPS
// the rebuild when it matches the target — but `npm rebuild` swaps the binary
// underneath without updating it, so install-app-deps no-ops and leaves the
// Node-ABI binary. Remove the marker to force a genuine rebuild.
rmSync(path.join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', '.forge-meta'), { force: true })

const eb = path.join(root, 'node_modules', '.bin', isWin ? 'electron-builder.cmd' : 'electron-builder')
const rebuilt = spawnSync(eb, ['install-app-deps'], { stdio: 'inherit', shell: isWin })
if (rebuilt.status !== 0) {
  console.error('[predev] `electron-builder install-app-deps` failed')
  process.exit(1)
}

// macOS: rebuilt .node files must be re-signed or Electron SIGKILLs on dlopen (macOS 26+).
if (process.platform === 'darwin') {
  spawnSync(process.execPath, [path.join(root, 'scripts', 'codesign.mjs')], { stdio: 'inherit' })
}

if (builtForNode()) {
  console.error(
    '[predev] ERROR: better-sqlite3 is still on Node ABI after rebuild. Run manually:\n' +
    '  rm -rf node_modules/better-sqlite3/build && npx electron-builder install-app-deps && node scripts/codesign.mjs',
  )
  process.exit(1)
}

console.log('[predev] native modules ready for Electron — launching dev')
