/**
 * main-log — minimal error logging for the Electron main process.
 *
 * `console.error` in main goes to stdout, which a packaged app discards — so
 * failures like the reporter's generic "Failed to generate report" left no
 * trace at all. This appends errors to a real file under the OS logs dir
 * (`~/Library/Logs/<App>/main.log` on macOS) so a user-reported banner can
 * actually be diagnosed after the fact.
 *
 * Deliberately dependency-free and best-effort: logging must never throw into
 * a caller that is already handling an error.
 */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 512 * 1024 // rotate at 512KB — keeps one .old alongside

let logPath: string | null = null

function resolvePath(): string | null {
  if (logPath) return logPath
  try {
    const dir = app.getPath('logs')
    fs.mkdirSync(dir, { recursive: true })
    logPath = path.join(dir, 'main.log')
    return logPath
  } catch {
    return null
  }
}

function rotateIfNeeded(file: string) {
  try {
    if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.old`)
  } catch {
    /* file may not exist yet — nothing to rotate */
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    return err.stack || `${err.name}: ${err.message}`
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/** Append an error to the main-process log. Never throws. */
export function logMainError(scope: string, message: string, err?: unknown) {
  const line = `[${new Date().toISOString()}] [${scope}] ${message}${err !== undefined ? `\n${describe(err)}` : ''}\n`
  // Keep dev feedback in the terminal too.
  console.error(`[${scope}] ${message}`, err ?? '')
  const file = resolvePath()
  if (!file) return
  try {
    rotateIfNeeded(file)
    fs.appendFileSync(file, line)
  } catch {
    /* best-effort: never let logging break the caller */
  }
}

/** Absolute path of the log file, for surfacing in the UI / support flows. */
export function mainLogPath(): string | null {
  return resolvePath()
}
