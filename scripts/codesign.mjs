/**
 * Ad-hoc codesign Electron.app and all native .node modules.
 * macOS 26+ (Tahoe) rejects "linker-signed" binaries — they must
 * be explicitly ad-hoc signed with `codesign -fs -`.
 */
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdirSync, statSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

if (process.platform !== 'darwin') {
  console.log('Skipping codesign (not macOS)')
  process.exit(0)
}

function findFiles(dir, pattern, results = []) {
  try {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) findFiles(full, pattern, results)
        else if (pattern.test(entry)) results.push(full)
      } catch {}
    }
  } catch {}
  return results
}

// Sign all native .node modules
const nodeModules = resolve(root, 'node_modules')
const nativeFiles = findFiles(nodeModules, /\.node$/)
for (const f of nativeFiles) {
  try {
    execSync(`codesign -fs - "${f}"`, { stdio: 'pipe' })
    console.log(`Signed: ${f.replace(root + '/', '')}`)
  } catch {}
}

// Sign the Electron.app bundle
try {
  const electronPath = execSync('node -e "console.log(require(\'electron\'))"', { cwd: root, encoding: 'utf8' }).trim()
  const appBundle = resolve(dirname(electronPath), '..', '..')
  execSync(`codesign -fs - --deep --force "${appBundle}"`, { stdio: 'pipe' })
  console.log(`Signed: ${appBundle.replace(root + '/', '')}`)
} catch (e) {
  console.warn('Could not sign Electron.app:', e.message)
}
