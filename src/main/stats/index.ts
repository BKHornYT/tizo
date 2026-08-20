import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir } from '../paths'
import { loadSettings } from '../store/settings'
import type { SiteStat } from '../../shared/types'

/**
 * Site usage counting.
 *
 * Two separate tallies live here:
 *  - `lifetime` never leaves the machine and exists so the user can see their
 *    own history in Settings. It is kept whether or not sharing is on.
 *  - `pending` is the batch queued for upload, cleared once accepted.
 *
 * Two upload streams that share no key:
 *  - `/sites` carries `{domain: count}` and the app version. No identifier.
 *  - `/install` carries a random install id and the app version. No site data.
 *
 * Kept apart on purpose. A single stream with both would be a per-machine
 * record of which sites someone downloads from — which for a video downloader
 * is exactly the thing not to build. Split like this the server can answer
 * "how many machines" and "how many downloads per site", and cannot answer
 * "what does this machine download".
 */

const FILE = 'stats.json'
const DAY = 24 * 60 * 60 * 1000

const ENDPOINT = process.env['TIZO_STATS_ENDPOINT'] ?? ''

interface StatsFile {
  lifetime: Record<string, number>
  pending: Record<string, number>
  lastUpload: number | null
  /**
   * Random per-install id, used ONLY for the install ping — never sent
   * alongside site counts. Keeping the two streams keyless to each other is
   * what lets us count machines without building a record of which sites any
   * particular machine downloads from.
   */
  installId: string | null
  lastPing: number | null
}

const EMPTY: StatsFile = {
  lifetime: {},
  pending: {},
  lastUpload: null,
  installId: null,
  lastPing: null
}

let cache: StatsFile | null = null

async function load(): Promise<StatsFile> {
  if (cache) return cache
  try {
    const raw = JSON.parse(await readFile(join(dataDir(), FILE), 'utf8')) as Partial<StatsFile>
    cache = {
      lifetime: raw.lifetime ?? {},
      pending: raw.pending ?? {},
      lastUpload: raw.lastUpload ?? null,
      installId: raw.installId ?? null,
      lastPing: raw.lastPing ?? null
    }
  } catch {
    cache = { ...EMPTY, lifetime: {}, pending: {} }
  }
  return cache
}

async function save(): Promise<void> {
  if (!cache) return
  await mkdir(dataDir(), { recursive: true }).catch(() => undefined)
  await writeFile(join(dataDir(), FILE), JSON.stringify(cache), 'utf8').catch(() => undefined)
}

function hostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    // A bare IP or a localhost URL is someone's own server, not a public site —
    // counting it would leak something about them and tell us nothing.
    if (!host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
    return host
  } catch {
    return null
  }
}

/** Called once per successfully completed download. */
export async function recordDownload(url: string): Promise<void> {
  const host = hostOf(url)
  if (!host) return
  const stats = await load()
  stats.lifetime[host] = (stats.lifetime[host] ?? 0) + 1
  stats.pending[host] = (stats.pending[host] ?? 0) + 1
  await save()
}

export async function localStats(): Promise<SiteStat[]> {
  const stats = await load()
  return Object.entries(stats.lifetime)
    .map(([domain, downloads]) => ({ domain, downloads }))
    .sort((a, b) => b.downloads - a.downloads)
}

/**
 * Clears the local history. The install id survives deliberately: regenerating
 * it would report this machine as a brand new one and inflate the install
 * count, which is the opposite of what clearing data should achieve.
 */
export async function clearStats(): Promise<void> {
  const current = await load()
  cache = {
    lifetime: {},
    pending: {},
    lastUpload: null,
    installId: current.installId,
    lastPing: current.lastPing
  }
  await save()
}

/** Exactly what an upload would contain, for the Settings preview. */
export async function pendingPayload(): Promise<{ app: string; sites: Record<string, number> }> {
  const stats = await load()
  return { app: app.getVersion(), sites: { ...stats.pending } }
}

/**
 * Counts this machine once, then keeps it marked active daily.
 *
 * Sent to a different route than the site counts and carrying nothing but the
 * id and version — so the server can total up machines without ever being able
 * to attribute a download to one.
 */
async function pingInstall(): Promise<void> {
  const stats = await load()
  if (stats.lastPing && Date.now() - stats.lastPing < DAY) return

  if (!stats.installId) {
    stats.installId = randomUUID()
    await save()
  }

  try {
    const response = await fetch(`${ENDPOINT}/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schema: 1, id: stats.installId, app: app.getVersion() }),
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) return
    stats.lastPing = Date.now()
    await save()
  } catch {
    /* never let telemetry surface as an error to the user */
  }
}

/**
 * Uploads at most once a day, and only when the user has opted in.
 *
 * Failures are silent and non-destructive: `pending` is only cleared once the
 * server has accepted the batch, so a flaky connection loses nothing, and no
 * amount of telemetry trouble is allowed to affect downloading.
 */
export async function maybeUpload(): Promise<void> {
  if (!ENDPOINT) return

  const settings = await loadSettings()
  if (!settings.shareStats) return

  await pingInstall()

  const stats = await load()
  if (stats.lastUpload && Date.now() - stats.lastUpload < DAY) return
  if (Object.keys(stats.pending).length === 0) return

  try {
    const response = await fetch(`${ENDPOINT}/sites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schema: 1, app: app.getVersion(), sites: stats.pending }),
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) return
    stats.pending = {}
    stats.lastUpload = Date.now()
    await save()
  } catch {
    /* never let telemetry surface as an error to the user */
  }
}

export function statsEnabled(): boolean {
  return ENDPOINT.length > 0
}
