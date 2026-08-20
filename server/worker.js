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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const path = new URL(request.url).pathname

    // Public totals, so the numbers this collects are not private to us.
    if (request.method === 'GET') {
      const [sites, installs, total] = await Promise.all([
        env.DB.prepare(
          'SELECT domain, downloads FROM site_counts ORDER BY downloads DESC LIMIT 500'
        ).all(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM installs').first(),
        env.DB.prepare('SELECT COALESCE(SUM(downloads), 0) AS n FROM site_counts').first()
      ])
      return json({
        installs: installs?.n ?? 0,
        downloads: total?.n ?? 0,
        sites: sites.results ?? []
      })
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
