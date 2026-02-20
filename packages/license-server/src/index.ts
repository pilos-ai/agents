import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { getDb } from './db.js'
import licensesRoutes from './routes/licenses.js'

// Ensure DB + tables exist on startup
getDb()

const app = new Hono()

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

app.route('/v1/licenses', licensesRoutes)

app.get('/', (c) => c.json({ service: 'pilos-license-server', version: '1.0.0' }))

const port = Number(process.env.PORT) || 3456

serve({ fetch: app.fetch, port }, () => {
  console.log(`License server running on http://localhost:${port}`)
})
