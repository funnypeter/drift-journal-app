// Minimal fetch-based Garmin Connect client — the subset of the `garmin-connect`
// package this app uses (SSO login, OAuth1→OAuth2 exchange, activity list,
// activity detail, original FIT download). That package reads config from disk
// at import time and can't load in a Cloudflare Worker. Server-only.

const SSO = 'https://sso.garmin.com/sso'
const SSO_EMBED = `${SSO}/embed`
const SIGNIN_URL = `${SSO}/signin`
const GC_MODERN = 'https://connect.garmin.com/modern'
const GC_API = 'https://connectapi.garmin.com'
const OAUTH_URL = `${GC_API}/oauth-service/oauth`
const OAUTH_CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json'
const UA_MOBILE = 'com.garmin.android.apps.connectmobile'
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'

export interface OAuth1Token { oauth_token: string; oauth_token_secret: string; [k: string]: unknown }
export interface OAuth2Token { access_token: string; expires_at: number; expires_in: number; [k: string]: unknown }

// Same shape the old package exported, so stored tokens keep working.
export interface GarminTokens { oauth1: OAuth1Token; oauth2: OAuth2Token }

// ── OAuth 1.0a (HMAC-SHA1), as the oauth-1.0a package signs it ───────────────

const rfc3986 = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())

async function hmacSha1(key: string, data: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)))
  return btoa(String.fromCharCode(...Array.from(sig)))
}

type Consumer = { key: string; secret: string }

let consumerCache: Consumer | null = null
async function oauthConsumer(): Promise<Consumer> {
  if (consumerCache) return consumerCache
  const r = await fetch(OAUTH_CONSUMER_URL)
  if (!r.ok) throw new Error(`Could not load Garmin OAuth consumer (${r.status})`)
  const j = (await r.json()) as { consumer_key: string; consumer_secret: string }
  return (consumerCache = { key: j.consumer_key, secret: j.consumer_secret })
}

async function oauthParams(method: string, url: string, consumer: Consumer, token?: { key: string; secret: string }) {
  const u = new URL(url)
  const oauth: Record<string, string> = {
    oauth_consumer_key: consumer.key,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...(token ? { oauth_token: token.key } : {}),
  }
  const all: [string, string][] = [...u.searchParams.entries(), ...Object.entries(oauth)]
  const paramStr = all
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const base = [method.toUpperCase(), rfc3986(`${u.origin}${u.pathname}`), rfc3986(paramStr)].join('&')
  oauth.oauth_signature = await hmacSha1(`${rfc3986(consumer.secret)}&${rfc3986(token?.secret || '')}`, base)
  return oauth
}

const qs = (o: Record<string, string | boolean>) =>
  Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')

async function check(r: Response, what: string) {
  if (!r.ok) throw new Error(`ERROR: (${r.status}) ${what}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
  return r
}

// ── Login ────────────────────────────────────────────────────────────────────

async function exchange(consumer: Consumer, oauth1: OAuth1Token): Promise<OAuth2Token> {
  const baseUrl = `${OAUTH_URL}/exchange/user/2.0`
  const params = await oauthParams('POST', baseUrl, consumer, { key: oauth1.oauth_token, secret: oauth1.oauth_token_secret })
  const r = await check(
    await fetch(`${baseUrl}?${qs(params)}`, {
      method: 'POST',
      headers: { 'User-Agent': UA_MOBILE, 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
    'OAuth2 exchange'
  )
  const t = (await r.json()) as OAuth2Token & { refresh_token_expires_in?: number }
  const now = Date.now() / 1000
  return {
    ...t,
    expires_at: now + t.expires_in,
    refresh_token_expires_at: now + (t.refresh_token_expires_in || 0),
    last_update_date: new Date().toISOString(),
  }
}

export async function garminLogin(username: string, password: string): Promise<GarminTokens> {
  const consumer = await oauthConsumer()

  await fetch(`${SSO_EMBED}?${qs({ clientId: 'GarminConnect', locale: 'en', service: GC_MODERN })}`)
  const signinPage = await (
    await check(await fetch(`${SIGNIN_URL}?${qs({ id: 'gauth-widget', embedWidget: true, locale: 'en', gauthHost: SSO_EMBED })}`), 'SSO sign-in page')
  ).text()
  const csrf = /name="_csrf"\s+value="(.+?)"/.exec(signinPage)?.[1]
  if (!csrf) throw new Error('login - csrf not found')

  const signinParams = {
    id: 'gauth-widget', embedWidget: true, clientId: 'GarminConnect', locale: 'en',
    gauthHost: SSO_EMBED, service: SSO_EMBED, source: SSO_EMBED,
    redirectAfterAccountLoginUrl: SSO_EMBED, redirectAfterAccountCreationUrl: SSO_EMBED,
  }
  const result = await (
    await fetch(`${SIGNIN_URL}?${qs(signinParams)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Dnt: '1',
        Origin: 'https://sso.garmin.com',
        Referer: SIGNIN_URL,
        'User-Agent': UA_BROWSER,
      },
      body: new URLSearchParams({ username, password, embed: 'true', _csrf: csrf }),
    })
  ).text()

  // Same (quirky) pattern garmin-connect used — kept identical so ordinary
  // bad-password pages aren't misreported as locked accounts.
  if (/var statuss*=s*"([^"]*)"/.test(result)) {
    throw new Error('login failed (AccountLocked), please open connect web page to unlock your account')
  }
  if (/<title>[^<]*Update Phone Number[^<]*<\/title>/.test(result)) {
    throw new Error('login failed (Update Phone number) — update it in Garmin Connect first')
  }
  const ticket = /ticket=([^"]+)"/.exec(result)?.[1]
  if (!ticket) throw new Error('login failed (Ticket not found or MFA), please check username and password')

  const preauthUrl = `${OAUTH_URL}/preauthorized?${qs({ ticket, 'login-url': SSO_EMBED, 'accepts-mfa-tokens': true })}`
  const p = await oauthParams('GET', preauthUrl, consumer)
  const header = 'OAuth ' + Object.entries(p).map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`).join(', ')
  const oauth1Text = await (
    await check(await fetch(preauthUrl, { headers: { Authorization: header, 'User-Agent': UA_MOBILE } }), 'OAuth1 preauthorize')
  ).text()
  const oauth1 = Object.fromEntries(new URLSearchParams(oauth1Text)) as OAuth1Token
  if (!oauth1.oauth_token || !oauth1.oauth_token_secret) throw new Error('Login succeeded but no token returned')

  return { oauth1, oauth2: await exchange(consumer, oauth1) }
}

// ── Authenticated API ────────────────────────────────────────────────────────

export class GarminClient {
  /** True once the OAuth2 token was refreshed — callers should persist `tokens`. */
  refreshed = false

  constructor(public tokens: GarminTokens) {}

  private async refresh() {
    this.tokens = { ...this.tokens, oauth2: await exchange(await oauthConsumer(), this.tokens.oauth1) }
    this.refreshed = true
  }

  private async request(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
    if (!retried && this.tokens.oauth2.expires_at < Date.now() / 1000) await this.refresh()
    const r = await fetch(`${GC_API}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${this.tokens.oauth2.access_token}` },
    })
    if (r.status === 401 && !retried) {
      await this.refresh()
      return this.request(path, init, true)
    }
    return check(r, path)
  }

  async getActivities(start: number, limit: number): Promise<any[]> {
    return (await this.request(`/activitylist-service/activities/search/activities?start=${start}&limit=${limit}`)).json()
  }

  async getActivity(activityId: number): Promise<any> {
    return (await this.request(`/activity-service/activity/${activityId}`)).json()
  }

  /** The original upload (a zip holding the .fit). */
  async downloadOriginal(activityId: number): Promise<Uint8Array> {
    return new Uint8Array(await (await this.request(`/download-service/files/activity/${activityId}`)).arrayBuffer())
  }
}
