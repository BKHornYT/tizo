import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir, defaultDownloadDir } from '../paths'
import type { Container, FileExistsRule, Settings } from '../../shared/types'

const FILE = 'settings.json'

const RULES: FileExistsRule[] = ['skip-if-same', 'rename', 'overwrite', 'ask']
const CONTAINERS: Container[] = ['mp4', 'mkv', 'original']

function defaults(): Settings {
  return {
    outputDir: defaultDownloadDir(),
    maxSpeedKbps: null,
    folderPerDownload: false,
    geoBypass: false,
    // Not 'ask': prompting on every collision punishes batch downloads, which
    // is precisely when collisions happen. See docs/features.md.
    onFileExists: 'skip-if-same',
    container: 'mp4',
    concurrentDownloads: 3,
    clipboardWatch: false
  }
}

/**
 * Validates field by field rather than trusting the file. settings.json sits in
 * a user-writable folder and survives upgrades, so it will eventually contain
 * something hand-edited, half-written, or written by an older version.
 */
function coerce(raw: unknown): Settings {
  const base = defaults()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>

  const num = (v: unknown, min: number, max: number, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback

  return {
    outputDir: typeof r['outputDir'] === 'string' && r['outputDir'] ? r['outputDir'] : base.outputDir,
    maxSpeedKbps:
      r['maxSpeedKbps'] === null || r['maxSpeedKbps'] === undefined
        ? null
        : num(r['maxSpeedKbps'], 1, 1_000_000, 0) || null,
    folderPerDownload: typeof r['folderPerDownload'] === 'boolean' ? r['folderPerDownload'] : base.folderPerDownload,
    geoBypass: typeof r['geoBypass'] === 'boolean' ? r['geoBypass'] : base.geoBypass,
    onFileExists: RULES.includes(r['onFileExists'] as FileExistsRule)
      ? (r['onFileExists'] as FileExistsRule)
      : base.onFileExists,
    container: CONTAINERS.includes(r['container'] as Container)
      ? (r['container'] as Container)
      : base.container,
    concurrentDownloads: num(r['concurrentDownloads'], 1, 10, base.concurrentDownloads),
    clipboardWatch: typeof r['clipboardWatch'] === 'boolean' ? r['clipboardWatch'] : base.clipboardWatch
  }
}

let cache: Settings | null = null

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache
  try {
    cache = coerce(JSON.parse(await readFile(join(dataDir(), FILE), 'utf8')))
  } catch {
    cache = defaults()
  }
  return cache
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings()
  const next = coerce({ ...current, ...patch })
  cache = next
  await mkdir(dataDir(), { recursive: true })
  await writeFile(join(dataDir(), FILE), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export async function resetSettings(): Promise<Settings> {
  cache = defaults()
  await mkdir(dataDir(), { recursive: true })
  await writeFile(join(dataDir(), FILE), JSON.stringify(cache, null, 2), 'utf8')
  return cache
}
