/**
 * Secret redaction for the Reporter.
 *
 * The Reporter sends real source-code diffs + commit messages to a Claude
 * transport (hosted proxy / BYOK / CLI). A secret sitting in an uncommitted
 * diff (an `.env`, a token, a private key) would otherwise be transmitted
 * verbatim. This strips well-known secret shapes BEFORE anything leaves the
 * main process — for every mode, but especially the hosted proxy where the
 * payload transits Pilos infrastructure.
 *
 * Conservative by design: known token prefixes + a secret-looking
 * key=value heuristic. It will miss exotic secrets, but it must not mangle
 * ordinary code/prose (e.g. `author: "Jane"`, `function getToken()`).
 */
export interface RedactionResult {
  text: string
  count: number
}

export const REDACTION_MARK = '«REDACTED»'

// Unambiguous secret token shapes. Order matters: more specific first.
const TOKEN_PATTERNS: RegExp[] = [
  // PEM private key blocks (any flavour)
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic
  /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/g, // OpenAI
  /\b(?:gh[posru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, // GitHub
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS access key id
  /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}/g, // Stripe secret/restricted
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g, // Bearer tokens
]

// `SOMETHING_SECRET = value` / `apiKey: "value"` — mask the value, keep the key.
// The key name must contain a secret-ish token (NOT bare "auth", so "author" is safe).
const ENV_ASSIGN =
  /\b([A-Za-z0-9_]*(?:secret|token|passwd|password|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|credential|authorization)[A-Za-z0-9_]*\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s'";,]{4,})/gi

/** Strip known secrets from a block of text. Returns the redacted text + how many were removed. */
export function redactSecrets(input: string): RedactionResult {
  if (!input) return { text: input ?? '', count: 0 }
  let count = 0
  let text = input
  for (const re of TOKEN_PATTERNS) {
    text = text.replace(re, () => { count++; return REDACTION_MARK })
  }
  text = text.replace(ENV_ASSIGN, (_m, prefix: string) => { count++; return prefix + REDACTION_MARK })
  // Credentials embedded in a connection-string URI: scheme://user:PASSWORD@host
  // → keep "scheme://user:" + host, mask the password.
  text = text.replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/gi, (_m, prefix: string) => { count++; return prefix + REDACTION_MARK + '@' })
  return { text, count }
}
