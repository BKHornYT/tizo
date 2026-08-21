import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir, defaultDownloadDir } from '../paths'
import type {
  AudioBitrate,
  Container,
  FileExistsRule,
  Settings,
  SubtitleMode
} from '../../shared/types'
import { AUDIO_BITRATES } from '../../shared/types'

const FILE = 'settings.json'

const RULES: FileExistsRule[] = ['skip-if-same', 'rename', 'overwrite', 'ask']
const CONTAINERS: Container[] = ['mp4', 'mkv', 'original']
const SUB_MODES: SubtitleMode[] = ['embed', 'file', 'both']

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
    clipboardWatch: false,
    // Opt-in, never opt-out. Aggregate counts are low-risk, but silently
    // switched-on telemetry in a downloader costs trust the one time someone
    // notices — and it should be their call regardless.
    shareStats: false,

    // 192 rather than 320: the difference is inaudible to most people on most
    // equipment, and the file is a third smaller. Anyone who disagrees knows
    // enough to change it.
    audioBitrate: 192,
    embedThumbnail: true,
    embedMetadata: true,

    // Off by default. Subtitles are a deliberate choice, and fetching them for
    // everyone would add files most people did not ask for.
    subtitleLangs: [],
    subtitleAuto: false,
    subtitleMode: 'embed',

    experimentalDiscovery: false
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
    clipboardWatch:
      typeof r['clipboardWatch'] === 'boolean' ? r['clipboardWatch'] : base.clipboardWatch,
    shareStats: typeof r['shareStats'] === 'boolean' ? r['shareStats'] : base.shareStats,
    audioBitrate: AUDIO_BITRATES.includes(r['audioBitrate'] as AudioBitrate)
      ? (r['audioBitrate'] as AudioBitrate)
      : base.audioBitrate,
    embedThumbnail:
      typeof r['embedThumbnail'] === 'boolean' ? r['embedThumbnail'] : base.embedThumbnail,
    embedMetadata:
      typeof r['embedMetadata'] === 'boolean' ? r['embedMetadata'] : base.embedMetadata,
    // Codes go to the command line, so anything that is not a plain language
    // code is dropped rather than passed through.
    subtitleLangs: Array.isArray(r['subtitleLangs'])
      ? (r['subtitleLangs'] as unknown[])
          .filter((l): l is string => typeof l === 'string' && /^[a-zA-Z0-9-]{1,20}$/.test(l))
          .slice(0, 20)
      : base.subtitleLangs,
    subtitleAuto: typeof r['subtitleAuto'] === 'boolean' ? r['subtitleAuto'] : base.subtitleAuto,
    subtitleMode: SUB_MODES.includes(r['subtitleMode'] as SubtitleMode)
      ? (r['subtitleMode'] as SubtitleMode)
      : base.subtitleMode,
    experimentalDiscovery:
      typeof r['experimentalDiscovery'] === 'boolean'
        ? r['experimentalDiscovery']
        : base.experimentalDiscovery
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
