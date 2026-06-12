/**
 * Anthropic API key storage for the Reporter feature.
 *
 * The key is stored encrypted-at-rest via Electron `safeStorage` (OS keychain on
 * macOS/Windows, libsecret on Linux) in a file under userData. It lives only in
 * the main process and is NEVER exposed to the renderer — the renderer can ask
 * whether a key exists and set/clear it, but `get()` is main-process-only and is
 * used solely to construct the Anthropic SDK client for report generation.
 */
import { app, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'

function keyFilePath(): string {
  return path.join(app.getPath('userData'), 'anthropic-key.bin')
}

interface StoredKey {
  /** Whether `data` is safeStorage-encrypted (vs base64 plaintext fallback). */
  enc: boolean
  data: string
}

/** Persist the API key (encrypted when the OS supports it). */
export function setApiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    clearApiKey()
    return
  }
  let payload: StoredKey
  if (safeStorage.isEncryptionAvailable()) {
    payload = { enc: true, data: safeStorage.encryptString(trimmed).toString('base64') }
  } else {
    // No OS keychain available — fall back to base64 (obfuscation only).
    payload = { enc: false, data: Buffer.from(trimmed, 'utf-8').toString('base64') }
  }
  const p = keyFilePath()
  fs.writeFileSync(p, JSON.stringify(payload), { mode: 0o600 })
  // `mode` only applies when the file is created; chmod enforces 0600 on
  // overwrite too, so an existing file can't keep looser permissions (the key
  // is only base64-obfuscated in the no-keychain fallback, where perms matter).
  try { fs.chmodSync(p, 0o600) } catch { /* best-effort (e.g. Windows) */ }
}

/** Read the decrypted API key, or null if none is stored / decryption fails. */
export function getApiKey(): string | null {
  try {
    const raw = fs.readFileSync(keyFilePath(), 'utf-8')
    const stored = JSON.parse(raw) as StoredKey
    if (stored.enc) {
      if (!safeStorage.isEncryptionAvailable()) return null
      return safeStorage.decryptString(Buffer.from(stored.data, 'base64'))
    }
    return Buffer.from(stored.data, 'base64').toString('utf-8')
  } catch {
    return null
  }
}

/** Whether a key is currently stored and readable. */
export function hasApiKey(): boolean {
  return getApiKey() !== null
}

/** Remove the stored key. */
export function clearApiKey(): void {
  try {
    fs.unlinkSync(keyFilePath())
  } catch { /* already absent */ }
}
