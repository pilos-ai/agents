#!/usr/bin/env node
/**
 * Dev-only: seeds two fake prior signatures so the repetition detector fires a
 * workflow suggestion on the next conversation in the given project.
 *
 * By default it CLONES the most recent real conversation signature for the
 * project, so Jaccard overlap is 1.0 and the banner fires immediately. Pass
 * --synthetic to fall back to a hard-coded Read→Grep→Edit pattern.
 *
 * Usage (better-sqlite3 is compiled for Electron, so run via Electron's Node):
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/seed-repetition.mjs --project /abs/path/to/project
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/seed-repetition.mjs --project /abs/path/to/project --synthetic
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/seed-repetition.mjs --project /abs/path/to/project --clear
 */

import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const SEED_PREFIX = 'seed-rep-'

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function parseArgs() {
  const args = { project: null, clear: false, synthetic: false }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project' && argv[i + 1]) { args.project = argv[++i] }
    else if (argv[i] === '--clear') { args.clear = true }
    else if (argv[i] === '--synthetic') { args.synthetic = true }
  }
  return args
}

function resolveUserDataDir() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Pilos Agents')
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Pilos Agents')
  }
  return join(homedir(), '.config', 'Pilos Agents')
}

function pickTemplate(db, project, synthetic) {
  if (!synthetic) {
    const row = db.prepare(`
      SELECT tool_list, verbs, nouns, message_count, tool_count
      FROM conversation_signatures
      WHERE project_path = ? AND conversation_id NOT LIKE ? AND tool_count >= 3
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(project, `${SEED_PREFIX}%`)
    if (row) {
      return {
        toolList: JSON.parse(row.tool_list),
        verbs: JSON.parse(row.verbs),
        nouns: JSON.parse(row.nouns),
        messageCount: row.message_count,
        toolCount: row.tool_count,
        source: 'cloned from most recent real conversation',
      }
    }
  }
  return {
    toolList: ['Read', 'Grep', 'Edit'],
    verbs: ['refactor', 'update', 'fix'],
    nouns: ['component', 'handler', 'store'],
    messageCount: 8,
    toolCount: 3,
    source: 'synthetic Read → Grep → Edit template',
  }
}

function main() {
  const { project, clear, synthetic } = parseArgs()
  if (!project) {
    console.error('Missing --project <absolute path to your project>')
    process.exit(1)
  }

  const dbPath = join(resolveUserDataDir(), 'claude-code.db')
  if (!existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true })
  if (!existsSync(dbPath)) {
    console.error(`DB not found at ${dbPath}. Launch the app once first.`)
    process.exit(1)
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  if (clear) {
    const res = db
      .prepare("DELETE FROM conversation_signatures WHERE conversation_id LIKE ? AND project_path = ?")
      .run(`${SEED_PREFIX}%`, project)
    console.log(`Cleared ${res.changes} seed rows for project ${project}`)
    db.close()
    return
  }

  const tpl = pickTemplate(db, project, synthetic)
  const toolHash = fnv1a(tpl.toolList.join('>'))

  const stmt = db.prepare(`
    INSERT INTO conversation_signatures
      (conversation_id, project_path, tool_hash, tool_list, verbs, nouns, message_count, tool_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(conversation_id) DO UPDATE SET
      project_path=excluded.project_path,
      tool_hash=excluded.tool_hash,
      tool_list=excluded.tool_list,
      verbs=excluded.verbs,
      nouns=excluded.nouns,
      message_count=excluded.message_count,
      tool_count=excluded.tool_count,
      updated_at=datetime('now')
  `)

  for (let i = 1; i <= 2; i++) {
    stmt.run(
      `${SEED_PREFIX}${i}`,
      project,
      toolHash,
      JSON.stringify(tpl.toolList),
      JSON.stringify(tpl.verbs),
      JSON.stringify(tpl.nouns),
      tpl.messageCount,
      tpl.toolCount,
    )
  }

  db.close()

  console.log(`Seeded 2 fake prior conversations for project:\n  ${project}`)
  console.log(`Template: ${tpl.source}`)
  console.log(`  tool_list: ${tpl.toolList.join(' → ')}`)
  console.log(`  verbs:     ${tpl.verbs.slice(0, 8).join(', ')}${tpl.verbs.length > 8 ? ' …' : ''}`)
  console.log(`  nouns:     ${tpl.nouns.slice(0, 8).join(', ')}${tpl.nouns.length > 8 ? ' …' : ''}`)
  console.log(`  tool_hash: ${toolHash}`)
  console.log(`\nTo trigger the banner: in that project, open a NEW conversation`)
  console.log(`and send a message similar to what you did before. The banner`)
  console.log(`should appear once the first assistant tool call finishes.`)
  console.log(`\nCleanup: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron \\`)
  console.log(`           scripts/seed-repetition.mjs --project ${project} --clear`)
}

main()
