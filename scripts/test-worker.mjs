/**
 * Offline assertions on the stats Worker's delete routes.
 *
 * Runs the REAL server/worker.js — it is plain ESM with no Cloudflare imports,
 * so `env.DB` is the only thing that needs standing in for. Everything else the
 * worker uses (Response, URL, crypto.subtle, btoa/atob) is in Node already.
 *
 * The properties worth guarding, in order of how badly they would hurt:
 *
 *   1. `/admin/*` NEVER reaches the open site-counts handler. Any POST path
 *      that is not `/install` falls through to it, so an admin route that
 *      slipped past its own branch would be read as an upload — an authorised
 *      delete silently becoming an anonymous write.
 *   2. Deleting fails closed. No secrets, no session, an expired session, a
 *      forged signature, or an email off the allow list all delete nothing.
 *   3. `POST /sites` and `POST /install` stay open and unauthenticated. If a
 *      change here ever makes the app authenticate, the change is wrong.
 *   4. Bulk deletes demand the exact phrase. The tables hold sums, not
 *      submissions, so nothing can rebuild a wiped total.
 */
import vm from 'node:vm'
import worker from '../server/worker.js'

let passed = 0
let failed = 0

function check(name, ok) {
  if (ok) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}`)
  }
}

/* ---- a stand-in for D1 that records every statement it is handed ---- */

function fakeDb(sites = []) {
  const log = []
  const make = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => make(sql, a),
    run: async () => {
      log.push({ sql, args })
      return { meta: { changes: 1 } }
    },
    all: async () => {
      log.push({ sql, args })
      return { results: sites }
    },
    first: async () => {
      log.push({ sql, args })
      return { n: 0 }
    }
  })
  return {
    log,
    DB: {
      prepare: (sql) => make(sql),
      batch: async (stmts) => {
        for (const s of stmts) log.push({ sql: s.sql, args: s.args })
        return stmts.map(() => ({ meta: { changes: 2 } }))
      }
    }
  }
}

/* ---- forge a session cookie the way the worker signs one ---- */

const SECRET = 'test-session-secret'
const ORIGIN = 'https://tizo-stats.example.workers.dev'

function b64url(bytes) {
  let out = ''
  for (const b of bytes) out += String.fromCharCode(b)
  return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function session(email, { secret = SECRET, exp = Date.now() + 60_000 } = {}) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ email, exp })))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  return `tizo_session=${body}.${b64url(sig)}`
}

const SECRETS = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  SESSION_SECRET: SECRET,
  ALLOWED_EMAILS: 'ok@example.com, second@example.com'
}

/** Fires one request at the worker and hands back the response, body and SQL log. */
async function call(path, { method = 'POST', body, cookie, origin, accept, env } = {}) {
  const db = fakeDb([{ domain: 'example.com', downloads: 5 }])
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers.cookie = cookie
  if (origin) headers.origin = origin
  if (accept) headers.accept = accept
  const res = await worker.fetch(
    new Request(ORIGIN + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    { ...(env ?? SECRETS), DB: db.DB }
  )
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* the dashboard answers with HTML */
  }
  return { res, text, json, sql: db.log.map((e) => e.sql), log: db.log }
}

const wrote = (sql) => sql.some((q) => q.startsWith('INSERT'))
const deletes = (sql) => sql.filter((q) => q.startsWith('DELETE'))

console.log('\nstats worker — delete routes\n')

/* ---- 1. fails closed ---- */

{
  const good = await session('ok@example.com')

  const noSecrets = await call('/admin/delete', {
    body: { scope: 'sites', confirm: 'DELETE ALL' },
    cookie: good,
    env: {}
  })
  check('no secrets configured → 503', noSecrets.res.status === 503)
  check('no secrets configured → deletes nothing', deletes(noSecrets.sql).length === 0)

  const anon = await call('/admin/delete', { body: { scope: 'site', domain: 'example.com' } })
  check('no session → 401', anon.res.status === 401)
  check('no session → deletes nothing', deletes(anon.sql).length === 0)

  const forged = await call('/admin/delete', {
    body: { scope: 'site', domain: 'example.com' },
    cookie: await session('ok@example.com', { secret: 'wrong-secret' })
  })
  check('forged signature → 401', forged.res.status === 401)
  check('forged signature → deletes nothing', deletes(forged.sql).length === 0)

  const expired = await call('/admin/delete', {
    body: { scope: 'site', domain: 'example.com' },
    cookie: await session('ok@example.com', { exp: Date.now() - 1000 })
  })
  check('expired session → 401', expired.res.status === 401)

  const stranger = await call('/admin/delete', {
    body: { scope: 'site', domain: 'example.com' },
    cookie: await session('someone@example.com')
  })
  check('email off the allow list → 401', stranger.res.status === 401)
  check('email off the allow list → deletes nothing', deletes(stranger.sql).length === 0)

  const cross = await call('/admin/delete', {
    body: { scope: 'site', domain: 'example.com' },
    cookie: good,
    origin: 'https://evil.example'
  })
  check('cross-origin Origin → 403', cross.res.status === 403)
  check('cross-origin Origin → deletes nothing', deletes(cross.sql).length === 0)

  const sameOrigin = await call('/admin/delete', {
    body: { scope: 'site', domain: 'example.com' },
    cookie: good,
    origin: ORIGIN
  })
  check('same-origin Origin → allowed', sameOrigin.res.status === 200)

  const getAdmin = await call('/admin/delete', { method: 'GET', cookie: good })
  check('GET /admin/delete → 405', getAdmin.res.status === 405)

  const unknown = await call('/admin/wipe', { body: { scope: 'sites' }, cookie: good })
  check('unknown /admin/ path → 404', unknown.res.status === 404)
}

/* ---- 2. the fall-through regression ---- */

{
  const good = await session('ok@example.com')
  // A POST to any path that is not /install lands in the site-counts handler.
  // If an admin path ever reaches it, this payload gets counted instead.
  const shaped = { schema: 1, sites: { 'example.com': 3 } }

  for (const [name, opts] of [
    ['unauthenticated', { body: shaped }],
    ['authenticated', { body: shaped, cookie: good }],
    ['bad scope', { body: { ...shaped, scope: 'nonsense' }, cookie: good }]
  ]) {
    const r = await call('/admin/delete', opts)
    check(`/admin/delete (${name}) is never counted as an upload`, !wrote(r.sql))
  }

  const unknownPath = await call('/admin/wipe', { body: shaped, cookie: good })
  check('/admin/wipe is never counted as an upload', !wrote(unknownPath.sql))
}

/* ---- 3. the open routes stay open ---- */

{
  const sites = await call('/sites', { body: { schema: 1, sites: { 'example.com': 3 } } })
  check(
    'POST /sites still works with no session',
    sites.res.status === 200 && sites.json?.ok === true
  )
  check('POST /sites still writes', wrote(sites.sql))

  const install = await call('/install', {
    body: { schema: 1, app: '0.0.13', id: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' }
  })
  check(
    'POST /install still works with no session',
    install.res.status === 200 && install.json?.ok === true
  )
}

/* ---- 4. what the deletes actually run ---- */

{
  const good = await session('ok@example.com')

  const one = await call('/admin/delete', {
    body: { scope: 'site', domain: 'Example.COM' },
    cookie: good
  })
  check('delete one site → 200', one.res.status === 200)
  check(
    'delete one site → DELETE FROM site_counts WHERE domain = ?',
    deletes(one.sql).length === 1 && one.sql.includes('DELETE FROM site_counts WHERE domain = ?')
  )
  check('delete one site → domain lower-cased', one.log.at(-1)?.args?.[0] === 'example.com')
  check('delete one site → installs untouched', !one.sql.some((q) => q.includes('installs')))

  const bad = await call('/admin/delete', {
    body: { scope: 'site', domain: 'not a domain' },
    cookie: good
  })
  check('delete one site → bad domain rejected', bad.res.status === 400 && deletes(bad.sql).length === 0)

  const noConfirm = await call('/admin/delete', { body: { scope: 'sites' }, cookie: good })
  check('bulk without the phrase → 400', noConfirm.res.status === 400)
  check('bulk without the phrase → deletes nothing', deletes(noConfirm.sql).length === 0)

  const wrongConfirm = await call('/admin/delete', {
    body: { scope: 'sites', confirm: 'delete all' },
    cookie: good
  })
  check('bulk with the wrong phrase → 400', wrongConfirm.res.status === 400)
  check('bulk with the wrong phrase → deletes nothing', deletes(wrongConfirm.sql).length === 0)

  const allSites = await call('/admin/delete', {
    body: { scope: 'sites', confirm: 'DELETE ALL' },
    cookie: good
  })
  check(
    'scope sites → DELETE FROM site_counts only',
    allSites.res.status === 200 &&
      allSites.sql.includes('DELETE FROM site_counts') &&
      !allSites.sql.some((q) => q.includes('installs'))
  )

  const allInstalls = await call('/admin/delete', {
    body: { scope: 'installs', confirm: 'DELETE ALL' },
    cookie: good
  })
  check(
    'scope installs → DELETE FROM installs only',
    allInstalls.res.status === 200 &&
      allInstalls.sql.includes('DELETE FROM installs') &&
      !allInstalls.sql.some((q) => q.includes('site_counts'))
  )

  const everything = await call('/admin/delete', {
    body: { scope: 'all', confirm: 'DELETE ALL' },
    cookie: good
  })
  check(
    'scope all → both tables',
    everything.res.status === 200 &&
      everything.sql.includes('DELETE FROM site_counts') &&
      everything.sql.includes('DELETE FROM installs')
  )
  check('scope all → reports rows deleted', typeof everything.json?.deleted === 'number')

  const nonsense = await call('/admin/delete', {
    body: { scope: 'nonsense', confirm: 'DELETE ALL' },
    cookie: good
  })
  check('unknown scope → 400', nonsense.res.status === 400 && deletes(nonsense.sql).length === 0)

  const badJson = await worker.fetch(
    new Request(ORIGIN + '/admin/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: good },
      body: 'not json'
    }),
    { ...SECRETS, DB: fakeDb().DB }
  )
  check('bad json → 400', badJson.status === 400)
}

/* ---- 5. the dashboard still behaves, and now offers the controls ---- */

{
  const good = await session('ok@example.com')

  const anon = await call('/', { method: 'GET', accept: 'text/html' })
  check('GET without a session is still gated', anon.res.status === 401)

  const page = await call('/', { method: 'GET', accept: 'text/html', cookie: good })
  check('GET with a session → 200', page.res.status === 200)
  check('dashboard offers a per-row delete', page.text.includes('class="del"'))
  check('dashboard offers the bulk controls', page.text.includes('data-scope="all"'))
  check('dashboard posts to /admin/delete', page.text.includes('/admin/delete'))
  check('dashboard says installs come back', page.text.includes('reappears on its next ping'))

  // The controls live inside a template literal, so their own escapes are
  // interpreted once before the browser ever sees them. A single `\n` there
  // becomes a real newline mid-string and the whole page stops working, with
  // nothing on the server saying so. Compile it rather than trust it.
  const script = page.text.split('<script>')[1]?.split('</script>')[0] ?? ''
  let parses = false
  try {
    new vm.Script(script)
    parses = true
  } catch (e) {
    console.log(`       ${e.message}`)
  }
  check('dashboard script is valid JavaScript', parses)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
