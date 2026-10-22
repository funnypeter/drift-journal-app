import { cookies } from 'next/headers'
import { db, env } from '@/lib/cf'

// Email-code sign-in + cookie sessions on D1 (replaces Supabase Auth).
// The cookie holds a random token; D1 stores only its SHA-256.

export const SESSION_COOKIE = 'dj_session'
const SESSION_MS = 365 * 24 * 60 * 60 * 1000
const CODE_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5

export interface Session { user: { id: string; email: string } }

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...Array.from(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const row = await db()
    .prepare(
      `select u.id, u.email from sessions s join users u on u.id = s.user_id
       where s.token_hash = ? and s.expires_at > ?`
    )
    .bind(await sha256(token), Date.now())
    .first<{ id: string; email: string }>()
  return row ? { user: row } : null
}

export async function sendLoginCode(rawEmail: string) {
  const email = normalizeEmail(rawEmail)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address')
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
  await db()
    .prepare(
      `insert into login_codes (email, code_hash, expires_at, attempts) values (?, ?, ?, 0)
       on conflict(email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`
    )
    .bind(email, await sha256(`${email}:${code}`), Date.now() + CODE_MS)
    .run()

  const e = env()
  await e.EMAIL.send({
    to: email,
    from: { email: e.EMAIL_FROM, name: 'Drift Journal' },
    subject: `Your Drift Journal code: ${code}`,
    text: `Your Drift Journal sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;color:#1e4d43">
      <p>Your Drift Journal sign-in code is</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>
      <p style="color:#666">It expires in 10 minutes. If you didn't request it, you can ignore this email.</p></div>`,
  })
}

/** Check the code; on success create the user if new and set the session cookie. */
export async function verifyLoginCode(rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail)
  const row = await db()
    .prepare('select code_hash, expires_at, attempts from login_codes where email = ?')
    .bind(email)
    .first<{ code_hash: string; expires_at: number; attempts: number }>()
  if (!row || row.expires_at < Date.now() || row.attempts >= MAX_ATTEMPTS) {
    throw new Error('Code expired — request a new one')
  }
  if ((await sha256(`${email}:${code.trim()}`)) !== row.code_hash) {
    await db().prepare('update login_codes set attempts = attempts + 1 where email = ?').bind(email).run()
    throw new Error('Incorrect code')
  }

  let user = await db().prepare('select id from users where email = ?').bind(email).first<{ id: string }>()
  if (!user) {
    user = { id: crypto.randomUUID() }
    await db().batch([
      db().prepare('insert into users (id, email) values (?, ?)').bind(user.id, email),
      db().prepare('insert into profiles (id, email) values (?, ?)').bind(user.id, email),
    ])
  }

  const token = randomToken()
  const expires = Date.now() + SESSION_MS
  await db().batch([
    db().prepare('delete from login_codes where email = ?').bind(email),
    db().prepare('delete from sessions where expires_at < ?').bind(Date.now()),
    db().prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').bind(await sha256(token), user.id, expires),
  ])
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: new Date(expires),
  })
}

export async function signOut() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await db().prepare('delete from sessions where token_hash = ?').bind(await sha256(token)).run()
  jar.delete(SESSION_COOKIE)
}
