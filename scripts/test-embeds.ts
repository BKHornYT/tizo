/**
 * Asserts the click-to-load player finder.
 *
 * Run: node --experimental-strip-types scripts/test-embeds.ts
 *
 * The shapes here are modelled on real aggregator markup: the embed is escaped
 * inside a `data-*` attribute and no `<iframe>` element exists until the visitor
 * picks a player. Regex over the raw HTML correctly finds nothing, which is why
 * such sites were reported as unsupported when the URL was sitting right there.
 */
import { decodeEntities, findEmbeds } from '../src/main/engine/embeds.ts'
import { classifyMedia } from '../src/main/engine/media.ts'

let failures = 0
function ok(label: string, pass: boolean, detail = ''): void {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures++
}

const PAGE = 'https://aggregator.example/video/some-title/'

// --- Entity decoding -------------------------------------------------------
ok(
  'named and numeric entities both decode',
  decodeEntities('&lt;iframe src=&#34;https://h.example/e/abc&#34;&gt;') ===
    '<iframe src="https://h.example/e/abc">'
)
ok(
  '&amp; decodes last, so &amp;lt; does not become a tag',
  decodeEntities('&amp;lt;script&amp;gt;') === '&lt;script&gt;'
)

// --- The click-to-load case ------------------------------------------------
const clickToLoad = `
<div class="server-holder tabs-menu">
  <a class="js-server-embed server-link"
     data-embed="&lt;iframe width=&#34;882&#34; src=&#34;https://playerone.example/e/aaaa1111bbbb&#34;&gt;&lt;/iframe&gt;">
     <svg class="icon-play"><use xlink:href="#icon-play"></use></svg> <span>Player 1</span>
  </a>
  <a class="js-server-embed server-link"
     data-embed="&lt;iframe src=&#34;https://playertwo.example/e/cccc2222dddd/some-title&#34;&gt;&lt;/iframe&gt;">
     <svg class="icon-play"><use xlink:href="#icon-play"></use></svg> <span>Player 2</span>
  </a>
</div>
<div class="no-player embed-wrap"><span>Select a player above to start watching</span></div>`

const found = findEmbeds(clickToLoad, PAGE)
ok('both players are found', found.length === 2, String(found.length))
ok(
  'document order is kept, so the site’s own first choice stays first',
  found[0]?.url === 'https://playerone.example/e/aaaa1111bbbb' &&
    found[1]?.url === 'https://playertwo.example/e/cccc2222dddd/some-title',
  found.map((f) => f.url).join(' , ')
)
// The text sits after an <svg>, so tags are stripped rather than matched around.
ok(
  'the visible label is read past the icon',
  found[0]?.label === 'Player 1' && found[1]?.label === 'Player 2',
  found.map((f) => String(f.label)).join(' , ')
)

// --- Shapes that must still work ------------------------------------------
ok(
  'a real iframe is still found',
  findEmbeds('<iframe src="https://h.example/embed/abcd1234"></iframe>', PAGE)[0]?.url ===
    'https://h.example/embed/abcd1234'
)
ok(
  'a bare url in a data attribute is found',
  findEmbeds('<div data-src="//h.example/e/abcd1234"></div>', PAGE)[0]?.url ===
    'https://h.example/e/abcd1234'
)
ok(
  'protocol-relative urls are resolved',
  findEmbeds('<iframe src="//h.example/e/abcd1234">', PAGE)[0]?.url.startsWith('https://') === true
)
ok(
  'the same player listed twice appears once',
  findEmbeds(
    '<iframe src="https://h.example/e/abcd1234"><div data-embed="&lt;iframe src=&#34;https://h.example/e/abcd1234&#34;&gt;">',
    PAGE
  ).length === 1
)

// --- Things that are not the video ----------------------------------------
/*
 * Without this filter the first "embed" on a normal page is a consent frame or a
 * share button, and following it spends a page load to learn nothing. Worse, it
 * would outrank the real player, which is listed later in the document.
 */
const noise = `
<iframe src="https://www.google.com/recaptcha/api2/anchor?k=abc"></iframe>
<iframe src="https://www.facebook.com/plugins/like.php?href=x"></iframe>
<iframe src="https://platform.twitter.com/widgets/tweet_button.html"></iframe>
<iframe src="https://challenges.cloudflare.com/turnstile/v0/x/embed/abcd"></iframe>
<iframe src="https://realplayer.example/e/therealone"></iframe>`
const filtered = findEmbeds(noise, PAGE)
ok('widgets and consent frames are ignored', filtered.length === 1, String(filtered.length))
ok('the real player survives the filter', filtered[0]?.url === 'https://realplayer.example/e/therealone')

ok(
  'a link that is not an embed path is ignored',
  findEmbeds('<iframe src="https://h.example/about/contact"></iframe>', PAGE).length === 0
)
ok('a page with nothing returns nothing', findEmbeds('<p>no video here</p>', PAGE).length === 0)
ok('malformed markup does not throw', findEmbeds('<iframe src="::::">', PAGE).length === 0)

// --- Classifying what a watched player fetched ----------------------------
/*
 * The first version of this enumerated content types (`video/mp4`, `video/webm`
 * …) and returned nothing on a page that was visibly playing video: YouTube
 * serves media as `application/vnd.yt-ump` from a URL with no extension. A
 * matcher that is quietly too narrow looks exactly like a broken feature, so it
 * is asserted rather than reviewed.
 */
const media = (url: string, type: string | null = null): ReturnType<typeof classifyMedia> =>
  classifyMedia(url, type)

ok('an .mp4 url is media', media('https://cdn.example/v/file.mp4') !== null)
ok('an .m3u8 url is a manifest', media('https://cdn.example/hls/index.m3u8')?.isManifest === true)
ok('a .mpd url is a manifest', media('https://cdn.example/dash/manifest.mpd')?.isManifest === true)
ok(
  'a signed manifest with query args is still a manifest',
  media('https://cdn.example/hls/index.m3u8?t=abc&s=def')?.isManifest === true
)
ok(
  'an extensionless url is media when the content type says so',
  media('https://cdn.example/videoplayback?id=abc', 'video/mp4') !== null
)
ok(
  "YouTube's vendor content type counts as media",
  media('https://rr1.googlevideo.com/videoplayback?id=abc', 'application/vnd.yt-ump') !== null
)
ok(
  'a manifest is recognised by content type alone',
  media('https://cdn.example/stream?id=1', 'application/vnd.apple.mpegurl')?.isManifest === true
)

/*
 * Segments must be dropped. A player fetches hundreds of them and not one is the
 * video, so listing them buries the manifest that actually is.
 */
ok('an HLS segment is not offered', media('https://cdn.example/hls/seg-01.ts') === null)
ok('a DASH segment is not offered', media('https://cdn.example/dash/chunk-1.m4s') === null)
ok(
  'a segment is dropped on content type too',
  media('https://cdn.example/x?seg=1', 'video/mp2t') === null
)

ok('a page is not media', media('https://example.com/watch', 'text/html') === null)
ok('a script is not media', media('https://cdn.example/player.js', 'application/javascript') === null)
ok('an image is not media', media('https://cdn.example/poster.jpg', 'image/jpeg') === null)
ok(
  'an ad network is ignored even when it serves video',
  media('https://ads.doubleclick.net/spot.mp4', 'video/mp4') === null
)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
// Set the code rather than calling process.exit(): forcing an exit while the
// type-stripping loader still has async handles open trips a libuv assertion on
// Windows, which fails CI even when every check passed.
process.exitCode = failures === 0 ? 0 : 1
