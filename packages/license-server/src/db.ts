import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '..', 'licenses.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS licenses (
        id         TEXT PRIMARY KEY,
        key        TEXT UNIQUE NOT NULL,
        email      TEXT NOT NULL,
        plan       TEXT NOT NULL CHECK(plan IN ('pro','teams')),
        seats      INTEGER,
        expires_at TEXT,
        activated  INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
  }
  return db
}

export interface LicenseRow {
  id: string
  key: string
  email: string
  plan: 'pro' | 'teams'
  seats: number | null
  expires_at: string | null
  activated: number
  created_at: string
}
