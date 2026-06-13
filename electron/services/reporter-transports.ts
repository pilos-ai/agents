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
// Set this (env or build config) once the P2 reporter proxy is live.
const REPORTER_BASE = process.env.PILOS_REPORTER_URL || ''

/** Whether the hosted proxy is configured/available in this build. */
export function hostedAvailable(): boolean {
  return REPORTER_BASE.length > 0
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

/** Generate a report via the Pilos hosted proxy (our key, server-side quota). */
export async function generateViaProxy(
  prompt: string,
  opts: { format: string; model: string; maxTokens: number; licenseKey?: string; email?: string },
): Promise<string> {
  if (!hostedAvailable()) {
    throw new Error('HOSTED_NOT_AVAILABLE')
  }
  const res = await fetch(`${REPORTER_BASE}/v1/reporter/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.licenseKey ? { Authorization: `Bearer ${opts.licenseKey}` } : {}),
    },
    body: JSON.stringify({
      prompt,
      format: opts.format,
      model: opts.model,
      maxTokens: opts.maxTokens,
      email: opts.email,
    }),
  })
  if (res.status === 402 || res.status === 429) {
    let remaining = 0
    try { remaining = (await res.json())?.remaining ?? 0 } catch { /* ignore */ }
    throw new QuotaExceededError(remaining)
  }
  if (!res.ok) {
    throw new Error(`Pilos reporter proxy error (${res.status})`)
  }
  const data = (await res.json()) as { summary?: string }
  if (!data.summary) throw new Error('Pilos reporter proxy returned no summary')
  return data.summary
}

export { LICENSE_SERVER }
