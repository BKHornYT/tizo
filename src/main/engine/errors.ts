import type { EngineError, ErrorCode } from '../../shared/types'

/**
 * yt-dlp reports everything as free-text stderr, so classification is pattern
 * matching by necessity. Order matters — the first match wins, so the specific
 * patterns sit above the generic ones.
 */
const PATTERNS: Array<{ code: ErrorCode; test: RegExp; message: string }> = [
  {
    code: 'UNSUPPORTED_SITE',
    test: /unsupported url|no suitable extractor|is not a valid url.*extractor/i,
    message: 'This site is not supported yet.'
  },
  {
    /*
     * The extractor read the post fine and found no video in it. On X that is a
     * text or photo post, or one marked sensitive: X hides sensitive media from
     * signed-out visitors and reports the post as having none. Classified, not
     * left as UNKNOWN, because UNKNOWN sends the queue on to scan the page, and
     * X's page is an app shell with nothing to find.
     *
     * A link ending in `/video/N` takes a different branch in yt-dlp and says
     * "Video #N is unavailable" for the same hidden post (seen 2026-11-22 on a
     * sensitive post: no sign-in button appeared, only a generic failure). "Media
     * #N is not a video" is that branch landing on a photo.
     */
    code: 'NO_MEDIA',
    test: /no video could be found in this (tweet|post)|\[twitter\][^\n]*(video #\d+ is unavailable|media #\d+ is not a video)/i,
    message:
      'This post has no video we can see. If it is marked sensitive, X only shows it to signed-in accounts.'
  },
  {
    code: 'AUTH_REQUIRED',
    test: /sign in|login required|private video|members-only|requires authentication|use --cookies|account credentials/i,
    message: 'This video needs an account. Sign in to the site, and Tizo tries again.'
  },
  {
    code: 'AGE_RESTRICTED',
    test: /age[- ]restricted|confirm your age|inappropriate for some users/i,
    message: 'This video is age-restricted. Sign in to the site with an account that may watch it.'
  },
  {
    code: 'GEO_BLOCKED',
    test: /not available (from|in) your (country|location)|geo[- ]?restricted|geo blocked/i,
    message: 'This video is blocked in your region.'
  },
  {
    code: 'RATE_LIMITED',
    test: /http error 429|too many requests|rate[- ]limit/i,
    message: 'The site is rate-limiting us. Wait a few minutes and try again.'
  },
  {
    code: 'FFMPEG_REQUIRED',
    test: /ffmpeg (is )?not (installed|found)|you have requested merging|postprocessing.*ffmpeg/i,
    message: 'This quality has to be merged, which needs the HQ pack.'
  },
  {
    code: 'UNAVAILABLE',
    test: /video unavailable|this video (has been removed|is unavailable|is no longer)|content not found|http error 404|removed by the uploader/i,
    message: 'This video is gone — removed, or the link is wrong.'
  },
  {
    code: 'NETWORK',
    test: /unable to download (webpage|video data)|getaddrinfo|econnreset|etimedout|connection (refused|reset|aborted)|network is unreachable|temporary failure in name resolution/i,
    message: 'Could not reach the site. Check your connection and try again.'
  },
  {
    code: 'INVALID_URL',
    test: /is not a valid url|invalid url/i,
    message: "That does not look like a link."
  }
]

/** Best-effort hostname, used so the domain gate can offer a matching addon. */
function domainOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

export function classifyError(stderr: string, url?: string): EngineError {
  const text = stderr.trim()
  const tail = text.split('\n').slice(-12).join('\n')

  for (const { code, test, message } of PATTERNS) {
    if (test.test(text)) {
      return {
        code,
        message,
        detail: tail,
        ...(code === 'UNSUPPORTED_SITE' && url ? { domain: domainOf(url) } : {})
      }
    }
  }

  // Surface yt-dlp's own last ERROR line rather than a useless generic string —
  // it is usually the most informative thing available.
  const errorLine = text
    .split('\n')
    .reverse()
    .find((l) => /^\s*ERROR:/i.test(l))
    ?.replace(/^\s*ERROR:\s*/i, '')
    .trim()

  return {
    code: 'UNKNOWN',
    message: errorLine || 'The download failed for an unknown reason.',
    detail: tail,
    ...(url ? { domain: domainOf(url) } : {})
  }
}

export function binaryMissing(name: string): EngineError {
  return {
    code: 'BINARY_MISSING',
    message: `${name} is not installed yet. Run setup to download it.`
  }
}
