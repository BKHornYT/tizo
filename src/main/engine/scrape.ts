import type { MediaInfo } from '../../shared/types'

/**
 * Last-resort media finder for pages yt-dlp has no extractor for.
 *
 * Does by hand what a person does with the inspector: fetch the page, look for
 * anything that smells like a media file, and offer it. It will never match a
 * real extractor for quality or reliability — it cannot understand tokens,
 * paged manifests or DRM — but for the very common case of a plain page with a
 * `<video>` tag it turns "not supported" into a working download.
 *
 * Only ever runs after yt-dlp has already failed.
 */

const MEDIA_EXT = /\.(mp4|webm|m4v|mov|mkv|m3u8|mpd|mp3|m4a|ogg|wav|flac)(\?[^"'\s]*)?$/i

/** Browser-ish, because a plain fetch is refused or served a stub by many sites. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'

import { fetchHtml } from './page'
// Re-exported so existing importers keep their path; the impersonating
// fallback lives in page.ts and is shared with the embed finder.
export { fetchHtml } from './page'

export interface MediaCandidate {
  url: string
  /** Where it was found — used to rank and to label. */
  source: 'video-tag' | 'source-tag' | 'og-meta' | 'json-ld' | 'inline'
  ext: string
  /** Filled in by the HEAD probe when the server is willing to say. */
  bytes: number | null
  contentType: string | null
}

function absolute(candidate: string, base: string): string | null {
  try {
    // Protocol-relative and root-relative URLs are extremely common in markup.
    return new URL(candidate, base).href
  } catch {
    return null
  }
}

function extOf(url: string): string {
  const match = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(url.split('?')[0] ?? url)
  return (match?.[1] ?? 'mp4').toLowerCase()
}

/**
 * Pulls candidates out of raw HTML with regex rather than a DOM parser.
 *
 * Deliberate: much of what we want lives inside inline `<script>` payloads and
 * JSON blobs, which a DOM parser would hand back as one opaque text node
 * anyway. Precision matters less here than reach — every candidate is verified
 * with a HEAD request before being shown.
 */
export function findCandidates(html: string, pageUrl: string): MediaCandidate[] {
  const found = new Map<string, MediaCandidate>()

  const add = (raw: string | undefined, source: MediaCandidate['source']): void => {
    if (!raw) return
    const url = absolute(raw.trim().replace(/&amp;/g, '&'), pageUrl)
    if (!url || !/^https?:/i.test(url)) return
    if (!MEDIA_EXT.test(url)) return
    if (found.has(url)) return
    found.set(url, { url, source, ext: extOf(url), bytes: null, contentType: null })
  }

  // <video src="…">
  for (const m of html.matchAll(/<video\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'video-tag')

  // <source src="…"> inside a video element
  for (const m of html.matchAll(/<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'source-tag')

  // Open Graph and Twitter player metadata
  for (const m of html.matchAll(
    /<meta\b[^>]*\b(?:property|name)\s*=\s*["'](?:og:video(?::url|:secure_url)?|twitter:player:stream)["'][^>]*\bcontent\s*=\s*["']([^"']+)["']/gi
  ))
    add(m[1], 'og-meta')

  // contentUrl inside JSON-LD or any embedded JSON
  for (const m of html.matchAll(/"contentUrl"\s*:\s*"([^"]+)"/gi)) add(m[1], 'json-ld')

  // Anything else that looks like a media file in inline scripts or attributes.
  for (const m of html.matchAll(/["'](https?:\/\/[^"'\s]+?\.(?:mp4|webm|m3u8|mpd|m4a|mp3)[^"'\s]*)["']/gi))
    add(m[1], 'inline')
  for (const m of html.matchAll(/["'](\/[^"'\s]+?\.(?:mp4|webm|m3u8|mpd|m4a|mp3)[^"'\s]*)["']/gi))
    add(m[1], 'inline')

  const rank: Record<MediaCandidate['source'], number> = {
    'video-tag': 0,
    'source-tag': 1,
    'og-meta': 2,
    'json-ld': 3,
    inline: 4
  }
  return [...found.values()].sort((a, b) => rank[a.source] - rank[b.source])
}

/**
 * Confirms a candidate is really media before offering it.
 *
 * Regex over HTML finds plenty of things that merely look like media URLs —
 * poster images, tracking pixels with .mp4 in a query string, dead CDN paths.
 * Offering one of those produces a download that fails for reasons the user
 * cannot act on, which is worse than an honest "not supported".
 */
async function verify(candidate: MediaCandidate, referer: string): Promise<MediaCandidate | null> {
  // Streaming manifests are text and cannot be content-type checked usefully;
  // yt-dlp handles them natively, so pass them through.
  if (/\.(m3u8|mpd)(\?|$)/i.test(candidate.url)) return candidate

  try {
    const response = await fetch(candidate.url, {
      method: 'HEAD',
      headers: { 'user-agent': UA, referer },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000)
    })
    if (!response.ok) return null

    const type = response.headers.get('content-type')
    if (type && !/^(video|audio|application\/octet-stream)/i.test(type)) return null

    const length = Number(response.headers.get('content-length'))
    // A "video" of a few KB is a placeholder or an error page.
    if (Number.isFinite(length) && length > 0 && length < 100_000) return null

    return {
      ...candidate,
      bytes: Number.isFinite(length) && length > 0 ? length : null,
      contentType: type
    }
  } catch {
    return null
  }
}

export interface ScrapeResult {
  info: MediaInfo
  /** The media URL to hand to yt-dlp instead of the page. */
  directUrl: string
  /** Many CDNs 403 without the page it was embedded on. */
  referer: string
}

function titleOf(html: string, url: string): string {
  const og = /<meta\b[^>]*\bproperty\s*=\s*["']og:title["'][^>]*\bcontent\s*=\s*["']([^"']+)["']/i.exec(html)
  const tag = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
  const raw = (og?.[1] ?? tag?.[1] ?? '').trim()
  if (raw) return raw.replace(/\s+/g, ' ').slice(0, 200)
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Video'
  }
}

export async function scrapePage(pageUrl: string): Promise<ScrapeResult | null> {
  const html = await fetchHtml(pageUrl)
  if (html === null) return null

  const candidates = findCandidates(html, pageUrl).slice(0, 8)
  if (candidates.length === 0) return null

  // Verified in order, stopping at the first that holds up — the ranking already
  // puts the most trustworthy sources first.
  let chosen: MediaCandidate | null = null
  for (const candidate of candidates) {
    chosen = await verify(candidate, pageUrl)
    if (chosen) break
  }
  if (!chosen) return null

  const label = /\.(m3u8|mpd)(\?|$)/i.test(chosen.url) ? 'Stream found on page' : 'File found on page'

  return {
    directUrl: chosen.url,
    referer: pageUrl,
    info: {
      id: 'scraped',
      title: titleOf(html, pageUrl),
      uploader: null,
      duration: null,
      thumbnail: null,
      webpageUrl: pageUrl,
      extractor: 'page scan',
      // A scan finds a media file, not a caption track — there is no metadata
      // here to enumerate subtitles from.
      subtitles: [],
      impersonateTarget: null,
      formats: [
        {
          id: 'b',
          label,
          kind: 'video',
          height: null,
          fps: null,
          ext: chosen.ext,
          filesize: chosen.bytes,
          needsFfmpeg: /\.(m3u8|mpd)(\?|$)/i.test(chosen.url),
          note: 'Found by scanning the page — quality options are not available'
        }
      ],
      allFormats: [],
      // The page fetch already used a browser user-agent; the download should
      // present the same way.
      impersonate: true
    }
  }
}
