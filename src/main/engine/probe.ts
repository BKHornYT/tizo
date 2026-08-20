import { execFile } from 'node:child_process'
import { resolveYtdlp } from './binaries'
import { binaryMissing, classifyError } from './errors'
import type { FormatOption, MediaInfo, Result } from '../../shared/types'

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

    // A progressive stream at this height already carries audio, so no muxing —
    // which is exactly why 720p works without the HQ pack and 1080p does not.
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
              formats: shapeFormats(info.formats ?? [])
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
