/**
 * Guards for playlist entries that have no URL of their own (src/main/engine/item.ts)
 * and for the X "no video in this post" classification.
 *
 * Run: node --experimental-strip-types scripts/test-items.ts
 *
 * No network. The live behaviour these encode was measured against real posts
 * with yt-dlp 2026.10.26 on 2026-11-22:
 *   - a 4-video X post comes back from `-J --flat-playlist` as a playlist whose
 *     entries carry `id` but no `url`, so shapePlaylist() used to drop them all;
 *   - `--playlist-items 3` on that post returns a one-entry playlist holding
 *     exactly the third video (same media id as flat entry #3);
 *   - X ignores `--no-playlist` for such a post;
 *   - a text-only or sensitive post fails with "No video could be found in this tweet".
 */
import { itemArgs, itemUrl, splitItem } from '../src/main/engine/item.ts'
import { buildDownloadArgs } from '../src/main/engine/args.ts'
import { classifyError } from '../src/main/engine/errors.ts'
import type { Settings } from '../src/shared/types.ts'

let failures = 0
function ok(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

const POST = 'https://x.com/someone/status/1577719286659006464'

// --- item.ts -----------------------------------------------------------------

const marked = itemUrl(POST, 3)
ok('itemUrl marks the post URL with the position', marked === `${POST}#tizo-item=3`)
ok('entries of one post get distinct URLs', itemUrl(POST, 1) !== itemUrl(POST, 2))
ok('itemUrl drops a fragment the post URL already had', itemUrl(`${POST}#m`, 2) === `${POST}#tizo-item=2`)

const split = splitItem(marked)
ok('splitItem gives yt-dlp the bare post URL', split.url === POST)
ok('splitItem recovers the position', split.item === 3)

const plain = splitItem(`${POST}?s=20`)
ok('a plain URL passes through untouched', plain.url === `${POST}?s=20` && plain.item === null)

const garbled = splitItem(`${POST}#tizo-item=abc`)
ok('a garbled marker is still stripped', garbled.url === POST && garbled.item === null)
ok('position 0 is not a position', splitItem(`${POST}#tizo-item=0`).item === null)

ok('itemArgs selects by position', itemArgs(3).join(' ') === '--yes-playlist --playlist-items 3')
ok('itemArgs adds nothing for a plain URL', itemArgs(null).length === 0)

// --- download args -----------------------------------------------------------

const BASE: Settings = {
  outputDir: 'C:\\out',
  maxSpeedKbps: null,
  folderPerDownload: false,
  geoBypass: false,
  onFileExists: 'skip-if-same',
  container: 'mp4',
  concurrentDownloads: 3,
  clipboardWatch: false,
  shareStats: false,
  audioBitrate: 192,
  embedThumbnail: true,
  embedMetadata: true,
  subtitleLangs: [],
  subtitleAuto: false,
  subtitleMode: 'embed',
  experimentalDiscovery: false
}
const args = (url: string, extra: Record<string, unknown> = {}): string[] =>
  buildDownloadArgs({ url, format: 'bv*+ba/b', outDir: 'C:\\out', needsFfmpeg: true, settings: BASE, ...extra })

const itemDl = args(marked)
ok('a marked download ends with the bare post URL', itemDl[itemDl.length - 1] === POST)
ok('a marked download never shows yt-dlp the marker', !itemDl.some((a) => a.includes('tizo-item')))
ok(
  'a marked download selects its entry',
  itemDl.includes('--playlist-items') && itemDl[itemDl.indexOf('--playlist-items') + 1] === '3'
)
ok('a marked download drops --no-playlist', !itemDl.includes('--no-playlist'))

const plainDl = args(POST)
ok('a plain download keeps --no-playlist', plainDl.includes('--no-playlist'))
ok('a plain download selects nothing', !plainDl.includes('--playlist-items'))

// The probe's JSON for a picked entry is already unwrapped to that one video,
// so replaying it must not apply the position a second time.
const replay = args(marked, { infoJson: 'C:\\tmp\\info.json' })
ok('replaying probe JSON does not re-select', !replay.includes('--playlist-items'))
ok('replaying probe JSON loads the file', replay[replay.length - 1] === '--load-info-json=C:\\tmp\\info.json')

// --- error classification ----------------------------------------------------

const none = classifyError('ERROR: [twitter] 1575199173472927762: No video could be found in this tweet', POST)
ok('"no video in this tweet" is NO_MEDIA', none.code === 'NO_MEDIA')
ok('NO_MEDIA mentions sensitive posts', /sensitive/i.test(none.message))
// NO_MEDIA must not be UNKNOWN/UNSUPPORTED_SITE: those two send the queue on to
// scan the page, and X's page is an app shell with nothing to find.
ok('NO_MEDIA does not trigger the page scan', none.code !== 'UNKNOWN' && none.code !== 'UNSUPPORTED_SITE')
ok(
  'a generic "no formats" error is left alone',
  classifyError('ERROR: [generic] x: No video formats found!').code !== 'NO_MEDIA'
)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1
