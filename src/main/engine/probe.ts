import { execFile } from 'node:child_process'
import { resolveYtdlp } from './binaries'
import { binaryMissing, classifyError } from './errors'
import type { FormatOption, MediaInfo, PlaylistInfo, Result } from '../../shared/types'

interface RawFormat {
  format_id: string
  ext?: string
  height?: number | null
  fps?: number | null
  vcodec?: string
  acodec?: string
  filesize?: number | null
  filesize_approx?: number | null
  tbr?: number | null
  abr?: number | null
  protocol?: string
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

const hasVideo = (f: RawFormat): boolean => Boolean(f.vcodec && f.vcodec !== 'none')
const hasAudio = (f: RawFormat): boolean => Boolean(f.acodec && f.acodec !== 'none')
const sizeOf = (f: RawFormat): number | null => f.filesize ?? f.filesize_approx ?? null

function humanHeight(h: number): string {
  if (h >= 4320) return '8K'
  if (h >= 2160) return '4K'
  if (h >= 1440) return '1440p'
  return `${h}p`
}

/**
 * Turns yt-dlp's raw format list (often 30+ entries of near-duplicates) into a
 * short list a person can actually choose from.
 *
 * Options are yt-dlp *selector expressions*, not raw format ids. Selectors let
 * yt-dlp re-resolve at download time, which survives the format list shifting
 * between probe and download — raw ids go stale and fail.
 */
function shapeFormats(raw: RawFormat[]): FormatOption[] {
  // Storyboards and other non-media entries carry neither codec.
  const usable = raw.filter(
    (f) => f.protocol !== 'mhtml' && (hasVideo(f) || hasAudio(f))
  )

  const videoOnly = usable.filter((f) => hasVideo(f) && !hasAudio(f))
  const progressive = usable.filter((f) => hasVideo(f) && hasAudio(f))
  const audioOnly = usable.filter((f) => !hasVideo(f) && hasAudio(f))

  const bestAudio = [...audioOnly].sort(
    (a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0)
  )[0]
  const bestAudioSize = bestAudio ? sizeOf(bestAudio) : null

  const heights = [
    ...new Set([...videoOnly, ...progressive].map((f) => f.height).filter((h): h is number => !!h))
  ].sort((a, b) => b - a)

  const options: FormatOption[] = []

  if (heights.length > 0) {
    options.push({
      id: 'bv*+ba/b',
      label: 'Best available',
      kind: 'video',
      height: heights[0] ?? null,
      fps: null,
      ext: 'mp4',
      filesize: null,
      needsFfmpeg: true,
      note: 'Highest quality video and audio, merged'
    })
  }

  for (const h of heights.slice(0, 8)) {
    const prog = progressive.filter((f) => f.height === h).sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0))[0]
    const vid = videoOnly.filter((f) => f.height === h).sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0))[0]

    // A progressive stream at this height already carries audio, so no muxing.
    // On YouTube exactly one such stream exists (360p), which is why almost
    // every meaningful quality needs the HQ pack.
    const needsFfmpeg = !prog
    const best = vid ?? prog
    if (!best) continue

    const size = needsFfmpeg
      ? sizeOf(best) !== null && bestAudioSize !== null
        ? sizeOf(best)! + bestAudioSize
        : null
      : sizeOf(prog!)

    options.push({
      // Critical: the no-ffmpeg rows must select a progressive stream *only*.
      // A `bv*+ba` selector always tries to merge, and yt-dlp hard-errors when
      // ffmpeg is absent rather than falling back down the `/` chain — so an
      // option labelled as not needing the HQ pack would still demand it.
      id: needsFfmpeg ? `bv*[height<=${h}]+ba/b[height<=${h}]` : `b[height<=${h}]`,
      label: humanHeight(h) + (best.fps && best.fps >= 50 ? ` ${Math.round(best.fps)}fps` : ''),
      kind: 'video',
      height: h,
      fps: best.fps ?? null,
      ext: best.ext ?? 'mp4',
      filesize: size,
      needsFfmpeg,
      ...(needsFfmpeg ? { note: 'Needs the HQ pack — video and audio arrive separately' } : {})
    })
  }

  if (bestAudio) {
    options.push({
      id: 'ba[ext=m4a]/ba/b',
      label: 'Audio only',
      kind: 'audio',
      height: null,
      fps: null,
      ext: bestAudio.ext ?? 'm4a',
      filesize: bestAudioSize,
      needsFfmpeg: false,
      note: 'Original audio, no conversion'
    })
  }

  return options
}

/**
 * Every usable format, one row each, for the "All formats" expander.
 *
 * Unlike the curated list these use raw format ids, which is the point — this
 * view exists for the person who wants one specific stream. Video-only rows get
 * `+ba` appended so they still arrive with sound.
 */
function listAllFormats(raw: RawFormat[]): FormatOption[] {
  return raw
    .filter((f) => f.protocol !== 'mhtml' && (hasVideo(f) || hasAudio(f)))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0))
    .map((f) => {
      const videoOnly = hasVideo(f) && !hasAudio(f)
      const audioOnly = !hasVideo(f) && hasAudio(f)
      const label = audioOnly
        ? `Audio ${f.abr ? `${Math.round(f.abr)}kbps` : ''}`.trim()
        : `${f.height ? humanHeight(f.height) : 'Video'}${f.fps && f.fps >= 50 ? ` ${Math.round(f.fps)}fps` : ''}`
      return {
        id: videoOnly ? `${f.format_id}+ba/${f.format_id}` : f.format_id,
        label: `${label} · ${f.format_id}`,
        kind: audioOnly ? ('audio' as const) : ('video' as const),
        height: f.height ?? null,
        fps: f.fps ?? null,
        ext: f.ext ?? 'mp4',
        filesize: sizeOf(f),
        needsFfmpeg: videoOnly,
        ...(f.vcodec && f.vcodec !== 'none' ? { note: `${f.vcodec}${hasAudio(f) ? ` + ${f.acodec}` : ''}` } : {})
      }
    })
}

/** Entries beyond this are ignored — a channel can hold tens of thousands. */
const PLAYLIST_CAP = 500

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

  return new Promise((resolve) => {
    execFile(
      bin.path!,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: 120_000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: classifyError(stderr || String(err), url) })
          return
        }
        try {
          const raw = JSON.parse(stdout) as {
            _type?: string
            title?: string
            playlist_count?: number
            entries?: Array<{ id?: string; url?: string; title?: string; duration?: number | null }>
          }
          if (raw._type !== 'playlist' || !Array.isArray(raw.entries)) {
            resolve({ ok: true, value: null })
            return
          }

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
          if (entries.length < 2) {
            resolve({ ok: true, value: null })
            return
          }

          resolve({
            ok: true,
            value: {
              url,
              title: raw.title ?? 'Playlist',
              count: raw.playlist_count ?? entries.length,
              entries
            }
          })
        } catch {
          resolve({ ok: true, value: null })
        }
      }
    )
  })
}

export async function probe(url: string): Promise<Result<MediaInfo>> {
  const bin = await resolveYtdlp()
  if (!bin.found || !bin.path) return { ok: false, error: binaryMissing('yt-dlp') }

  // Phase 1 handles single videos only; playlist expansion lands in Phase 4.
  const args = ['-J', '--no-warnings', '--no-playlist', url]

  return new Promise((resolve) => {
    execFile(
      bin.path!,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: 90_000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: classifyError(stderr || String(err), url) })
          return
        }
        try {
          const info = JSON.parse(stdout) as RawInfo
          resolve({
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
              allFormats: listAllFormats(info.formats ?? [])
            }
          })
        } catch {
          resolve({
            ok: false,
            error: {
              code: 'UNKNOWN',
              message: 'The site responded with something we could not read.',
              detail: stdout.slice(0, 2000)
            }
          })
        }
      }
    )
  })
}
