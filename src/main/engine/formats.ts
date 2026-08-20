import type { FormatOption } from '../../shared/types.ts'

/**
 * Pure format shaping — turning yt-dlp's raw format list into the short list a
 * person picks from.
 *
 * Split out of probe.ts and importing nothing from electron so it can be tested
 * directly (scripts/test-formats.ts). The shaping rules are subtle enough to have
 * shipped a bug already, which is exactly the code worth being able to assert on.
 */

export interface RawFormat {
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

/**
 * Codec fields carry three distinct states, and conflating two of them was a bug:
 * a named codec, the string 'none' meaning the stream is genuinely absent, and
 * null/undefined meaning yt-dlp did not look. The Generic extractor returns the
 * third for plain files it finds on a page — a real, downloadable mp4 with
 * `vcodec: null`. Treating unknown as absent discarded exactly those.
 */
const absent = (codec: string | undefined): boolean => codec === 'none'
const unknown = (codec: string | undefined): boolean => codec === undefined || codec === null

const hasVideo = (f: RawFormat): boolean => !absent(f.vcodec) && !unknown(f.vcodec)
const hasAudio = (f: RawFormat): boolean => !absent(f.acodec) && !unknown(f.acodec)

/** A self-contained file: either both codecs present, or neither one stated. */
const isSelfContained = (f: RawFormat): boolean =>
  (hasVideo(f) && hasAudio(f)) || (unknown(f.vcodec) && unknown(f.acodec))

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
export function shapeFormats(raw: RawFormat[]): FormatOption[] {
  // Storyboards and other non-media entries state 'none' for both codecs.
  // Formats that state *neither* are kept: that is a plain file, not a non-media
  // entry, and dropping them lost every Generic-extractor result.
  const usable = raw.filter(
    (f) => f.protocol !== 'mhtml' && !(absent(f.vcodec) && absent(f.acodec))
  )

  const videoOnly = usable.filter((f) => hasVideo(f) && absent(f.acodec))
  const progressive = usable.filter(isSelfContained)
  const audioOnly = usable.filter((f) => absent(f.vcodec) && hasAudio(f))

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

  // No resolution anywhere, but there is something to download: a single plain
  // file, which is what the Generic extractor returns for a page with an mp4 on
  // it. Without this the list came back empty and the row had no download at
  // all, even though yt-dlp had already found the file.
  if (heights.length === 0 && usable.length > 0) {
    const best = [...usable].sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0))[0]!
    const stream = /\.(m3u8|mpd)(\?|$)/i.test(best.protocol ?? '') || best.protocol === 'm3u8_native'
    options.push({
      id: 'b',
      label: 'Original quality',
      kind: absent(best.vcodec) ? 'audio' : 'video',
      height: null,
      fps: null,
      ext: best.ext ?? 'mp4',
      filesize: sizeOf(best),
      needsFfmpeg: stream,
      note: 'The site offers one version — no quality choice available'
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
export function listAllFormats(raw: RawFormat[]): FormatOption[] {
  return raw
    .filter((f) => f.protocol !== 'mhtml' && !(absent(f.vcodec) && absent(f.acodec)))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0))
    .map((f) => {
      const videoOnly = hasVideo(f) && absent(f.acodec)
      const audioOnly = absent(f.vcodec) && hasAudio(f)
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
