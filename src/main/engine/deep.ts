/**
 * Experimental discovery: follow a page's embedded player.
 *
 * Kept apart from the normal chain on purpose. This route costs extra requests,
 * can pick the wrong player, and depends on how a site happens to be built —
 * fine for a clearly-marked opt-in, wrong as silent default behaviour.
 *
 * Runs only after the extractor AND the page scan have both failed, so it never
 * slows down a download that was going to work anyway.
 */
import { probe } from './probe'
import { findEmbeds, type FoundEmbed } from './embeds'
import { fetchHtml } from './scrape'
import { sniffMedia } from './browser'
import type { FormatOption, MediaInfo, Result } from '../../shared/types'

/** Players tried before giving up. Sites list two or three; more is noise. */
const MAX_PLAYERS = 3

export interface DeepResult {
  info: MediaInfo
  /** The embed that worked — the download must target this, not the page. */
  embedUrl: string
  /** The page it was found on. Many hosts 403 without it as the referer. */
  sourcePage: string
  label: string | null
  /**
   * Set when the media was found by watching the player rather than by an
   * extractor. The download fetches this directly.
   */
  directUrl?: string
  /**
   * Headers the player actually sent. These can include a session cookie, so
   * they are returned to the main process only and never placed on a QueueItem,
   * which crosses to the renderer and into feedback payloads.
   */
  headers?: Record<string, string>
}

/**
 * Finds the players a page offers without downloading anything.
 *
 * Exported separately so the UI can say which ones exist before any of them is
 * tried — "Player 1, Player 2" is meaningful to someone looking at the site,
 * where a spinner is not.
 */
export async function listPlayers(pageUrl: string): Promise<FoundEmbed[]> {
  const html = await fetchHtml(pageUrl)
  if (html === null) return []
  return findEmbeds(html, pageUrl)
}

/**
 * Tries each player in the order the site listed them.
 *
 * Order matters: a site's first player is normally the one it prefers, and the
 * later ones are mirrors that are more often dead. The first that probes
 * successfully wins; the rest are not tried.
 */
export async function deepProbe(pageUrl: string): Promise<Result<DeepResult> | null> {
  const players = (await listPlayers(pageUrl)).slice(0, MAX_PLAYERS)
  if (players.length === 0) return null

  let lastError: Result<MediaInfo> | null = null

  for (const player of players) {
    // probe() already retries behind an impersonated client when a bot wall is
    // detected, which these hosts routinely sit behind.
    const result = await probe(player.url)
    if (result.ok) {
      return {
        ok: true,
        value: {
          info: result.value,
          embedUrl: player.url,
          sourcePage: pageUrl,
          label: player.label
        }
      }
    }
    lastError = result

    /*
     * The extractor could not read the player. Let it run and watch what it
     * fetches — this is the case the whole experimental route exists for: a
     * video.js instance with `preload: "none"` whose source is injected by a
     * script from another origin, where there is nothing in the HTML to find.
     */
    const sniffed = await sniffMedia(player.url, { referer: pageUrl })
    const best = sniffed[0]
    if (best) {
      const format: FormatOption = {
        id: 'b',
        label: best.isManifest ? 'Stream found by player' : 'File found by player',
        kind: 'video',
        height: null,
        fps: null,
        ext: best.isManifest ? 'mp4' : 'mp4',
        filesize: null,
        // A manifest is segmented and always has to be assembled.
        needsFfmpeg: best.isManifest,
        note: 'Found by running the page — experimental'
      }
      return {
        ok: true,
        value: {
          info: {
            id: 'sniffed',
            title: player.label ? `${player.label}` : 'Video',
            uploader: null,
            duration: null,
            thumbnail: null,
            webpageUrl: pageUrl,
            extractor: 'player watch',
            formats: [format],
            allFormats: [],
            subtitles: [],
            impersonate: false
          },
          embedUrl: player.url,
          sourcePage: pageUrl,
          label: player.label,
          directUrl: best.url,
          headers: best.headers
        }
      }
    }
  }

  // Every player failed. The last failure is returned rather than null so the
  // row can say the players were found but none of them worked — which is a
  // different problem from finding no player at all, and points somewhere else.
  return lastError && !lastError.ok ? { ok: false, error: lastError.error } : null
}
