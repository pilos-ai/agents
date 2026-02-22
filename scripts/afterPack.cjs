/**
 * electron-builder afterPack hook.
 * Ad-hoc codesigns the packaged .app bundle and all binaries inside it,
 * so macOS 26+ (Tahoe) doesn't reject them at dlopen.
 *
 * Signs inside-out: individual binaries → frameworks → helper apps → main app.
 */
const { execSync } = require('child_process')
const { readdirSync, statSync } = require('fs')
const { join } = require('path')

function findFiles(dir, pattern, results = []) {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) findFiles(full, pattern, results)
        else if (pattern.test(entry)) results.push(full)
      } catch {}
    }
  } catch {}
  return results
}

function findDirs(dir, pattern, results = []) {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) {
          if (pattern.test(entry)) results.push(full)
          findDirs(full, pattern, results)
        }
      } catch {}
    }
  } catch {}
  return results
}

function sign(filePath, label) {
  try {
    execSync(`codesign -fs - --force "${filePath}"`, { stdio: 'pipe' })
    console.log(`  Signed: ${label}`)
    return true
  } catch (e) {
    console.warn(`  Failed: ${label}: ${e.stderr?.toString().trim() || e.message}`)
    return false
  }
}

module.exports = async function afterPack(context) {
  if (process.platform !== 'darwin') return

  // Skip ad-hoc signing when a real Developer ID certificate is available —
  // electron-builder handles proper signing + notarization in that case.
  if (process.env.CSC_LINK || process.env.CSC_NAME) {
    console.log('[afterPack] Skipping ad-hoc signing (real certificate detected)')
    return
  }

  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )
  console.log(`[afterPack] Ad-hoc signing: ${appPath}`)

  // 1. Sign all native .node files
  const nativeFiles = findFiles(appPath, /\.node$/)
  console.log(`[afterPack] Signing ${nativeFiles.length} native .node files`)
  for (const f of nativeFiles) {
    sign(f, f.replace(appPath + '/', ''))
  }

  // 2. Sign all .dylib files
  const dylibFiles = findFiles(appPath, /\.dylib$/)
  for (const f of dylibFiles) {
    sign(f, f.replace(appPath + '/', ''))
  }

  // 3. Sign all standalone executables in Helpers directories
  //    (chrome_crashpad_handler, etc. — must be signed before their parent bundles)
  const helperBinaries = findFiles(appPath, /^(chrome_crashpad_handler|chrome_helper)$/i)
  for (const f of helperBinaries) {
    sign(f, f.replace(appPath + '/', ''))
  }

  // 4. Sign all helper .app bundles (inside out — deepest first)
  const helperApps = findDirs(appPath, /\.app$/).filter((d) => d !== appPath)
  // Sort by depth (deepest first)
  helperApps.sort((a, b) => b.split('/').length - a.split('/').length)
  for (const helper of helperApps) {
    sign(helper, helper.replace(appPath + '/', ''))
  }

  // 5. Sign all .framework bundles (inside out)
  const frameworks = findDirs(appPath, /\.framework$/)
  // Sort by depth (deepest first), deduplicate symlinked versions
  const seen = new Set()
  frameworks.sort((a, b) => b.split('/').length - a.split('/').length)
  for (const fw of frameworks) {
    const real = execSync(`realpath "${fw}"`, { encoding: 'utf8' }).trim()
    if (seen.has(real)) continue
    seen.add(real)
    sign(fw, fw.replace(appPath + '/', ''))
  }

  // 6. Sign the top-level .app bundle
  sign(appPath, context.packager.appInfo.productFilename + '.app')

  console.log(`[afterPack] Signing complete`)
}
