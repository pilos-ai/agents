/**
 * Reporter Claude transports — the three ways a report can be generated.
 *
 *  - BYOK   : user's own Anthropic key, direct (handled inline in the handler).
 *  - CLI    : spawn the user's `claude` CLI one-shot (their Claude subscription).
 *  - HOSTED : POST the prompt to the Pilos backend proxy (our key, server-side
 *             quota). The backend ships in P2; until PILOS_REPORTER_URL is set,
 *             hostedAvailable() is false and the UI offers BYOK/CLI instead.
 *
 * All of these run in the main process; the renderer only picks a mode string.
 * Secrets are already redacted from the prompt upstream (secret-redaction.ts).
 */
import { spawn } from 'child_process'
import { findClaudeBinary, getExpandedEnv } from './cli-checker'

const LICENSE_SERVER = process.env.PILOS_LICENSE_SERVER || 'https://license.pilos.net'
// Pilos Cloud reporter endpoint. Defaults to the license server; override with
// PILOS_REPORTER_URL for local dev (e.g. http://localhost:3456).
const REPORTER_BASE = process.env.PILOS_REPORTER_URL || LICENSE_SERVER

/** Pilos Cloud is the default path — available whenever a base URL is set. */
export function hostedAvailable(): boolean {
  return REPORTER_BASE.length > 0
}

export interface HostedReportPayload {
  commits: unknown[]
  format: string
  dateStr: string
  omitTimes?: boolean
  metadataOnly?: boolean
  model?: string
  licenseKey?: string
  email?: string
  machineId?: string
}

/** Error thrown when the hosted free quota is exhausted (→ upgrade CTA). */
export class QuotaExceededError extends Error {
  constructor(public remaining = 0) {
    super('Daily report limit reached.')
    this.name = 'QuotaExceededError'
  }
}

/** Generate a report by spawning the user's Claude CLI in print mode. */
export function generateViaCli(prompt: string, model: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let bin: string
    try {
      bin = findClaudeBinary()
    } catch (e) {
      return reject(e instanceof Error ? e : new Error(String(e)))
    }
    const proc = spawn(bin, ['-p', '--model', model], { env: getExpandedEnv() })
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => { out += d.toString() })
    proc.stderr.on('data', (d) => { err += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0 && out.trim()) resolve(out.trim())
      else reject(new Error(err.trim() || `claude CLI exited with code ${code}`))
    })
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

/**
 * Generate a report via Pilos Cloud. The backend builds the prompt + calls Claude
 * (our key, server-side quota); we send only the already-redacted git data.
 */
export async function generateViaProxy(payload: HostedReportPayload): Promise<string> {
  if (!hostedAvailable()) throw new Error('HOSTED_NOT_AVAILABLE')
  const res = await fetch(`${REPORTER_BASE}/v1/reporter/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 402 || res.status === 429) {
    let remaining = 0
    try { remaining = (await res.json())?.remaining ?? 0 } catch { /* ignore */ }
    throw new QuotaExceededError(remaining)
  }
  if (!res.ok) throw new Error(`Pilos Cloud error (${res.status})`)
  const data = (await res.json()) as { summary?: string; error?: string }
  if (!data.summary) throw new Error(data.error || 'Pilos Cloud returned no summary')
  return data.summary
}

export interface ReporterUsageData {
  tier: string
  isPro: boolean
  limit: number | null
  today: { count: number; remaining: number }
  week: number
  totals: { reports: number; commits: number; files: number; additions: number; deletions: number; tokensIn: number; tokensOut: number }
  byFormat: Record<string, number>
  daily: { date: string; count: number }[]
  recent: { ts: string; format: string; commits: number; files: number; additions: number; deletions: number; tokensOut: number }[]
}

/** Fetch usage analytics for this subject from Pilos Cloud (synced across devices). */
export async function fetchUsageViaProxy(payload: { licenseKey?: string; email?: string; machineId?: string }): Promise<ReporterUsageData | null> {
  if (!hostedAvailable()) return null
  const res = await fetch(`${REPORTER_BASE}/v1/reporter/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Pilos Cloud usage error (${res.status})`)
  return (await res.json()) as ReporterUsageData
}

/** Ask Pilos Cloud for the exact prompt it would build (server-side templates). */
export async function previewViaProxy(payload: HostedReportPayload): Promise<{ prompt: string; chars: number }> {
  if (!hostedAvailable()) throw new Error('HOSTED_NOT_AVAILABLE')
  const res = await fetch(`${REPORTER_BASE}/v1/reporter/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Pilos Cloud preview error (${res.status})`)
  const data = (await res.json()) as { prompt?: string; chars?: number }
  return { prompt: data.prompt ?? '', chars: data.chars ?? (data.prompt?.length ?? 0) }
}

export { LICENSE_SERVER }
