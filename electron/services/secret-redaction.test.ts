import { describe, it, expect } from 'vitest'
import { redactSecrets, REDACTION_MARK } from './secret-redaction'

// NOTE: token fixtures are assembled from fragments at runtime so the source
// file never contains a contiguous, real-looking secret (keeps GitHub secret
// scanning / push-protection happy). The concatenated runtime value still
// exercises the redaction patterns exactly as a real token would.

describe('redactSecrets', () => {
  it('redacts an Anthropic key', () => {
    const key = 'sk-ant-' + 'api03-abcdEFGH1234567890ijklmnop'
    const r = redactSecrets(`const k = "${key}"`)
    expect(r.text).not.toContain(key)
    expect(r.text).toContain(REDACTION_MARK)
    expect(r.count).toBe(1)
  })

  it('redacts GitHub, Slack, Google, AWS, Stripe tokens and JWTs', () => {
    const samples = [
      'ghp_' + '0123456789abcdefABCDEF0123456789abcd',
      'xoxb' + '-123456789012-abcdefghijklmnop',
      'AIza' + 'SyA1234567890abcdefghijklmnopqrstuvw',
      'AKIA' + 'IOSFODNN7EXAMPLE',
      'sk_' + 'live_0123456789abcdefABCDEFxyz',
      'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxMjM0NQ.dozjgNryP4J3jVmNHl0w5N',
    ]
    for (const s of samples) {
      const r = redactSecrets(`token=${s}`)
      expect(r.text, s).not.toContain(s)
      expect(r.count, s).toBeGreaterThanOrEqual(1)
    }
  })

  it('redacts a PEM private key block', () => {
    const body = 'MIIEpAIBAAKCAQEA'
    const pem = '-----BEGIN RSA ' + `PRIVATE KEY-----\n${body}\nabcd\n-----END RSA PRIVATE KEY-----`
    const r = redactSecrets(`key:\n${pem}`)
    expect(r.text).not.toContain(body)
    expect(r.text).toContain(REDACTION_MARK)
  })

  it('masks the value of secret-looking assignments, keeps the key', () => {
    expect(redactSecrets('API_KEY=supersecretvalue123').text).toBe(`API_KEY=${REDACTION_MARK}`)
    expect(redactSecrets('  password: "hunter2pass"').text).toBe(`  password: ${REDACTION_MARK}`)
    expect(redactSecrets("DB_PASSWORD = 'p@ssw0rd!'").text).toBe(`DB_PASSWORD = ${REDACTION_MARK}`)
    expect(redactSecrets('clientSecret: abcd1234efgh').text).toBe(`clientSecret: ${REDACTION_MARK}`)
  })

  it('masks the password in a connection-string URI, keeps scheme/user/host', () => {
    const pw = 's3cr3tPass'
    const r = redactSecrets(`DATABASE_URL=postgres://admin:${pw}@db.internal:5432/app`)
    expect(r.text).not.toContain(pw)
    expect(r.text).toContain('postgres://admin:')
    expect(r.text).toContain('@db.internal')
  })

  it('does NOT touch ordinary code/prose (no false positives)', () => {
    const safe = [
      'author: "Jane Doe"',
      'function getToken() { return next }',
      'if (password === userInput) return true',
      'Refactored the auth module and fixed the login flow',
      'See https://example.com/docs/api for details',
      'const count = 42',
    ]
    for (const s of safe) {
      const r = redactSecrets(s)
      expect(r.text, s).toBe(s)
      expect(r.count, s).toBe(0)
    }
  })

  it('handles empty/undefined input', () => {
    expect(redactSecrets('').count).toBe(0)
    // @ts-expect-error testing nullish guard
    expect(redactSecrets(undefined).text).toBe('')
  })
})
