import fs from 'fs'
import path from 'path'
import {
  RECOMMENDED_PLUGINS,
  type PluginRecommendation,
  type PluginDetectRule,
} from '../../src/data/recommended-plugins'

export interface DetectedPlugin {
  plugin: PluginRecommendation
  /** Whether the detector matched; baseline plugins are always matched. */
  matched: boolean
  /** Reason the plugin is recommended (from rule or baseline). */
  reason: string
}

/**
 * Walks the project root (shallow + selected subdirs) and returns the set of
 * recommended plugins that apply.
 *
 * Intentionally cheap: only opens small manifest files and does a bounded
 * directory scan. Safe to call on every project open.
 */
export async function detectPlugins(projectPath: string): Promise<DetectedPlugin[]> {
  if (!projectPath || !fs.existsSync(projectPath)) return []

  const ctx = await buildContext(projectPath)
  const out: DetectedPlugin[] = []

  for (const plugin of RECOMMENDED_PLUGINS) {
    if (plugin.baseline) {
      out.push({ plugin, matched: true, reason: plugin.rationale })
      continue
    }
    if (plugin.detect && ruleMatches(plugin.detect, ctx)) {
      out.push({ plugin, matched: true, reason: plugin.rationale })
    }
  }

  return out
}

interface DetectContext {
  projectPath: string
  topLevel: Set<string>
  extensions: Set<string>
  manifestCache: Map<string, unknown>
}

async function buildContext(projectPath: string): Promise<DetectContext> {
  const topLevel = new Set<string>()
  try {
    const entries = await fs.promises.readdir(projectPath, { withFileTypes: true })
    for (const e of entries) {
      topLevel.add(e.isDirectory() ? `${e.name}/` : e.name)
    }
  } catch {
    /* ignore */
  }

  const extensions = new Set<string>()
  await collectExtensions(projectPath, extensions, 0)

  return {
    projectPath,
    topLevel,
    extensions,
    manifestCache: new Map(),
  }
}

/**
 * Bounded recursive extension scan. Skips node_modules, .git, dist, build.
 * Caps at depth 3 and ~2000 files so it stays snappy on large repos.
 */
async function collectExtensions(
  dir: string,
  out: Set<string>,
  depth: number,
  budget = { files: 2000 },
): Promise<void> {
  if (depth > 3 || budget.files <= 0) return

  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const e of entries) {
    if (budget.files <= 0) return
    if (e.isDirectory()) {
      if (e.name.startsWith('.') && e.name !== '.') continue
      if (['node_modules', 'dist', 'build', 'out', 'target', 'vendor'].includes(e.name)) continue
      await collectExtensions(path.join(dir, e.name), out, depth + 1, budget)
    } else {
      budget.files--
      const ext = path.extname(e.name).toLowerCase()
      if (ext) out.add(ext)
      // File with no extension: also track by basename (e.g. "artisan").
      else out.add(e.name)
    }
  }
}

function ruleMatches(rule: PluginDetectRule, ctx: DetectContext): boolean {
  if (rule.anyFile?.length) {
    for (const f of rule.anyFile) {
      if (ctx.topLevel.has(f) || ctx.topLevel.has(f.replace(/\/$/, '/'))) return true
      // Also check exact name with trailing slash for dirs.
      if (f.endsWith('/') && ctx.topLevel.has(f)) return true
    }
  }

  if (rule.fileExtensions?.length) {
    for (const ext of rule.fileExtensions) {
      const needle = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
      if (ctx.extensions.has(needle)) return true
    }
  }

  if (rule.manifestKey) {
    const json = readManifest(ctx, rule.manifestKey.file)
    if (json && hasJsonPath(json, rule.manifestKey.jsonPath)) return true
  }

  return false
}

function readManifest(ctx: DetectContext, file: string): unknown {
  if (ctx.manifestCache.has(file)) return ctx.manifestCache.get(file)
  const full = path.join(ctx.projectPath, file)
  try {
    const raw = fs.readFileSync(full, 'utf8')
    const parsed = JSON.parse(raw)
    ctx.manifestCache.set(file, parsed)
    return parsed
  } catch {
    ctx.manifestCache.set(file, null)
    return null
  }
}

function hasJsonPath(obj: unknown, dotPath: string): boolean {
  const parts = dotPath.split('.')
  let current: unknown = obj
  for (const p of parts) {
    if (current && typeof current === 'object' && p in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[p]
    } else {
      return false
    }
  }
  return current !== undefined && current !== null
}
