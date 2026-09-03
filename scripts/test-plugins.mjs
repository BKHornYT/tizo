/**
 * Offline assertions that the bundled extractor plugins leave yt-dlp alone.
 *
 * This file exists because of a bug that shipped in v0.0.11 and v0.0.12 and was
 * only caught by hand. `kvsplayer.py` overrides generic, and it declared that
 * with `_PLUGIN_NAME` -- an attribute yt-dlp does not read. Without the real
 * `plugin_name=` class keyword, yt-dlp collected it as an ordinary plugin
 * extractor, and plugin extractors are PREPENDED to the lookup. It inherits
 * generic's `_VALID_URL = r'.*'`, so it was first and suitable for every URL
 * ever passed in: all ~1745 built-in extractors became unreachable. YouTube,
 * Vimeo and Dailymotion all fell through to generic.
 *
 * Every plugin test before this one asked "does the plugin extract from its
 * target site?". None asked "does the plugin leave the other 1800 sites alone?"
 * -- a plugin that overrides a built-in is a different risk class from one that
 * adds a new host, and only the second was ever reviewed. Hence the two halves
 * below, which have to hold together: the widening must work, AND it must cost
 * nothing else.
 *
 *   1. A YouTube URL is handled by the `youtube` extractor, with the shipping
 *      plugins loaded. Same for two other mainstream hosts, because the failure
 *      was never YouTube-specific -- it was every named extractor at once.
 *   2. No plugin registers a class that shadows a built-in. yt-dlp prints
 *      overrides as `name (Class)` and new extractors bare, so the debug line
 *      distinguishes the two and a bare `GenericIE` is the exact bug.
 *   3. The KVS widening still works -- otherwise "fixed" could just mean the
 *      plugin stopped doing anything.
 *   4. The fixture genuinely needs the plugin: with no plugins it must fail.
 *
 * All of it is offline. Extractor SELECTION happens before any network call
 * succeeds and yt-dlp tags its output with the extractor it chose, so pointing
 * it at a dead proxy reveals the choice without reaching the internet -- and a
 * test that needs the internet is a test that gets skipped. The KVS half reads
 * a local fixture over `file://`.
 *
 * It does need a yt-dlp binary, and it FAILS rather than skips when there is
 * none. A silent skip is how this shipped twice.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let passed = 0
let failed = 0

function check(name, ok, detail) {
  if (ok) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}`)
    if (detail) console.log(`       ${detail}`)
  }
}

const WINDOWS = process.platform === 'win32'
const YTDLP_BIN = WINDOWS ? 'yt-dlp.exe' : 'yt-dlp'
const REPO = resolve(import.meta.dirname, '..')

/* ---- find a yt-dlp to test against ---- */

/**
 * The same managed location the app uses, plus an env override for CI. Not
 * PATH: a stray yt-dlp of some other vintage would make this test's verdict
 * meaningless, and the whole point is to be told the truth about what ships.
 */
function findYtdlp() {
  if (process.env.TIZO_YTDLP) return process.env.TIZO_YTDLP

  const appData =
    process.env.APPDATA ??
    (process.env.HOME ? join(process.env.HOME, '.config') : null)
  if (!appData) return null

  for (const name of ['tizo', 'Video Downloader Tizo']) {
    const candidate = join(appData, name, 'bin', YTDLP_BIN)
    if (existsSync(candidate)) return candidate
  }
  return null
}

const ytdlp = findYtdlp()
if (!ytdlp) {
  console.error(
    '\nNo yt-dlp binary to test against.\n\n' +
      'This test runs the real engine against the real plugin files, so it needs one.\n' +
      'Either run `node --experimental-strip-types --import ./scripts/electron-stub-register.mjs\n' +
      'scripts/install-essentials.ts` to install the managed binary, or set TIZO_YTDLP to a\n' +
      'yt-dlp executable.\n'
  )
  process.exit(1)
}

/* ---- mirror the real install layout in a temp dir ---- */

/**
 * yt-dlp's default plugin search is anchored to the directory holding the
 * executable, and `--no-plugin-dirs` wins over a later `--plugin-dirs` whatever
 * the order, so flags cannot isolate anything. Copying the binary next to a
 * plugin tree built from `resources/plugins/` is what makes this hermetic: the
 * developer's installed copy cannot mask a broken file in the repo.
 *
 * The layout is deliberately the one `plugins.ts` writes -- so this also checks
 * that the shape the app creates on disk is a shape yt-dlp actually discovers.
 */
const work = mkdtempSync(join(tmpdir(), 'tizo-plugins-'))
const exe = join(work, YTDLP_BIN)
copyFileSync(ytdlp, exe)

const pluginRoot = join(work, 'yt-dlp-plugins')
mkdirSync(pluginRoot)
const source = join(REPO, 'resources', 'plugins')
const packages = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
for (const pkg of packages) cpSync(join(source, pkg), join(pluginRoot, pkg), { recursive: true })

function run(args) {
  try {
    return execFileSync(exe, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
      windowsHide: true
    })
  } catch (error) {
    // A non-zero exit is expected for most of these -- the output is the point.
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}

/* A proxy that refuses instantly. The extractor is chosen before any request
 * goes out, so its name is in the output while nothing leaves the machine. */
const DEAD_PROXY = ['--proxy', 'http://127.0.0.1:1', '--socket-timeout', '3', '--retries', '0']

/**
 * The extractor yt-dlp actually picked, read off its own output tags. `debug`
 * and the progress tags are yt-dlp's, not an extractor's.
 */
function chosenExtractor(output) {
  const ignore = new Set(['debug', 'info', 'download', 'redirect', 'error'])
  for (const line of output.split('\n')) {
    const match = /^(?:ERROR:\s*|WARNING:\s*)?\[([a-zA-Z0-9_.:+-]+)\]/.exec(line.trim())
    if (match && !ignore.has(match[1].toLowerCase())) return match[1]
  }
  return null
}

console.log('\nbundled extractor plugins\n')

/* ---- 1. the plugins load at all, from the tree we just built ---- */

const debugOut = run(['-v', '--simulate', 'file:///nonexistent'])
const dirLine = /\[debug\] Plugin directories: (.*)/.exec(debugOut)?.[1]?.trim() ?? ''
check(
  'the shipped layout is discovered by yt-dlp',
  dirLine.includes(work),
  `plugin directories: ${dirLine || '(none reported)'}`
)

const pluginLine = /\[debug\] Extractor Plugins: (.*)/.exec(debugOut)?.[1]?.trim() ?? ''
check('extractor plugins are registered', pluginLine.length > 0, debugOut.slice(0, 400))

/* ---- 2. no plugin shadows a built-in ---- */

/**
 * yt-dlp prints an override as `plugin-name (ClassName)` and a new extractor as
 * a bare `ClassName`. So the bare names are exactly the classes that were added
 * to the lookup -- and prepended to it. Anything named after a built-in there is
 * the v0.0.11 bug.
 */
const entries = pluginLine
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
const added = entries.filter((entry) => !entry.includes('('))
const overrides = entries.filter((entry) => entry.includes('('))

check(
  'the KVS fix is registered as an override, not as a new extractor',
  overrides.some((entry) => entry.startsWith('kvs-detection (GenericIE)')),
  `plugins: ${pluginLine}`
)
check(
  'no plugin adds a class named GenericIE',
  !added.some((entry) => entry === 'GenericIE'),
  `added as new extractors: ${added.join(', ') || '(none)'}`
)

/**
 * An allow list rather than a name check. A plugin may only ADD an extractor for
 * a host yt-dlp does not already have, and every such name is a deliberate
 * choice someone made -- so requiring the list to be edited alongside the plugin
 * is the review step that was missing. Anything unexpected here fails.
 */
const ALLOWED_NEW = new Set(['EmbedHostIE'])
const unexpected = added.filter((entry) => !ALLOWED_NEW.has(entry))
check(
  'every added extractor is one this test knows about',
  unexpected.length === 0,
  `unexpected: ${unexpected.join(', ')} — if this is intended, add it to ALLOWED_NEW and make sure it does not shadow a built-in`
)

/* ---- 3. named extractors are still reachable ---- */

/**
 * Three hosts, not one. The bug was never about YouTube -- generic swallowed
 * every URL -- so a single-site check would describe the symptom rather than the
 * property. These URLs are never fetched; the proxy refuses first.
 */
const SITES = [
  ['youtube', 'https://www.youtube.com/watch?v=jNQXAC9IVRw'],
  ['dailymotion', 'https://www.dailymotion.com/video/x2hwqn9'],
  ['vimeo', 'https://vimeo.com/76979871']
]

for (const [expected, url] of SITES) {
  const output = run([...DEAD_PROXY, '--simulate', url])
  const chosen = chosenExtractor(output)
  check(
    `${expected} URL is handled by the ${expected} extractor, not generic`,
    chosen?.toLowerCase() === expected,
    `chose: ${chosen ?? '(none)'} — a generic* name here means a plugin is shadowing the built-ins`
  )
}

/* ---- 4. the KVS widening still does its job ---- */

const fixture = pathToFileURL(join(REPO, 'scripts', 'fixtures', 'kvs-page.html')).href

const withPlugins = run(['--enable-file-urls', '--simulate', '-J', fixture])
let info = null
try {
  info = JSON.parse(withPlugins.slice(withPlugins.indexOf('{')))
} catch {
  /* left null; the checks below report it */
}

check('the KVS fixture extracts', info !== null, withPlugins.split('\n').slice(-2).join(' '))
check(
  'it is the override that handled it',
  typeof info?.extractor === 'string' && info.extractor.includes('kvs-detection'),
  `extractor: ${info?.extractor ?? '(none)'}`
)

const formatIds = (info?.formats ?? []).map((format) => format.format_id)
check(
  'both declared formats come through',
  formatIds.length === 2 && formatIds.includes('720p') && formatIds.includes('480p'),
  `formats: ${formatIds.join(', ') || '(none)'}`
)
check(
  'the media URLs survive intact',
  (info?.formats ?? []).every((format) => format.url?.includes('/get_file/')),
  (info?.formats ?? []).map((format) => format.url).join(' ')
)

/**
 * Without this the suite above could pass with the plugin doing nothing at all:
 * a fixture yt-dlp handles on its own proves the widening only if yt-dlp
 * demonstrably cannot handle it on its own.
 */
const withoutPlugins = run(['--enable-file-urls', '--no-plugin-dirs', '--simulate', '-J', fixture])
check(
  'the fixture is unreadable without the plugin',
  /Unable to extract flashvars/i.test(withoutPlugins),
  withoutPlugins.split('\n').slice(-2).join(' ')
)

rmSync(work, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
