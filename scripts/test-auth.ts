/**
 * Guards for signing in to sites: which site a link belongs to, the cookie file
 * handed to yt-dlp, the `--cookies` flag, and that no session can ride along
 * in a feedback report.
 *
 * Run: npm run test:auth
 * (node --experimental-strip-types scripts/test-auth.ts)
 *
 * No network. The sign-in window and the encrypted store need a real Electron
 * and are checked by hand (see docs/site-support.md).
 */
import {
  KNOWN_SITES,
  liveCookies,
  loginUrlFor,
  looksSignedIn,
  siteKeyOf,
  toNetscape,
  type StoredCookie
} from '../src/shared/sites.ts'
import { buildDownloadArgs } from '../src/main/engine/args.ts'
import { sanitise } from '../src/main/sanitise.ts'
import type { Settings } from '../src/shared/types.ts'

let failures = 0
function ok(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

// --- which site a link belongs to -------------------------------------------

ok('x.com post', siteKeyOf('https://x.com/a/status/1') === 'x.com')
ok('twitter.com is the same account as x.com', siteKeyOf('https://twitter.com/a/status/1') === 'x.com')
ok('mobile and www collapse to one site', siteKeyOf('https://m.facebook.com/x') === 'facebook.com')
ok('www is ignored', siteKeyOf('https://www.instagram.com/p/x/') === 'instagram.com')
ok('youtu.be is YouTube', siteKeyOf('https://youtu.be/abc') === 'youtube.com')
ok('a typed bare host works', siteKeyOf('Example.COM') === 'example.com')
ok('a country second level keeps three labels', siteKeyOf('https://www.bbc.co.uk/x') === 'bbc.co.uk')
ok('a marked playlist entry still maps to its site', siteKeyOf('https://x.com/a/status/1#tizo-item=2') === 'x.com')
ok('an IP address is not a site', siteKeyOf('http://192.168.1.10/x') === null)
ok('a single label is not a site', siteKeyOf('localhost') === null)
ok('garbage is not a site', siteKeyOf('not a url at all') === null)
// A look-alike must never borrow a real site's session.
ok('x.com.evil.example is not x.com', siteKeyOf('https://x.com.evil.example/') === 'evil.example')
ok('evilx.com is not x.com', siteKeyOf('https://evilx.com/') === 'evilx.com')

ok('every one-click site maps to itself', KNOWN_SITES.every((k) => siteKeyOf(k.site) === k.site))
ok('every one-click login page is https', KNOWN_SITES.every((k) => k.loginUrl.startsWith('https://')))
ok('an unknown site opens its home page', loginUrlFor('example.com') === 'https://example.com/')

// --- did signing in finish? -------------------------------------------------

const c = (name: string, extra: Partial<StoredCookie> = {}): StoredCookie => ({
  name,
  value: 'v',
  domain: '.x.com',
  path: '/',
  secure: true,
  httpOnly: true,
  hostOnly: false,
  ...extra
})
const future = Date.now() / 1000 + 86_400
const past = Date.now() / 1000 - 86_400

ok('X with auth_token is signed in', looksSignedIn('x.com', [c('guest_id'), c('auth_token')]) === true)
ok('X with only guest cookies is not', looksSignedIn('x.com', [c('guest_id'), c('ct0')]) === false)
ok('an expired marker does not count', looksSignedIn('x.com', [c('auth_token', { expirationDate: past })]) === false)
ok('an empty marker does not count', looksSignedIn('x.com', [c('auth_token', { value: '' })]) === false)
ok('an unknown site cannot be checked', looksSignedIn('example.com', [c('anything')]) === null)

ok(
  'expired cookies are dropped, session cookies kept',
  liveCookies([c('a', { expirationDate: past }), c('b'), c('d', { expirationDate: future })]).map((x) => x.name).join() ===
    'b,d'
)

// --- the cookie file --------------------------------------------------------

const file = toNetscape([
  c('auth_token', { expirationDate: future }),
  c('lang', { httpOnly: false, domain: 'x.com', hostOnly: true, secure: false }),
  c('old', { expirationDate: past }),
  c('evil', { value: 'a\tb\nx.com\tTRUE\t/\tFALSE\t0\tinjected\t1' })
])
const lines = file.split('\n')
ok('starts with the Netscape header', lines[0] === '# Netscape HTTP Cookie File')
const auth = lines.find((l) => l.includes('\tauth_token\t'))?.split('\t') ?? []
ok('a domain cookie is #HttpOnly_ and subdomain-wide', auth[0] === '#HttpOnly_.x.com' && auth[1] === 'TRUE')
ok('a domain cookie keeps its expiry', auth[4] === String(Math.floor(future)))
const lang = lines.find((l) => l.includes('\tlang\t'))?.split('\t') ?? []
ok('a host-only cookie has no leading dot and FALSE', lang[0] === 'x.com' && lang[1] === 'FALSE')
ok('a session cookie gets expiry 0', lang[4] === '0')
ok('every cookie line has seven fields', lines.filter((l) => l && !l.startsWith('# ')).every((l) => l.split('\t').length === 7))
ok('expired cookies are not written', !file.includes('\told\t'))
ok('a cookie with a tab or newline is dropped, not split', !file.includes('evil') && !file.includes('injected'))

// --- the --cookies flag -----------------------------------------------------

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
const args = (extra: Record<string, unknown> = {}): string[] =>
  buildDownloadArgs({
    url: 'https://x.com/a/status/1',
    format: 'b',
    outDir: 'C:\\out',
    needsFfmpeg: false,
    settings: BASE,
    ...extra
  })
const withFile = args({ cookieFile: 'C:\\Temp\\tizo-cookies-1.txt' })
ok('a cookie file becomes --cookies', withFile[withFile.indexOf('--cookies') + 1] === 'C:\\Temp\\tizo-cookies-1.txt')
ok('the URL stays last', withFile[withFile.length - 1] === 'https://x.com/a/status/1')
ok('no cookie file, no --cookies', !args().includes('--cookies'))

// --- nothing reaches a report -----------------------------------------------

const stderr = [
  'ERROR: [twitter] 1: Unable to read C:\\Users\\someone\\AppData\\Local\\Temp\\tizo-cookies-0b1c2d3e-aaaa-bbbb-cccc-1234567890ab.txt',
  'ERROR: /tmp/tizo-cookies-0b1c2d3e-aaaa-bbbb-cccc-1234567890ab.txt: bad line',
  'Cookie: auth_token=SECRETVALUE; ct0=ALSOSECRET',
  'Set-Cookie: sessionid=SECRET2',
  'auth_token=SECRET3',
  'ERROR: [twitter] 1: No video could be found in this tweet'
].join('\n')
const clean = sanitise(stderr)
ok('no cookie-file path survives', !clean.includes('tizo-cookies-'))
ok('no session value survives', !/SECRET/.test(clean))
ok('the useful error line survives', clean.includes('No video could be found in this tweet'))
ok('user paths are still removed', !clean.includes('someone'))

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1
