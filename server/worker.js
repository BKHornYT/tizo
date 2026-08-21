/**
 * Tizo usage endpoint — Cloudflare Worker.
 *
 * Accepts a domain-to-count tally and adds it to a running total. That is the
 * whole data model: there is no per-install row, no session, no identifier of
 * any kind, so there is nothing that could later be correlated back to a person
 * even if the database leaked.
 *
 * Deploy: see server/README.md
 */

const MAX_DOMAINS = 200
const MAX_COUNT = 100_000
// Conservative: letters, digits, dots and hyphens, ending in a TLD.
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type'
}

function json(data, status = 200, cors = true) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...(cors ? CORS : {}) }
  })
}

/** Minimal dashboard. No build step, no dependencies — it is one query. */
function html(data) {
  const rows = data.sites
    .map(
      (s, i) =>
        `<tr><td class="n">${i + 1}</td><td>${escapeHtml(s.domain)}</td><td class="v">${s.downloads.toLocaleString()}</td></tr>`
    )
    .join('')

  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Tizo usage</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:dark}
body{margin:0;padding:2.5rem 1.5rem;background:#1e2138;color:#e8e9f0;
  font:15px/1.5 'Segoe UI',system-ui,sans-serif}
main{max-width:44rem;margin:0 auto}
h1{margin:0 0 .25rem;font-size:1.35rem}
p.sub{margin:0 0 2rem;color:#9aa0bd;font-size:.85rem}
.cards{display:flex;gap:1rem;margin-bottom:2rem;flex-wrap:wrap}
.card{flex:1 1 10rem;background:#272b47;border-radius:.75rem;padding:1rem 1.25rem}
.card b{display:block;font-size:1.9rem;font-weight:600;letter-spacing:-.02em}
.card span{color:#9aa0bd;font-size:.8rem}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;
  color:#9aa0bd;padding:0 .6rem .5rem;font-weight:600}
td{padding:.55rem .6rem;border-top:1px solid #ffffff14}
td.n{color:#6f7595;width:2.5rem;font-variant-numeric:tabular-nums}
td.v{text-align:right;font-variant-numeric:tabular-nums;color:#b95ce4;font-weight:600}
footer{margin-top:2.5rem;color:#6f7595;font-size:.75rem;line-height:1.7}
code{background:#ffffff12;padding:.1rem .35rem;border-radius:.25rem}
</style>
<main>
<h1>Tizo usage</h1>
<p class="sub">Signed in as ${escapeHtml(data.email)} · <a href="/auth/logout">sign out</a></p>
<div class="cards">
  <div class="card"><b>${data.installs.toLocaleString()}</b><span>installations</span></div>
  <div class="card"><b>${data.downloads.toLocaleString()}</b><span>downloads counted</span></div>
  <div class="card"><b>${data.sites.length.toLocaleString()}</b><span>sites seen</span></div>
</div>
${rows ? `<table><tr><th></th><th>Site</th><th style="text-align:right">Downloads</th></tr>${rows}</table>` : '<p style="color:#9aa0bd">Nothing reported yet.</p>'}
<footer>
Two streams that share no key: site counts carry no identifier, and the install
ping carries no site data. Separate tables, no join, no IP logging — so these
numbers show <em>how many machines</em> and <em>which sites are popular</em>, and
cannot show what any one machine downloaded.<br>
Raw JSON: <code>?.json</code> or send <code>Accept: application/json</code>.
</footer>
</main>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i


/* ------------------------------------------------------------------ *
 * Google sign-in for the dashboard.
 *
 * Gates GET only. `POST /sites` and `POST /install` stay open and
 * unauthenticated on purpose — they are the app talking, and the app has no
 * account and must never have one. Putting a credential in the client would
 * mean shipping a shared secret in every copy AND giving the server a way to
 * tell submissions apart, which is exactly the linkability this design avoids.
 *
 * Sessions are a signed cookie, not a table. There is deliberately no session
 * store: adding one would put a timestamped record of the operator beside the
 * usage tables, and the point of this database is that it holds nothing
 * per-person.
 * ------------------------------------------------------------------ */

const SESSION_COOKIE = 'tizo_session'
const STATE_COOKIE = 'tizo_oauth_state'
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000

const enc = new TextEncoder()

function b64url(bytes) {
  let out = ''
  for (const b of bytes) out += String.fromCharCode(b)
  return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str) {
  const raw = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

/** Length-independent compare, so a signature cannot be guessed a byte at a time. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function signSession(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)))
  return body + '.' + b64url(await hmac(secret, body))
}

async function readSession(secret, token) {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  if (!safeEqual(token.slice(dot + 1), b64url(await hmac(secret, body)))) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

function cookie(request, name) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

function setCookie(name, value, maxAge) {
  return name + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge
}

/**
 * Returns null when sign-in is not configured. Callers must then FAIL CLOSED —
 * a missing secret has to mean "nobody sees the data", never "everybody does".
 */
function authConfig(env) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, ALLOWED_EMAILS } = env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET || !ALLOWED_EMAILS) return null
  const allowed = ALLOWED_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allowed.length === 0) return null
  return { id: GOOGLE_CLIENT_ID, secret: GOOGLE_CLIENT_SECRET, session: SESSION_SECRET, allowed }
}

function signInPage(message) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Tizo usage</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1e2138;
  color:#e8e9f0;font:15px/1.5 'Segoe UI',system-ui,sans-serif}
div{text-align:center;padding:2rem}
h1{margin:0 0 .4rem;font-size:1.35rem}
p{margin:0 auto 1.75rem;color:#9aa0bd;font-size:.85rem;max-width:22rem}
a{display:inline-block;background:#b95ce4;color:#fff;text-decoration:none;
  padding:.6rem 1.4rem;border-radius:.6rem;font-weight:600;font-size:.9rem}
</style>
<div>
<h1>Tizo usage</h1>
<p>${escapeHtml(message)}</p>
<a href="/auth/login">Sign in with Google</a>
</div>`,
    { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}

async function handleAuth(request, path, config) {
  const origin = new URL(request.url).origin
  const redirectUri = origin + '/auth/callback'

  if (path.endsWith('/auth/logout')) {
    return new Response(null, {
      status: 302,
      headers: { location: '/', 'set-cookie': setCookie(SESSION_COOKIE, '', 0) }
    })
  }

  if (path.endsWith('/auth/login')) {
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)))
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', config.id)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid email')
    url.searchParams.set('state', state)
    // A login, not ongoing access: no offline scope, so no refresh token is issued.
    url.searchParams.set('prompt', 'select_account')
    return new Response(null, {
      status: 302,
      headers: { location: url.toString(), 'set-cookie': setCookie(STATE_COOKIE, state, 600) }
    })
  }

  // /auth/callback
  const params = new URL(request.url).searchParams
  const state = params.get('state')
  const expected = cookie(request, STATE_COOKIE)
  // Rejecting a mismatched state is what stops a third party from walking
  // someone into a session they did not start.
  if (!state || !expected || !safeEqual(state, expected)) {
    return signInPage('That sign-in link expired or did not match. Try again.')
  }

  const code = params.get('code')
  if (!code) return signInPage('Google did not return a code. Try again.')

  const token = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.id,
      client_secret: config.secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })
  if (!token.ok) return signInPage('Google rejected the sign-in. Try again.')

  const body = await token.json()
  if (typeof body.id_token !== 'string') return signInPage('No identity returned. Try again.')

  /*
   * The id_token came straight from Google's token endpoint over TLS, in reply
   * to a request carrying our client secret — so verifying the signature adds
   * nothing on this path, and Google's own guidance says it can be skipped.
   * `aud` and `iss` are still checked, because they are free.
   */
  let claims
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(body.id_token.split('.')[1])))
  } catch {
    return signInPage('Could not read the identity Google returned.')
  }

  const issuerOk =
    claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  if (!issuerOk || claims.aud !== config.id || claims.email_verified !== true) {
    return signInPage('That Google account could not be verified.')
  }

  const email = String(claims.email ?? '').toLowerCase()
  if (!config.allowed.includes(email)) {
    // Name the rejected account: the usual cause is being signed in to the
    // wrong Google account, and a bare "denied" sends people in circles.
    return signInPage(email + ' is not on the allow list for this dashboard.')
  }

  const session = await signSession(config.session, { email, exp: Date.now() + SESSION_TTL })
  const headers = new Headers({ location: '/' })
  headers.append('set-cookie', setCookie(SESSION_COOKIE, session, SESSION_TTL / 1000))
  headers.append('set-cookie', setCookie(STATE_COOKIE, '', 0))
  return new Response(null, { status: 302, headers })
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const path = new URL(request.url).pathname

    const config = authConfig(env)

    if (path.includes('/auth/')) {
      if (!config) return json({ error: 'sign-in not configured' }, 503, false)
      return handleAuth(request, path, config)
    }

    if (request.method === 'GET') {
      // Fail closed. A missing secret means nobody sees the numbers — the
      // failure worth guarding against is a deploy that silently reverts to
      // public.
      if (!config) return json({ error: 'dashboard sign-in is not configured' }, 503, false)

      const session = await readSession(config.session, cookie(request, SESSION_COOKIE))
      // Re-checked against the allow list on every request, so removing someone
      // takes effect immediately rather than whenever their cookie expires.
      if (!session || !config.allowed.includes(String(session.email).toLowerCase())) {
        if (!(request.headers.get('accept') ?? '').includes('text/html')) {
          return json({ error: 'sign in required' }, 401, false)
        }
        return signInPage('These numbers are not public. Sign in to view them.')
      }

      // A browser gets a readable page; anything else gets the JSON. Same data
      // either way — the dashboard is just a rendering of the same query.
      const wantsHtml =
        !path.endsWith('.json') && (request.headers.get('accept') ?? '').includes('text/html')
      const [sites, installs, total] = await Promise.all([
        env.DB.prepare(
          'SELECT domain, downloads FROM site_counts ORDER BY downloads DESC LIMIT 500'
        ).all(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM installs').first(),
        env.DB.prepare('SELECT COALESCE(SUM(downloads), 0) AS n FROM site_counts').first()
      ])
      const data = {
        installs: installs?.n ?? 0,
        downloads: total?.n ?? 0,
        sites: sites.results ?? [],
        email: session.email
      }
      return wantsHtml ? html(data) : json(data, 200, false)
    }

    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    /**
     * Install ping. Carries an id and nothing else — no site data ever reaches
     * this table, which is what keeps the two streams unlinkable.
     */
    if (path.endsWith('/install')) {
      let ping
      try {
        ping = await request.json()
      } catch {
        return json({ error: 'bad json' }, 400)
      }
      if (ping?.schema !== 1 || typeof ping.id !== 'string' || !UUID_RE.test(ping.id)) {
        return json({ error: 'bad payload' }, 400)
      }
      const version = typeof ping.app === 'string' ? ping.app.slice(0, 32) : 'unknown'
      await env.DB.prepare(
        `INSERT INTO installs (id, app_version, first_seen, last_seen)
         VALUES (?, ?, unixepoch(), unixepoch())
         ON CONFLICT(id) DO UPDATE SET last_seen = unixepoch(), app_version = excluded.app_version`
      )
        .bind(ping.id, version)
        .run()
      return json({ ok: true })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'bad json' }, 400)
    }

    if (body?.schema !== 1 || typeof body.sites !== 'object' || body.sites === null) {
      return json({ error: 'bad payload' }, 400)
    }

    const entries = Object.entries(body.sites)
      .filter(
        ([domain, count]) =>
          typeof domain === 'string' &&
          domain.length <= 253 &&
          DOMAIN_RE.test(domain) &&
          Number.isInteger(count) &&
          count > 0 &&
          count <= MAX_COUNT
      )
      .slice(0, MAX_DOMAINS)

    if (entries.length === 0) return json({ ok: true, counted: 0 })

    // One statement per domain, batched into a single round trip.
    const statement = env.DB.prepare(
      `INSERT INTO site_counts (domain, downloads) VALUES (?, ?)
       ON CONFLICT(domain) DO UPDATE SET downloads = downloads + excluded.downloads`
    )
    await env.DB.batch(entries.map(([domain, count]) => statement.bind(domain, count)))

    return json({ ok: true, counted: entries.length })
  }
}
