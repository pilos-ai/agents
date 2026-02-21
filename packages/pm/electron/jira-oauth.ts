import { shell } from 'electron'
import crypto from 'crypto'
import http from 'http'
import { SettingsStore } from '../../../electron/services/settings-store'

// Register your OAuth app at https://developer.atlassian.com/console/myapps/
// Set callback URL to http://localhost with any port
const ATLASSIAN_CLIENT_ID = 'ATLASSIAN_CLIENT_ID_PLACEHOLDER'
const ATLASSIAN_CLIENT_SECRET = 'ATLASSIAN_CLIENT_SECRET_PLACEHOLDER'
const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize'
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token'
const ATLASSIAN_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources'

const SCOPES = [
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'read:sprint:jira-software',
  'read:board:jira-software',
  'read:project:jira',
  'offline_access',
].join(' ')

export interface JiraTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  cloudId: string
  siteUrl: string
  siteName: string
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export class JiraOAuth {
  private settings: SettingsStore
  private activeProjectPath: string | null = null

  constructor(settings: SettingsStore) {
    this.settings = settings
  }

  private tokenKey(projectPath?: string): string {
    const p = projectPath || this.activeProjectPath
    return p ? `jiraTokens:${p}` : 'jiraTokens'
  }

  setActiveProject(projectPath: string | null): void {
    this.activeProjectPath = projectPath
  }

  async authorize(): Promise<JiraTokens> {
    // Generate PKCE pair
    const codeVerifier = base64url(crypto.randomBytes(32))
    const codeChallenge = base64url(
      crypto.createHash('sha256').update(codeVerifier).digest()
    )

    return new Promise<JiraTokens>((resolve, reject) => {
      // Start local HTTP server on fixed port (must match Atlassian callback URL)
      const CALLBACK_PORT = 8088
      const server = http.createServer()
      server.listen(CALLBACK_PORT, '127.0.0.1', () => {
        const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}`
        const state = crypto.randomBytes(16).toString('hex')

        // Build auth URL
        const authUrl = new URL(ATLASSIAN_AUTH_URL)
        authUrl.searchParams.set('audience', 'api.atlassian.com')
        authUrl.searchParams.set('client_id', ATLASSIAN_CLIENT_ID)
        authUrl.searchParams.set('scope', SCOPES)
        authUrl.searchParams.set('redirect_uri', redirectUri)
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('prompt', 'consent')
        authUrl.searchParams.set('code_challenge', codeChallenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')

        // Open browser
        shell.openExternal(authUrl.toString())

        // Timeout after 5 minutes
        const timeout = setTimeout(() => {
          server.close()
          reject(new Error('OAuth timed out'))
        }, 5 * 60 * 1000)

        server.on('request', async (req, res) => {
          const url = new URL(req.url || '/', `http://127.0.0.1:${CALLBACK_PORT}`)

          const code = url.searchParams.get('code')
          const returnedState = url.searchParams.get('state')

          // Ignore requests without code (favicon, etc.)
          if (!code) {
            res.writeHead(204)
            res.end()
            return
          }

          if (returnedState !== state) {
            res.writeHead(400)
            res.end('Invalid state')
            clearTimeout(timeout)
            server.close()
            reject(new Error('Invalid OAuth callback'))
            return
          }

          // Send success page
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Connected to Jira!</h2><p>You can close this tab and return to Pilos.</p></body></html>')

          clearTimeout(timeout)
          server.close()

          try {
            // Exchange code for tokens
            const tokenResponse = await fetch(ATLASSIAN_TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: ATLASSIAN_CLIENT_ID,
                client_secret: ATLASSIAN_CLIENT_SECRET,
                code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
              }),
            })

            if (!tokenResponse.ok) {
              const err = await tokenResponse.text()
              reject(new Error(`Token exchange failed: ${err}`))
              return
            }

            const tokenData = await tokenResponse.json() as {
              access_token: string
              refresh_token: string
              expires_in: number
            }

            // Fetch accessible resources to get cloudId
            const resourcesResponse = await fetch(ATLASSIAN_RESOURCES_URL, {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            })

            if (!resourcesResponse.ok) {
              reject(new Error('Failed to fetch Jira sites'))
              return
            }

            const resources = await resourcesResponse.json() as Array<{
              id: string
              url: string
              name: string
            }>

            if (resources.length === 0) {
              reject(new Error('No Jira sites found for this account'))
              return
            }

            // Use first site
            const site = resources[0]
            const tokens: JiraTokens = {
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              expiresAt: Date.now() + tokenData.expires_in * 1000,
              cloudId: site.id,
              siteUrl: site.url,
              siteName: site.name,
            }

            // Save tokens for the active project
            this.settings.set(this.tokenKey(), tokens)
            resolve(tokens)
          } catch (err) {
            reject(err)
          }
        })
      })
    })
  }

  async getValidTokens(): Promise<JiraTokens | null> {
    const tokens = this.settings.get(this.tokenKey()) as JiraTokens | null
    if (!tokens) return null

    // If token expires within 1 minute, refresh
    if (Date.now() > tokens.expiresAt - 60_000) {
      try {
        return await this.refreshTokens(tokens)
      } catch {
        // If refresh fails, clear tokens
        this.settings.set(this.tokenKey(), null)
        return null
      }
    }

    return tokens
  }

  private async refreshTokens(tokens: JiraTokens): Promise<JiraTokens> {
    const response = await fetch(ATLASSIAN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: ATLASSIAN_CLIENT_ID,
        client_secret: ATLASSIAN_CLIENT_SECRET,
        refresh_token: tokens.refreshToken,
      }),
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    const data = await response.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    const newTokens: JiraTokens = {
      ...tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }

    this.settings.set(this.tokenKey(), newTokens)
    return newTokens
  }

  disconnect(): void {
    this.settings.set(this.tokenKey(), null)
  }
}
