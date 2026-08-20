import { execFile } from 'node:child_process'
import { resolveYtdlp } from './binaries'
import { binaryMissing, classifyError } from './errors'
import type { MediaInfo, PlaylistInfo, Result } from '../../shared/types'
import {
  IMPERSONATE_ARGS,
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
): Promise<{ ok: true; stdout: string; impersonated: boolean } | { ok: false; stderr: string }> {
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
  if (plain.ok) return { ok: true, stdout: plain.stdout, impersonated: false }

  if (!looksBotBlocked(plain.stderr)) return { ok: false, stderr: plain.stderr }

  const retried = await attempt(IMPERSONATE_ARGS)
  if (retried.ok) return { ok: true, stdout: retried.stdout, impersonated: true }

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

export async function probe(url: string): Promise<Result<MediaInfo>> {
  const bin = await resolveYtdlp()
  if (!bin.found || !bin.path) return { ok: false, error: binaryMissing('yt-dlp') }

  const args = ['--ignore-config', '-J', '--no-warnings', '--no-playlist', url]

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
        formats: shapeFormats(info.formats ?? []),
        allFormats: listAllFormats(info.formats ?? []),
        // Carried through so the download uses the same route that made the
        // probe work — otherwise a site we just got past would refuse us again.
        impersonate: run.impersonated
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
