import crypto from 'crypto'
import { getDb } from './db.js'

const db = getDb()

const seeds = [
  {
    id: crypto.randomUUID(),
    key: 'PILOS-PRO-TEST-0001',
    email: 'test@pilos.ai',
    plan: 'pro',
    seats: null,
    expires_at: null,
  },
  {
    id: crypto.randomUUID(),
    key: 'PILOS-TEAMS-TEST-001',
    email: 'team@pilos.ai',
    plan: 'teams',
    seats: 10,
    expires_at: null,
  },
  {
    id: crypto.randomUUID(),
    key: 'PILOS-PRO-EXP-0001',
    email: 'expired@pilos.ai',
    plan: 'pro',
    seats: null,
    expires_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
  },
]

const insert = db.prepare(
  'INSERT OR IGNORE INTO licenses (id, key, email, plan, seats, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
)

for (const s of seeds) {
  insert.run(s.id, s.key, s.email, s.plan, s.seats, s.expires_at)
}

console.log('Seeded 3 test license keys:')
console.log('  PILOS-PRO-TEST-0001  -> pro, no expiry')
console.log('  PILOS-TEAMS-TEST-001 -> teams, 10 seats, no expiry')
console.log('  PILOS-PRO-EXP-0001   -> pro, expired (yesterday)')
