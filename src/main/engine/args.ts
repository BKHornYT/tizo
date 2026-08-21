import type { AudioFormat, Settings } from '../../shared/types.ts'

export interface SiteTuning {
  impersonate?: string | null
  needsCookies?: boolean
  concurrentFragments?: number
}

export interface ArgContext {
  url: string
  /** A yt-dlp selector expression. */
  format: string
  outDir: string
  needsFfmpeg: boolean
  settings: Settings
  /** Per-site tuning from the registry, matched on hostname. */
  profile?: SiteTuning | undefined
  /** Directory holding a managed ffmpeg, when we own one. */
  ffmpegDir?: string | null
  /** Appended before the extension to dodge an existing file. */
  collisionSuffix?: string | undefined
  /** Page the media was embedded on; required by many CDNs. */
  referer?: string | undefined
  /** Site is behind a bot wall; impersonate a browser's TLS fingerprint. */
  impersonate?: boolean | undefined
  /** The specific target the probe needed, when the generic flag was not enough. */
  impersonateTarget?: string | null | undefined
  /** Set by an audio row: extract to this container instead of keeping video. */
  extractAudio?: AudioFormat | undefined
  /** Subtitle languages for this job. Empty or absent means none. */
  subLangs?: string[] | undefined
  /**
   * Extra request headers, captured from a player that was watched rather than
   * parsed. Replayed verbatim because these CDNs check them.
   */
  headers?: Record<string, string> | undefined
}

/** Lossless targets, where a bitrate setting is meaningless and must be omitted. */
const LOSSLESS: AudioFormat[] = ['flac', 'wav']

export const PROGRESS_MARK = '@@TIZO@@'
export const FILE_MARK = '@@TIZOFILE@@'

/** Matches a registry site profile to a URL by hostname, ignoring `www.`. */
export function profileFor(
  url: string,
  profiles: Record<string, SiteTuning>
): SiteTuning | undefined {
  let host: string
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return undefined
  }
  if (profiles[host]) return profiles[host]
  // Match a registry entry against subdomains too: m.youtube.com should pick up
  // the youtube.com profile rather than silently running untuned.
  const suffix = Object.keys(profiles).find((key) => host.endsWith(`.${key}`))
  return suffix ? profiles[suffix] : undefined
}

/**
 * Builds the full yt-dlp argument list.
 *
 * Kept pure and free of electron imports so scripts/test-args.ts can assert on
 * it directly — argument construction is exactly the kind of code that breaks
 * silently and is only noticed as "downloads stopped respecting my settings".
 */
export function buildDownloadArgs(ctx: ArgContext): string[] {
  const { settings, profile } = ctx

  const args = [
    // A stray user-level yt-dlp.conf could silently change output paths or
    // formats underneath us. Never inherit it.
    '--ignore-config',
    '--newline',
    '--no-colors',
    '--no-quiet',
    '--no-playlist',
    '--progress-template',
    `download:${PROGRESS_MARK}%(progress)j`,
    '--print',
    `after_move:${FILE_MARK}%(filepath)s`,
    '-f',
    ctx.format,
    '-P',
    ctx.outDir
  ]

  // 150 *bytes*, not characters — long unicode titles otherwise blow past
  // Windows' path limit once the folder is prepended.
  const stem = `%(title).150B [%(id)s]${ctx.collisionSuffix ?? ''}`
  args.push('-o', settings.folderPerDownload ? `%(title).100B [%(id)s]/${stem}.%(ext)s` : `${stem}.%(ext)s`)

  switch (settings.onFileExists) {
    case 'overwrite':
      args.push('--force-overwrites')
      break
    case 'rename':
      // The suffix already steers us clear; never clobber on top of it.
      args.push('--no-overwrites')
      break
    case 'skip-if-same':
    case 'ask':
      // 'ask' is resolved before we get here — by the time a job starts, the
      // user has chosen, and skipping is the safe residual behaviour.
      args.push('--no-overwrites')
      break
  }

  if (settings.maxSpeedKbps && settings.maxSpeedKbps > 0) {
    args.push('-r', `${settings.maxSpeedKbps}K`)
  }

  if (settings.geoBypass) args.push('--geo-bypass')

  // A direct CDN link scraped from a page is routinely 403'd without the page
  // it was embedded on.
  if (ctx.referer) args.push('--referer', ctx.referer)

  /*
   * Headers observed on the real request. `--referer` already covers Referer, so
   * it is skipped here rather than sent twice with possibly different values.
   * Newlines are stripped: a header value is a single line, and anything else is
   * either broken or an attempt to inject a second header.
   */
  for (const [name, value] of Object.entries(ctx.headers ?? {})) {
    if (name.toLowerCase() === 'referer') continue
    const clean = value.replace(/[\r\n]/g, '').trim()
    if (clean) args.push('--add-header', `${name}:${clean}`)
  }

  // A registry profile names a specific target; the probe's own finding is a
  // generic "this site needs it" and uses the generic extractor arg.
  // Most specific first: a registry target, then whatever the probe proved works,
  // then the generic flag. Anything else risks taking a different route to the
  // one that just succeeded.
  if (profile?.impersonate) args.push('--impersonate', profile.impersonate)
  else if (ctx.impersonateTarget) args.push('--impersonate', ctx.impersonateTarget)
  else if (ctx.impersonate) args.push('--extractor-args', 'generic:impersonate')
  if (profile?.concurrentFragments && profile.concurrentFragments > 1) {
    args.push('-N', String(profile.concurrentFragments))
  }

  /*
   * Audio extraction.
   *
   * `-x` runs a postprocessor, so every extraction row carries
   * `needsFfmpeg: true` — including the ones that only rewrap. Emitting these
   * flags on a row marked as *not* needing ffmpeg would break the same promise
   * as a `bv*+ba` selector does: the row claims to work without the HQ pack and
   * then hard-errors demanding it.
   */
  if (ctx.extractAudio) {
    args.push('-x')
    if (ctx.extractAudio !== 'best') args.push('--audio-format', ctx.extractAudio)
    // Meaningless for lossless targets; yt-dlp would carry it into the encoder.
    if (!LOSSLESS.includes(ctx.extractAudio)) {
      args.push('--audio-quality', `${settings.audioBitrate}K`)
    }
    if (settings.embedThumbnail) args.push('--embed-thumbnail')
  }

  /*
   * Subtitles are meaningless on an audio-only job, and `--embed-subs` against
   * an mp3 fails rather than being ignored — so they are skipped outright
   * rather than left for ffmpeg to reject.
   */
  const subLangs = ctx.extractAudio ? [] : (ctx.subLangs ?? [])
  if (subLangs.length > 0) {
    args.push('--sub-langs', subLangs.join(','))
    if (settings.subtitleAuto) args.push('--write-auto-subs')

    // 'embed' deliberately omits --write-subs: yt-dlp fetches to a temp file and
    // embeds, leaving no sidecar the user did not ask for.
    if (settings.subtitleMode === 'embed' || settings.subtitleMode === 'both') {
      args.push('--embed-subs')
    }
    if (settings.subtitleMode === 'file' || settings.subtitleMode === 'both') {
      args.push('--write-subs')
      // srt is the format every player reads; the site's native vtt/ttml is not.
      args.push('--convert-subs', 'srt')
    }
  }

  // Metadata needs a postprocessor too, so it follows the same rule: only on
  // jobs that already require ffmpeg.
  if (settings.embedMetadata && (ctx.needsFfmpeg || ctx.extractAudio)) {
    args.push('--embed-metadata')
  }

  if (ctx.needsFfmpeg || ctx.extractAudio) {
    // Not on an extraction job: there is no second stream to merge, and naming a
    // video container for an mp3 makes yt-dlp reject the combination.
    if (!ctx.extractAudio && settings.container !== 'original') {
      args.push('--merge-output-format', settings.container)
    }
    if (ctx.ffmpegDir) args.push('--ffmpeg-location', ctx.ffmpegDir)
  }

  args.push(ctx.url)
  return args
}
