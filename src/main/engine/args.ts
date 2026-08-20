import type { Settings } from '../../shared/types.ts'

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
}

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

  // A registry profile names a specific target; the probe's own finding is a
  // generic "this site needs it" and uses the generic extractor arg.
  if (profile?.impersonate) args.push('--impersonate', profile.impersonate)
  else if (ctx.impersonate) args.push('--extractor-args', 'generic:impersonate')
  if (profile?.concurrentFragments && profile.concurrentFragments > 1) {
    args.push('-N', String(profile.concurrentFragments))
  }

  if (ctx.needsFfmpeg) {
    if (settings.container !== 'original') {
      args.push('--merge-output-format', settings.container)
    }
    if (ctx.ffmpegDir) args.push('--ffmpeg-location', ctx.ffmpegDir)
  }

  args.push(ctx.url)
  return args
}
