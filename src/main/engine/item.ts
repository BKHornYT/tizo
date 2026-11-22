/**
 * Playlist entries that have no URL of their own.
 *
 * Most extractors list a playlist's entries as links (`url_result`), so each one
 * can be probed and downloaded by itself. Some return the entries *inline*
 * instead: a post holding several videos (X/Twitter is the first case found)
 * lists them as full info dicts with no `url`, and every one shares the post's
 * own address. Without a URL the queue had nothing to key the entry on, so
 * `shapePlaylist()` dropped them all and a four-video post never reached the
 * picker.
 *
 * The site's own "video N" links are no substitute. X numbers `/video/N` across
 * *all* media in the post, photos included, while the playlist lists only the
 * videos, so in a mixed post they disagree and the wrong clip downloads.
 * `--playlist-items N` counts exactly the entries yt-dlp listed, so that is
 * what selects one.
 *
 * The entry still needs a unique string, because selection, the picker and the
 * queue all key on `entry.url`. It gets the parent URL with a fragment marker.
 * The engine strips the marker before yt-dlp sees the URL and turns it into
 * `--playlist-items`. A fragment is never sent to a server, so a marked URL
 * that escapes somewhere (a log, the clipboard) still opens the right post.
 */

const MARK = '#tizo-item='

/** The entry's address: its playlist's URL, marked with its 1-based position. */
export function itemUrl(playlistUrl: string, position: number): string {
  return `${playlistUrl.split('#')[0]}${MARK}${position}`
}

/** Splits a URL into what yt-dlp should see and the playlist position, if marked. */
export function splitItem(url: string): { url: string; item: number | null } {
  const at = url.indexOf(MARK)
  if (at < 0) return { url, item: null }
  const n = Number(url.slice(at + MARK.length))
  // A garbled marker is still stripped. yt-dlp then gets the plain parent URL,
  // which beats handing it a fragment it would misread.
  return { url: url.slice(0, at), item: Number.isInteger(n) && n > 0 ? n : null }
}

/**
 * yt-dlp flags that select a marked entry; empty for a plain URL.
 *
 * `--no-playlist` must go when this is used. An extractor that honours it would
 * return its own idea of "the" video and ignore the position, while X ignores
 * it anyway.
 */
export function itemArgs(item: number | null): string[] {
  return item ? ['--yes-playlist', '--playlist-items', String(item)] : []
}
