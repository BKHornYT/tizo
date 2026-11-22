import { execFile } from 'node:child_process'
import { resolveYtdlp } from './binaries'
import { binaryMissing, classifyError } from './errors'
import { profileFor } from './args'
import { itemArgs, itemUrl, splitItem } from './item'
import { cookieFileFor } from '../auth'
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
 * Runs `fn` with the `--cookies` flags for `url`'s site when the user is signed
 * in to it (src/main/auth), and deletes the temporary file afterwards. Reading a
 * page is where a login wall shows up (an X post marked sensitive, a private
 * Instagram), so the probe needs the session as much as the download does.
 */
async function withCookies<T>(url: string, fn: (extra: string[]) => Promise<T>): Promise<T> {
  const cookies = cookieFileFor(url)
  try {
    return await fn(cookies ? ['--cookies', cookies.path] : [])
  } finally {
    cookies?.cleanup()
  }
}

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
  // Already one entry picked out of a playlist. Asking again would hand back the
  // whole playlist, because the marker is stripped before yt-dlp sees the URL.
  if (splitItem(url).item) return { ok: true, value: null }

  const run = await withCookies(url, (cookies) =>
    runYtdlp(
      bin.path!,
      [
        '--ignore-config',
        '-J',
        '--flat-playlist',
        '--no-warnings',
        '--playlist-items',
        `1:${PLAYLIST_CAP}`,
        ...cookies,
        url
      ],
      120_000
    )
  )
  if (!run.ok) return { ok: false, error: classifyError(run.stderr, url) }

  return { ok: true, value: shapePlaylist(run.stdout, url) }
}

/** --flat-playlist -J output as a playlist of 2+ entries, else null. */
function shapePlaylist(stdout: string, url: string): PlaylistInfo | null {
  try {
    const raw = JSON.parse(stdout) as {
      _type?: string
      title?: string
      playlist_count?: number
      entries?: Array<{
        id?: string
        url?: string
        title?: string
        duration?: number | null
        playlist_index?: number | null
      }>
    }

    if (raw._type !== 'playlist' || !Array.isArray(raw.entries)) return null

    const entries = raw.entries
      // Position first: `--playlist-items` counts every entry yt-dlp listed,
      // including any the filter below drops.
      .map((e, i) => ({ e, position: e.playlist_index ?? i + 1 }))
      .filter(({ e }) => e.url || e.id)
      .map(({ e, position }) => ({
        id: e.id ?? e.url ?? '',
        // Inline entries (several videos in one post) have no address of their
        // own; give them the playlist's, marked with their position (item.ts).
        url: e.url ?? itemUrl(url, position),
        title: e.title ?? e.id ?? 'Untitled',
        duration: e.duration ?? null
      }))
      .filter((e) => e.url)

    // A "playlist" of one is just a video with extra steps.
    if (entries.length < 2) return null

    return { url, title: raw.title ?? 'Playlist', count: raw.playlist_count ?? entries.length, entries }
  } catch {
    return null
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
  const r = await probeRaw(url)
  return r.ok ? { ok: true, value: r.value.info } : r
}

/**
 * probe(), plus yt-dlp's own JSON as it came out. A caller that keeps the JSON can
 * hand it to the download (`DownloadRequest.infoJson`), which then skips a second
 * extraction of the page, and can read fields MediaInfo leaves out (description,
 * tags, upload date) without running yt-dlp again.
 */
export async function probeRaw(url: string): Promise<Result<{ info: MediaInfo; raw: string }>> {
  const bin = await resolveYtdlp()
  if (!bin.found || !bin.path) return { ok: false, error: binaryMissing('yt-dlp') }

  const target = await impersonationFor(url)
  const picked = splitItem(url)
  const run = await withCookies(url, (cookies) =>
    runYtdlp(
      bin.path!,
      [
        '--ignore-config',
        '-J',
        '--no-warnings',
        ...(picked.item ? itemArgs(picked.item) : ['--no-playlist']),
        ...(target ? ['--impersonate', target] : []),
        ...cookies,
        picked.url
      ],
      90_000
    )
  )
  if (!run.ok) return { ok: false, error: classifyError(run.stderr, url) }
  // A picked entry comes back as a playlist of one. Unwrap it, and keep the
  // unwrapped JSON as `raw` too: a download replaying it (`--load-info-json`)
  // needs the video itself, not a one-entry playlist.
  const stdout = picked.item ? unwrapSingle(run.stdout) : run.stdout
  if (stdout === null) {
    return {
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'That video is no longer in the post.', detail: run.stdout.slice(0, 2000) }
    }
  }
  const info = shapeInfo(stdout, url, run.impersonated, run.target)
  return info ? { ok: true, value: { info, raw: stdout } } : unreadable(stdout)
}

/**
 * The one entry of a `--playlist-items N` result, as JSON. Null when the
 * position matched nothing (the post was edited, or a video was deleted). A
 * result that is not a playlist at all is already the video and passes through.
 */
function unwrapSingle(stdout: string): string | null {
  try {
    const raw = JSON.parse(stdout) as { _type?: string; entries?: unknown[] }
    if (raw._type !== 'playlist') return stdout
    const entries = Array.isArray(raw.entries) ? raw.entries : []
    return entries.length === 1 ? JSON.stringify(entries[0]) : null
  } catch {
    return stdout
  }
}

function unreadable(stdout: string): { ok: false; error: { code: 'UNKNOWN'; message: string; detail: string } } {
  return {
    ok: false,
    error: { code: 'UNKNOWN', message: 'The site responded with something we could not read.', detail: stdout.slice(0, 2000) }
  }
}

/** yt-dlp's -J output as MediaInfo; null when unreadable, or (singleOnly) when it is a playlist. */
function shapeInfo(stdout: string, url: string, impersonated: boolean, target: string | null, singleOnly = false): MediaInfo | null {
  let info: RawInfo & { _type?: string }
  try {
    info = JSON.parse(stdout) as RawInfo & { _type?: string }
  } catch {
    return null
  }
  if (!info || typeof info !== 'object' || (singleOnly && info._type === 'playlist')) return null
  return {
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
    impersonate: impersonated,
    impersonateTarget: target
  }
}

/**
 * One yt-dlp run that answers both questions a pasted link raises: is it a
 * playlist/channel (its entries, flat), or a single video (its full info, as
 * probeRaw() would give it)? A single video under `--flat-playlist` is extracted
 * in full anyway, so inspectPlaylist() followed by probe() read the page twice.
 * `single` is null when the run worked but gave neither (a one-entry playlist,
 * an odd result): probe() it then.
 */
export async function inspectLink(
  url: string
): Promise<Result<{ playlist: PlaylistInfo | null; single: { info: MediaInfo; raw: string } | null }>> {
  // A watch?v=…&list=… link means that one video (see inspectPlaylist), and so
  // does an entry already picked out of a playlist (item.ts).
  if (/[?&]v=/.test(url) || splitItem(url).item) {
    const p = await probeRaw(url)
    return p.ok ? { ok: true, value: { playlist: null, single: p.value } } : p
  }
  const bin = await resolveYtdlp()
  if (!bin.found || !bin.path) return { ok: false, error: binaryMissing('yt-dlp') }
  const target = await impersonationFor(url)
  const run = await withCookies(url, (cookies) =>
    runYtdlp(
      bin.path!,
      [
        '--ignore-config',
        '-J',
        '--flat-playlist',
        '--no-warnings',
        '--playlist-items',
        `1:${PLAYLIST_CAP}`,
        ...(target ? ['--impersonate', target] : []),
        ...cookies,
        url
      ],
      120_000
    )
  )
  if (!run.ok) return { ok: false, error: classifyError(run.stderr, url) }
  const playlist = shapePlaylist(run.stdout, url)
  if (playlist) return { ok: true, value: { playlist, single: null } }
  const info = shapeInfo(run.stdout, url, run.impersonated, run.target, true)
  return { ok: true, value: { playlist: null, single: info ? { info, raw: run.stdout } : null } }
}
