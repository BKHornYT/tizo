import { execFile } from 'node:child_process'
import { resolveYtdlp } from './binaries'
import { binaryMissing, classifyError } from './errors'
import { profileFor } from './args'
import { loadManifest } from '../components/manifest'
import type { MediaInfo, PlaylistInfo, Result, SubtitleTrack } from '../../shared/types'
import {
  IMPERSONATE_ARGS,
  IMPERSONATE_TARGETS,
  rawFormatsOf,
  listAllFormats,
  looksBotBlocked,
  shapeFormats,
  type RawFormat
} from './formats'

/** Entries beyond this are ignored — a channel can hold tens of thousands. */
const PLAYLIST_CAP = 500

/**
 * Runs yt-dlp and, if the failure looks like a bot wall, runs it again with
 * browser impersonation.
 *
 * Retry rather than default: impersonation is slower and some sites behave worse
 * under it, so it is only worth paying for once the plain attempt has been
 * refused. Cloudflare in particular 403s the default client outright, and its
 * error names this exact flag as the fix.
 */
async function runYtdlp(
  exe: string,
  args: string[],
  timeout: number
): Promise<
  | { ok: true; stdout: string; impersonated: boolean; target: string | null }
  | { ok: false; stderr: string }
> {
  const attempt = (extra: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> =>
    new Promise((resolve) => {
      execFile(
        exe,
        [...args.slice(0, -1), ...extra, args[args.length - 1]!],
        { maxBuffer: 64 * 1024 * 1024, timeout, windowsHide: true },
        (err, stdout, stderr) => resolve({ ok: !err, stdout, stderr: stderr || String(err ?? '') })
      )
    })

  const plain = await attempt([])
  if (plain.ok) return { ok: true, stdout: plain.stdout, impersonated: false, target: null }

  if (!looksBotBlocked(plain.stderr)) return { ok: false, stderr: plain.stderr }

  const retried = await attempt(IMPERSONATE_ARGS)
  if (retried.ok) {
    return { ok: true, stdout: retried.stdout, impersonated: true, target: null }
  }

  /*
   * Second retry, with a real impersonation target.
   *
   * `--extractor-args generic:impersonate` speaks to the *generic* extractor
   * only, so a named extractor — including one from a plugin — never sees it and
   * 403s regardless. `--impersonate` applies to the requests themselves and gets
   * those through. Kept as a retry, and last: it is the slowest route, and this
   * only runs once a bot wall has already been detected.
   *
   * Discovered generically rather than by listing hosts in the registry, which
   * would publish which sites had been reported.
   */
  for (const target of IMPERSONATE_TARGETS) {
    const attempted = await attempt(['--impersonate', target])
    if (attempted.ok) {
      return { ok: true, stdout: attempted.stdout, impersonated: true, target }
    }
  }

  // Report the original failure: the retry's stderr is usually the same wall,
  // and the first message is the one that describes what actually went wrong.
  return { ok: false, stderr: plain.stderr }
}

interface RawInfo {
  id: string
  title?: string
  uploader?: string | null
  channel?: string | null
  duration?: number | null
  thumbnail?: string | null
  webpage_url?: string
  extractor_key?: string
  extractor?: string
  formats?: RawFormat[]
  /* Present instead of `formats` when an extractor returns a single URL. */
  url?: string
  format_id?: string
  ext?: string
  height?: number | null
  fps?: number | null
  vcodec?: string
  acodec?: string
  filesize?: number | null
  filesize_approx?: number | null
  tbr?: number | null
  protocol?: string
  /** lang -> tracks. yt-dlp keeps authored and machine captions in two maps. */
  subtitles?: Record<string, Array<{ name?: string; ext?: string }>>
  automatic_captions?: Record<string, Array<{ name?: string; ext?: string }>>
}

/** Cap on automatic captions offered. YouTube lists 100+ machine translations. */
const AUTO_CAPTION_CAP = 40

/**
 * Flattens yt-dlp's two caption maps into one list, authored tracks first.
 *
 * Kept apart by the `automatic` flag rather than merged, because auto-captions
 * are machine transcription and are regularly wrong in ways nobody would accept
 * if they believed they were getting authored subtitles.
 *
 * A language present in both appears once, as the authored track — offering the
 * machine version of a language that has a real one is never the better choice.
 */
function shapeSubtitles(info: RawInfo): SubtitleTrack[] {
  const out: SubtitleTrack[] = []
  const seen = new Set<string>()

  for (const [lang, tracks] of Object.entries(info.subtitles ?? {})) {
    if (!Array.isArray(tracks) || tracks.length === 0) continue
    // 'live_chat' is a chat replay, not a subtitle track, and it is enormous.
    if (lang === 'live_chat') continue
    seen.add(lang)
    out.push({ lang, name: tracks[0]?.name ?? lang, automatic: false })
  }

  const auto: SubtitleTrack[] = []
  for (const [lang, tracks] of Object.entries(info.automatic_captions ?? {})) {
    if (!Array.isArray(tracks) || tracks.length === 0) continue
    if (seen.has(lang)) continue
    auto.push({ lang, name: tracks[0]?.name ?? lang, automatic: true })
  }

  out.sort((a, b) => a.lang.localeCompare(b.lang))
  auto.sort((a, b) => a.lang.localeCompare(b.lang))
  return [...out, ...auto.slice(0, AUTO_CAPTION_CAP)]
}

/**
 * Detects whether a URL is a playlist or channel, and lists its entries cheaply
 * via `--flat-playlist` (metadata only, no per-video extraction).
 *
 * Resolves to null for single videos. A `watch?v=…&list=…` URL is treated as the
 * single video it names: someone pasting a link they were watching wants that
 * video, not the 400-item mix it happened to be playing inside.
 */
export async function inspectPlaylist(url: string): Promise<Result<PlaylistInfo | null>> {
  const bin = await resolveYtdlp()
  if (!bin.found || !bin.path) return { ok: false, error: binaryMissing('yt-dlp') }

  if (/[?&]v=/.test(url)) return { ok: true, value: null }

  const args = [
    '--ignore-config',
    '-J',
    '--flat-playlist',
    '--no-warnings',
    '--playlist-items',
    `1:${PLAYLIST_CAP}`,
    url
  ]

  const run = await runYtdlp(bin.path, args, 120_000)
  if (!run.ok) return { ok: false, error: classifyError(run.stderr, url) }

  try {
    const raw = JSON.parse(run.stdout) as {
      _type?: string
      title?: string
      playlist_count?: number
      entries?: Array<{ id?: string; url?: string; title?: string; duration?: number | null }>
    }

    if (raw._type !== 'playlist' || !Array.isArray(raw.entries)) return { ok: true, value: null }

    const entries = raw.entries
      .filter((e) => e.url || e.id)
      .map((e) => ({
        id: e.id ?? e.url ?? '',
        url: e.url ?? '',
        title: e.title ?? e.id ?? 'Untitled',
        duration: e.duration ?? null
      }))
      .filter((e) => e.url)

    // A "playlist" of one is just a video with extra steps.
    if (entries.length < 2) return { ok: true, value: null }

    return {
      ok: true,
      value: {
        url,
        title: raw.title ?? 'Playlist',
        count: raw.playlist_count ?? entries.length,
        entries
      }
    }
  } catch {
    return { ok: true, value: null }
  }
}

/**
 * Impersonation target for this host, from the registry.
 *
 * The probe used to ignore site profiles entirely — they were applied only at
 * download time. That held while every profile was tuning, but a host served by
 * an extractor plugin can sit behind a Cloudflare wall, and the probe would 403
 * before the plugin ever ran. The generic bot-wall retry does not help there:
 * `--extractor-args generic:impersonate` speaks to the *generic* extractor, and
 * a named one never sees it.
 */
async function impersonationFor(url: string): Promise<string | null> {
  try {
    const { manifest } = await loadManifest({ refresh: false })
    return profileFor(url, manifest.siteProfiles)?.impersonate ?? null
  } catch {
    return null
  }
}

export async function probe(url: string): Promise<Result<MediaInfo>> {
  const bin = await resolveYtdlp()
  if (!bin.found || !bin.path) return { ok: false, error: binaryMissing('yt-dlp') }

  const target = await impersonationFor(url)
  const args = [
    '--ignore-config',
    '-J',
    '--no-warnings',
    '--no-playlist',
    ...(target ? ['--impersonate', target] : []),
    url
  ]

  const run = await runYtdlp(bin.path, args, 90_000)
  if (!run.ok) return { ok: false, error: classifyError(run.stderr, url) }

  try {
    const info = JSON.parse(run.stdout) as RawInfo
    return {
      ok: true,
      value: {
        id: info.id,
        title: info.title ?? 'Untitled',
        uploader: info.uploader ?? info.channel ?? null,
        duration: info.duration ?? null,
        thumbnail: info.thumbnail ?? null,
        webpageUrl: info.webpage_url ?? url,
        extractor: info.extractor_key ?? info.extractor ?? 'unknown',
        formats: shapeFormats(rawFormatsOf(info)),
        allFormats: listAllFormats(rawFormatsOf(info)),
        subtitles: shapeSubtitles(info),
        // Carried through so the download uses the same route that made the
        // probe work — otherwise a site we just got past would refuse us again.
        impersonate: run.impersonated,
        impersonateTarget: run.target
      }
    }
  } catch {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN',
        message: 'The site responded with something we could not read.',
        detail: run.stdout.slice(0, 2000)
      }
    }
  }
}
