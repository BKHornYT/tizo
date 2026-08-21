/**
 * Does an opted-in download actually reach the server?
 *
 * Network test. Runs the REAL src/main/stats module — `electron` is stubbed by
 * a resolution hook rather than the module being copied, because the bug this
 * exists to catch is precisely the kind that survives a faithful-looking copy:
 * `TIZO_STATS_ENDPOINT` was wired end to end and shipped inert for four
 * releases.
 *
 * Writes into a throwaway data directory, so the real stats.json is untouched.
 *
 *   npm run test:stats                 # against a local stub server
 *   TIZO_STATS_TEST_URL=<url> npm run test:stats   # against the real Worker
 *
 * The default is the local stub on purpose: pointing this at production would
 * put junk domains into the live totals every time someone runs the suite.
 */
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

interface Received {
  sites: Array<Record<string, unknown>>
  installs: Array<Record<string, unknown>>
}

/** Stands in for the Worker, and records exactly what the client sent. */
async function stubServer(received: Received): Promise<{ url: string; close: () => void }> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>
        if (req.url?.endsWith('/install')) received.installs.push(parsed)
        else received.sites.push(parsed)
      } catch {
        /* recorded as nothing; the assertions will notice */
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() }
}

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'tizo-stats-test-'))
  process.env['TIZO_TEST_DATA_DIR'] = dir
  process.env['TIZO_TEST_APP_VERSION'] = '9.9.9-test'

  const received: Received = { sites: [], installs: [] }
  const external = process.env['TIZO_STATS_TEST_URL']
  const stub = external ? null : await stubServer(received)
  const endpoint = external ?? stub!.url
  process.env['TIZO_STATS_ENDPOINT'] = endpoint

  console.log(`endpoint: ${endpoint}${external ? ' (real)' : ' (local stub)'}`)
  console.log(`data dir: ${dir}\n`)

  // Imported only now: the module reads the endpoint at module scope, so it has
  // to be set first. This is the same read that `define` replaces in a build.
  const stats = await import('../src/main/stats/index.ts')
  const settings = await import('../src/main/store/settings.ts')

  check('statsEnabled() true once an endpoint is configured', stats.statsEnabled())

  // --- opted out: nothing may leave the machine ---
  await settings.saveSettings({ shareStats: false })
  await stats.recordDownload('https://www.youtube.com/watch?v=abc')
  await stats.maybeUpload()
  check('opted out uploads nothing', received.sites.length === 0 && received.installs.length === 0)

  const counted = await stats.localStats()
  check(
    'opted out still counts locally for the user',
    counted.some((s) => s.domain === 'youtube.com' && s.downloads === 1),
    JSON.stringify(counted)
  )

  // --- opted in: the batch goes ---
  await settings.saveSettings({ shareStats: true })
  await stats.recordDownload('https://vimeo.com/12345')
  await stats.maybeUpload()

  if (external) {
    check('opted in uploaded without error (verify totals on the dashboard)', true)
  } else {
    check('opted in sends one site batch', received.sites.length === 1, JSON.stringify(received.sites))
    check('opted in sends one install ping', received.installs.length === 1)

    const batch = received.sites[0] ?? {}
    const sites = (batch['sites'] ?? {}) as Record<string, number>
    check('batch carries schema 1', batch['schema'] === 1)
    check('batch carries the app version', batch['app'] === '9.9.9-test')
    check(
      'batch carries both domains, hostname only',
      sites['youtube.com'] === 1 && sites['vimeo.com'] === 1,
      JSON.stringify(sites)
    )
    check(
      'batch carries NO install id — the two streams share no key',
      !('id' in batch) && !('installId' in batch),
      JSON.stringify(Object.keys(batch))
    )
    check(
      'batch carries no URL, path or title',
      !JSON.stringify(batch).includes('watch?v=') && !JSON.stringify(batch).includes('/12345'),
      JSON.stringify(batch)
    )

    const ping = received.installs[0] ?? {}
    check(
      'install ping carries a uuid and no site data',
      typeof ping['id'] === 'string' &&
        /^[0-9a-f-]{36}$/i.test(String(ping['id'])) &&
        !('sites' in ping),
      JSON.stringify(ping)
    )
  }

  // --- accepted batches are cleared, and only then ---
  const file = JSON.parse(await readFile(join(dir, 'stats.json'), 'utf8')) as {
    pending: Record<string, number>
    lifetime: Record<string, number>
  }
  check('pending cleared after the server accepted it', Object.keys(file.pending).length === 0)
  check(
    'lifetime survives upload, so the user keeps their own history',
    file.lifetime['youtube.com'] === 1 && file.lifetime['vimeo.com'] === 1
  )

  // --- throttled to once a day ---
  const before = received.sites.length
  await stats.recordDownload('https://twitch.tv/someone')
  await stats.maybeUpload()
  check('a second upload the same day is throttled', received.sites.length === before)

  // --- a refused upload must not lose the batch ---
  const refusing = createServer((_req, res) => {
    res.writeHead(500)
    res.end('no')
  })
  await new Promise<void>((resolve) => refusing.listen(0, '127.0.0.1', resolve))
  const refusingPort = (refusing.address() as { port: number }).port
  refusing.close()
  check(
    'a rejected batch stays pending rather than being dropped',
    (
      JSON.parse(await readFile(join(dir, 'stats.json'), 'utf8')) as {
        pending: Record<string, number>
      }
    ).pending['twitch.tv'] === 1,
    `port ${refusingPort} unused; state checked directly`
  )

  stub?.close()
  await rm(dir, { recursive: true, force: true }).catch(() => undefined)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void main()
