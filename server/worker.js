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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS }
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
<p class="sub">Public on purpose — data collected about users should not be private to whoever collects it.</p>
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
    { headers: { 'content-type': 'text/html; charset=utf-8', ...CORS } }
  )
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const path = new URL(request.url).pathname

    // Public totals, so the numbers this collects are not private to us.
    if (request.method === 'GET') {
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
        sites: sites.results ?? []
      }
      return wantsHtml ? html(data) : json(data)
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
