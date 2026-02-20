import { Hono } from 'hono'
import crypto from 'crypto'
import { getDb, type LicenseRow } from '../db.js'

const app = new Hono()

// POST /v1/licenses/validate
app.post('/validate', (c) => {
  const body = c.req.json()
  return body.then(({ key }: { key: string }) => {
    if (!key) return c.json({ valid: false, error: 'Missing license key' }, 400)

    const db = getDb()
    const row = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key) as LicenseRow | undefined

    if (!row) {
      return c.json({ valid: false, error: 'Invalid license key' })
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return c.json({ valid: false, error: 'License expired' })
    }

    return c.json({
      valid: true,
      license: {
        key: row.key,
        email: row.email,
        plan: row.plan,
        seats: row.seats,
        expiresAt: row.expires_at,
      },
    })
  })
})

// POST /v1/licenses/activate
app.post('/activate', (c) => {
  const body = c.req.json()
  return body.then(({ key }: { key: string }) => {
    if (!key) return c.json({ valid: false, error: 'Missing license key' }, 400)

    const db = getDb()
    const row = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key) as LicenseRow | undefined

    if (!row) {
      return c.json({ valid: false, error: 'Invalid license key' })
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return c.json({ valid: false, error: 'License expired' })
    }

    db.prepare('UPDATE licenses SET activated = 1 WHERE key = ?').run(key)

    return c.json({
      valid: true,
      license: {
        key: row.key,
        email: row.email,
        plan: row.plan,
        seats: row.seats,
        expiresAt: row.expires_at,
      },
    })
  })
})

// POST /v1/licenses/deactivate
app.post('/deactivate', (c) => {
  const body = c.req.json()
  return body.then(({ key }: { key: string }) => {
    if (!key) return c.json({ success: false, error: 'Missing license key' }, 400)

    const db = getDb()
    db.prepare('UPDATE licenses SET activated = 0 WHERE key = ?').run(key)
    return c.json({ success: true })
  })
})

// GET /v1/licenses — admin/dev: list all
app.get('/', (c) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all() as LicenseRow[]
  return c.json(rows)
})

// POST /v1/licenses — admin/dev: create new key
app.post('/', (c) => {
  const body = c.req.json()
  return body.then(({ email, plan, seats, expiresAt }: {
    email: string
    plan: 'pro' | 'teams'
    seats?: number
    expiresAt?: string
  }) => {
    if (!email || !plan) {
      return c.json({ error: 'email and plan are required' }, 400)
    }

    const db = getDb()
    const id = crypto.randomUUID()
    const prefix = plan === 'teams' ? 'PILOS-TEAMS' : 'PILOS-PRO'
    const suffix = crypto.randomBytes(4).toString('hex').toUpperCase()
    const key = `${prefix}-${suffix.slice(0, 4)}-${suffix.slice(4)}`

    db.prepare(
      'INSERT INTO licenses (id, key, email, plan, seats, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, key, email, plan, seats ?? null, expiresAt ?? null)

    const row = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id) as LicenseRow
    return c.json(row, 201)
  })
})

export default app
