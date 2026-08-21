/**
 * Deciding whether an observed request is downloadable media.
 *
 * Split out of browser.ts and importing nothing from electron, so it can be
 * asserted on directly. The first version of this enumerated content types and
 * found nothing on a page that was plainly playing video — exactly the kind of
 * quiet, too-narrow matcher that needs a test rather than a code review.
 */

const MEDIA_EXT = /\.(m3u8|mpd|mp4|webm|m4v|mov)(\?|$)/i

/**
 * Matched on a prefix rather than a fixed list. The first version enumerated
 * `video/mp4`, `video/webm` and friends and found nothing on YouTube, which
 * serves its media as `application/vnd.yt-ump` from a URL with no extension —
 * a good reminder that the content type is a vendor's choice, not a standard.
 */
const MEDIA_TYPE = /^(video|audio)\/|mpegurl|dash\+xml|vnd\.yt-ump|\bmp2t\b/i

const MANIFEST_TYPE = /mpegurl|dash\+xml/i

/**
 * A single chunk of a stream, not something anyone can play.
 *
 * These have to be excluded explicitly: they are unmistakably media by both URL
 * and content type, and a player fetches hundreds of them, so without this the
 * result is a list of fragments and the actual manifest is buried.
 */
const SEGMENT = /\.(ts|m4s|aac|m4a_segment)(\?|$)/i
const SEGMENT_TYPE = /\bmp2t\b/i

/** Ad and analytics hosts request media too, and would otherwise rank first. */
const JUNK =
  /(doubleclick|googlesyndication|googletagmanager|google-analytics|adservice|popads|propeller|exoclick|juicyads|trafficjunky|adnxs|scorecardresearch|hotjar)\./i

/**
 * Decides whether an observed request is downloadable media.
 *
 * Exported and pure so it can be asserted on without launching a browser. The
 * first version enumerated content types and found nothing on a page that was
 * plainly playing video, which is precisely the failure this needs a test for.
 */
export function classifyMedia(
  url: string,
  contentType: string | null
): { isManifest: boolean } | null {
  if (JUNK.test(url)) return null

  const isManifest = /\.(m3u8|mpd)(\?|$)/i.test(url) || MANIFEST_TYPE.test(contentType ?? '')
  // A manifest wins even if it looks segment-ish; every other fragment is
  // dropped, because a player fetches hundreds and none of them is the video.
  if (!isManifest && (SEGMENT.test(url) || SEGMENT_TYPE.test(contentType ?? ''))) return null

  const byExt = MEDIA_EXT.test(url)
  const byType = contentType !== null && MEDIA_TYPE.test(contentType)
  if (!byExt && !byType) return null

  return { isManifest }
}
