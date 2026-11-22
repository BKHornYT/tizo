/**
 * Pure helpers for signing in to sites: which site a URL belongs to, the sites
 * offered as one-click buttons, and turning a session's cookies into the
 * Netscape file yt-dlp reads with `--cookies`.
 *
 * Shared: the main process uses it to store and hand out sessions, the renderer
 * to label a failed row "Sign in to x.com". No electron imports, so
 * scripts/test-auth.ts runs it under plain Node.
 */

/** The cookie fields we keep. A subset of Electron's `Cookie`. */
export interface StoredCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  hostOnly: boolean
  /** Seconds since the epoch; absent for a session cookie. */
  expirationDate?: number
}

export interface KnownSite {
  site: string
  label: string
  /** Where the sign-in window opens. */
  loginUrl: string
  /**
   * Cookies that exist only once someone is signed in. Without them the window
   * was closed before signing in finished, and nothing is saved. Any one is
   * enough, because sites rename these from time to time.
   */
  markers: string[]
}

export const KNOWN_SITES: KnownSite[] = [
  { site: 'x.com', label: 'X (Twitter)', loginUrl: 'https://x.com/i/flow/login', markers: ['auth_token'] },
  {
    site: 'instagram.com',
    label: 'Instagram',
    loginUrl: 'https://www.instagram.com/accounts/login/',
    markers: ['sessionid']
  },
  { site: 'facebook.com', label: 'Facebook', loginUrl: 'https://www.facebook.com/login/', markers: ['c_user'] },
  {
    site: 'tiktok.com',
    label: 'TikTok',
    loginUrl: 'https://www.tiktok.com/login',
    markers: ['sessionid', 'sessionid_ss']
  },
  {
    site: 'youtube.com',
    label: 'YouTube',
    loginUrl: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F',
    markers: ['SAPISID', '__Secure-3PAPISID', '__Secure-3PSID']
  },
  {
    site: 'reddit.com',
    label: 'Reddit',
    loginUrl: 'https://www.reddit.com/login/',
    markers: ['reddit_session', 'token_v2']
  }
]

/** Hosts that are the same account as another site's. */
const ALIASES: Record<string, string> = {
  'twitter.com': 'x.com',
  'fb.com': 'facebook.com',
  'fb.watch': 'facebook.com',
  'youtu.be': 'youtube.com',
  'redd.it': 'reddit.com'
}

/** Second-level labels under a country code that are not a registrable name. */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'ac', 'gov', 'edu', 'ne', 'or'])

/**
 * The site a URL, or a host or address the user typed, belongs to: its
 * registrable domain, lower-cased, so `m.facebook.com` and `www.facebook.com`
 * are one sign-in. Null when it is not a web address at all.
 *
 * A heuristic rather than the full public-suffix list. A miss only means a
 * sign-in does not apply to an odd host, never that cookies go to the wrong
 * site, because the result must still equal a site the user signed in to.
 */
export function siteKeyOf(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  let host: string
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname
  } catch {
    return null
  }
  host = host.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return null

  const labels = host.split('.')
  const take =
    labels.length >= 3 && labels[labels.length - 1]!.length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]!)
      ? 3
      : 2
  const key = labels.slice(-take).join('.')
  return ALIASES[key] ?? key
}

/** The one-click entry for a site, if it is one. */
export function knownSite(site: string): KnownSite | undefined {
  return KNOWN_SITES.find((s) => s.site === site)
}

/** Where to open the sign-in window for a site. */
export function loginUrlFor(site: string): string {
  return knownSite(site)?.loginUrl ?? `https://${site}/`
}

/**
 * Did signing in finish? True or false for a known site; null for any other
 * site, where there is no way to tell from the outside.
 */
export function looksSignedIn(site: string, cookies: StoredCookie[]): boolean | null {
  const known = knownSite(site)
  if (!known) return null
  const now = Date.now() / 1000
  return cookies.some(
    (c) =>
      known.markers.includes(c.name) &&
      c.value !== '' &&
      (c.expirationDate === undefined || c.expirationDate > now)
  )
}

/** Drops expired cookies; a session cookie (no expiry) is kept. */
export function liveCookies(cookies: StoredCookie[], now = Date.now() / 1000): StoredCookie[] {
  return cookies.filter((c) => c.expirationDate === undefined || c.expirationDate > now)
}

/**
 * The Netscape cookie file yt-dlp reads with `--cookies`.
 *
 * A tab or newline inside a field would break the line format and could forge an
 * extra cookie line, so such a cookie is dropped rather than written. Session
 * cookies get expiry 0, which yt-dlp keeps (it loads the file ignoring discard
 * and expiry).
 */
export function toNetscape(cookies: StoredCookie[]): string {
  const lines = ['# Netscape HTTP Cookie File', '# Written by Video Downloader Tizo. Deleted after use.', '']
  for (const c of liveCookies(cookies)) {
    const fields = [c.domain, c.path, c.name, c.value]
    if (fields.some((f) => /[\t\r\n]/.test(f)) || !c.domain || !c.name) continue
    const domain = c.hostOnly ? c.domain.replace(/^\./, '') : c.domain.startsWith('.') ? c.domain : `.${c.domain}`
    lines.push(
      [
        c.httpOnly ? `#HttpOnly_${domain}` : domain,
        c.hostOnly ? 'FALSE' : 'TRUE',
        c.path || '/',
        c.secure ? 'TRUE' : 'FALSE',
        String(c.expirationDate ? Math.floor(c.expirationDate) : 0),
        c.name,
        c.value
      ].join('\t')
    )
  }
  return `${lines.join('\n')}\n`
}
