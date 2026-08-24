/**
 * Offline assertions on how the registry resolves a component per platform.
 *
 * Runs the REAL src/main/components/manifest module — `electron` is stubbed by
 * the same resolution hook test-stats uses, rather than the logic being copied
 * into the test. A copy would happily pass while the shipped resolver did
 * something else, which is a failure mode this project has already had once.
 *
 * Two properties matter more than the rest:
 *
 *   1. The top level IS the Windows variant. Every client shipped since v0.0.5
 *      reads url/size/sha256/binaries directly, so restructuring those fields
 *      breaks first-run setup — a mandatory gate — for installs already out there.
 *   2. A platform with no variant resolves to null, never to the Windows one.
 *      Falling back would download ffmpeg.exe onto a Linux box, fail the execute
 *      check, and blame the user's antivirus.
 */
import { bundledManifest, forPlatform, parseRegistry, type ComponentSpec } from '../src/main/components/manifest.ts'

let passed = 0
let failed = 0

function check(name: string, ok: boolean): void {
  if (ok) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}`)
  }
}

const base: ComponentSpec = {
  id: 'demo',
  name: 'Demo',
  summary: 'A component',
  version: '1.0.0',
  kind: 'zip',
  size: 100,
  sha256: null,
  url: 'https://example.invalid/demo-win.zip',
  provides: ['demo'],
  binaries: ['demo.exe'],
  platforms: {
    linux: {
      size: 200,
      sha256: 'a'.repeat(64),
      url: 'https://example.invalid/demo-linux.zip',
      binaries: ['demo']
    }
  }
}

// --- resolution -------------------------------------------------------------

const win = forPlatform(base, 'win32')
check('win32 gets the top-level spec unchanged', win?.url === base.url && win?.size === 100)
check('win32 keeps the .exe binary name', win?.binaries[0] === 'demo.exe')

const linux = forPlatform(base, 'linux')
check('linux gets the variant url', linux?.url === 'https://example.invalid/demo-linux.zip')
check('linux gets the variant size', linux?.size === 200)
check('linux gets the variant hash', linux?.sha256 === 'a'.repeat(64))
check('linux gets the extensionless binary name', linux?.binaries[0] === 'demo')
check('shared fields survive the merge', linux?.name === 'Demo' && linux?.provides[0] === 'demo')
check('the resolved spec carries no platforms map', Boolean(linux) && !linux?.platforms)

check('an unpublished platform is null, NOT the windows spec', forPlatform(base, 'darwin') === null)

const noVariants: ComponentSpec = { ...base, platforms: undefined }
check('no platforms map still resolves on win32', forPlatform(noVariants, 'win32')?.url === base.url)
check('no platforms map is null elsewhere', forPlatform(noVariants, 'linux') === null)

// --- the real shipped registry ----------------------------------------------

const real = bundledManifest()
const ytdlp = real.components.find((c) => c.id === 'ytdlp')!
const ffmpeg = real.components.find((c) => c.id === 'ffmpeg')!

check('registry still resolves ytdlp on win32', forPlatform(ytdlp, 'win32')?.binaries[0] === 'yt-dlp.exe')
check('registry resolves ytdlp on linux', forPlatform(ytdlp, 'linux')?.binaries[0] === 'yt-dlp')
check(
  'the linux engine url is the linux asset',
  forPlatform(ytdlp, 'linux')?.url.endsWith('/yt-dlp_linux') === true
)
check('registry still resolves ffmpeg on win32', forPlatform(ffmpeg, 'win32')?.binaries[0] === 'ffmpeg.exe')
check(
  'registry resolves ffmpeg on linux',
  forPlatform(ffmpeg, 'linux')?.binaries.join(',') === 'ffmpeg,ffprobe'
)
check(
  'the linux ffmpeg bundle is hash-pinned (unlike the rolling engine)',
  /^[0-9a-f]{64}$/.test(forPlatform(ffmpeg, "linux")?.sha256 ?? "")
)
check(
  'underscore documentation keys never become a platform',
  forPlatform(ffmpeg, '_comment') === null && forPlatform(ytdlp, '_comment') === null
)

// --- validation of the registry surface -------------------------------------
// A variant names files that are downloaded and written next to the engine, so a
// malformed one must be dropped rather than half-applied. These go through the
// real clean(), reached via the bundled-manifest path.

function survives(variant: unknown): boolean {
  const doc = {
    schema: 1,
    essentials: { version: 1, components: ['demo'] },
    components: [{ ...base, platforms: { linux: variant, _comment: 'docs' } }],
    siteProfiles: {},
    domains: {},
    plugins: []
  }
  const parsed = parseRegistry(doc)
  return Boolean(parsed && forPlatform(parsed.components[0]!, 'linux'))
}

const good = { size: 1, sha256: null, url: 'https://x.invalid/a.zip', binaries: ['ffmpeg'] }
check('a well-formed variant survives', survives(good))
check('http is rejected', !survives({ ...good, url: 'http://x.invalid/a.zip' }))
check('a short hash is rejected', !survives({ ...good, sha256: 'abc' }))
check('a missing sha256 field is rejected, not assumed null', !survives({ size: 1, url: good.url, binaries: ['ffmpeg'] }))
check('zero size is rejected', !survives({ ...good, size: 0 }))
check('empty binaries is rejected', !survives({ ...good, binaries: [] }))
check('a binary name with a slash is rejected', !survives({ ...good, binaries: ['../../evil'] }))
// String.raw so the assertion cannot be weakened by an escape being eaten: the
// value under test must contain a real backslash, and `'..\evil'` quietly does
// not — it is `..evil` with an escape that means nothing.
check('a binary name with a backslash is rejected', !survives({ ...good, binaries: [String.raw`..\evil`] }))
check('a windows-absolute name is rejected', !survives({ ...good, binaries: [String.raw`C:\Windows\x.exe`] }))
check('a bare ".." is rejected', !survives({ ...good, binaries: ['..'] }))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
