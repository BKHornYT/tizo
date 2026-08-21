/**
 * Asserts that settings actually reach the yt-dlp command line.
 *
 * Run: node --experimental-strip-types scripts/test-args.ts
 *
 * No network, no spawning. This is the cheapest possible guard against the
 * failure mode where a setting quietly stops being applied and nobody notices
 * until a user reports "the speed limit does nothing".
 */
import { buildDownloadArgs, profileFor } from '../src/main/engine/args.ts'
import type { Settings } from '../src/shared/types.ts'

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

const ctx = (settings: Partial<Settings>, extra: Record<string, unknown> = {}): string[] =>
  buildDownloadArgs({
    url: 'https://www.youtube.com/watch?v=abc',
    format: 'bv*+ba/b',
    outDir: 'C:\\out',
    needsFfmpeg: true,
    settings: { ...BASE, ...settings },
    ...extra
  })

let failures = 0
function ok(label: string, pass: boolean, detail = ''): void {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures++
}

/** True when `flag` is present and immediately followed by `value`. */
function hasPair(args: string[], flag: string, value: string): boolean {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] === value
}

const outputTemplate = (args: string[]): string => args[args.indexOf('-o') + 1] ?? ''

// --- Baseline --------------------------------------------------------------
const base = ctx({})
ok('user config is never inherited', base.includes('--ignore-config'))
ok('url is the final argument', base[base.length - 1] === 'https://www.youtube.com/watch?v=abc')
ok('format selector is passed', hasPair(base, '-f', 'bv*+ba/b'))
ok('output dir is passed', hasPair(base, '-P', 'C:\\out'))
ok('title is byte-limited for windows paths', outputTemplate(base).includes('%(title).150B'))
ok('no speed limit by default', !base.includes('-r'))
ok('no geo-bypass by default', !base.includes('--geo-bypass'))

// --- Speed limit -----------------------------------------------------------
ok('speed limit is applied', hasPair(ctx({ maxSpeedKbps: 500 }), '-r', '500K'))
ok('zero speed limit is ignored', !ctx({ maxSpeedKbps: 0 }).includes('-r'))

// --- Geo bypass ------------------------------------------------------------
ok('geo-bypass is applied', ctx({ geoBypass: true }).includes('--geo-bypass'))

// --- Folder per download ---------------------------------------------------
ok(
  'folder-per-download nests the template',
  outputTemplate(ctx({ folderPerDownload: true })).includes('/'),
  outputTemplate(ctx({ folderPerDownload: true }))
)
ok('flat template by default', !outputTemplate(base).includes('/'))

// --- File-exists rules -----------------------------------------------------
ok('overwrite forces overwrites', ctx({ onFileExists: 'overwrite' }).includes('--force-overwrites'))
ok('skip never forces overwrites', !ctx({ onFileExists: 'skip-if-same' }).includes('--force-overwrites'))
ok('rename never forces overwrites', !ctx({ onFileExists: 'rename' }).includes('--force-overwrites'))
ok(
  'collision suffix lands before the extension',
  outputTemplate(ctx({ onFileExists: 'rename' }, { collisionSuffix: ' (2)' })).includes('] (2).%(ext)s'),
  outputTemplate(ctx({ onFileExists: 'rename' }, { collisionSuffix: ' (2)' }))
)

// --- Container -------------------------------------------------------------
ok('container is applied when merging', hasPair(ctx({ container: 'mkv' }), '--merge-output-format', 'mkv'))
ok('container is left alone when set to original', !ctx({ container: 'original' }).includes('--merge-output-format'))
ok(
  'no merge format when muxing is not needed',
  !buildDownloadArgs({
    url: 'https://x.com/a',
    format: 'b',
    outDir: 'C:\\out',
    needsFfmpeg: false,
    settings: BASE
  }).includes('--merge-output-format')
)

// --- Site profiles ---------------------------------------------------------
const profiles = { 'youtube.com': { concurrentFragments: 4 }, 'tiktok.com': { impersonate: 'chrome' } }
ok('exact host matches its profile', profileFor('https://tiktok.com/x', profiles)?.impersonate === 'chrome')
ok('www is ignored', profileFor('https://www.tiktok.com/x', profiles)?.impersonate === 'chrome')
ok(
  'subdomains inherit the parent profile',
  profileFor('https://m.youtube.com/watch?v=1', profiles)?.concurrentFragments === 4
)
ok('unknown host has no profile', profileFor('https://example.com/x', profiles) === undefined)
ok('malformed url does not throw', profileFor('not a url', profiles) === undefined)
ok(
  'profile impersonation reaches the command line',
  hasPair(ctx({}, { profile: { impersonate: 'chrome' } }), '--impersonate', 'chrome')
)
ok(
  'profile fragment count reaches the command line',
  hasPair(ctx({}, { profile: { concurrentFragments: 4 } }), '-N', '4')
)
ok('single fragment is not passed', !ctx({}, { profile: { concurrentFragments: 1 } }).includes('-N'))

// --- Bot-wall impersonation ------------------------------------------------
ok(
  'probe-detected impersonation reaches the command line',
  hasPair(ctx({}, { impersonate: true }), '--extractor-args', 'generic:impersonate')
)
ok('no impersonation by default', !ctx({}).includes('generic:impersonate'))
ok(
  'a registry target wins over the generic flag',
  hasPair(ctx({}, { impersonate: true, profile: { impersonate: 'chrome' } }), '--impersonate', 'chrome') &&
    !ctx({}, { impersonate: true, profile: { impersonate: 'chrome' } }).includes('generic:impersonate')
)

// --- ffmpeg location -------------------------------------------------------
ok(
  'managed ffmpeg directory is passed',
  hasPair(ctx({}, { ffmpegDir: 'C:\\bin' }), '--ffmpeg-location', 'C:\\bin')
)
ok('no ffmpeg location when we do not own one', !ctx({}).includes('--ffmpeg-location'))

// --- Audio extraction ------------------------------------------------------
const mp3 = ctx({ audioBitrate: 320 }, { extractAudio: 'mp3' })
ok('extraction passes -x', mp3.includes('-x'))
ok('extraction names the container', hasPair(mp3, '--audio-format', 'mp3'))
ok('the bitrate setting reaches the encoder', hasPair(mp3, '--audio-quality', '320K'))
ok('no extraction flags on a plain video job', !ctx({}).includes('-x'))

// A bitrate on a lossless target is meaningless, and yt-dlp would carry it
// straight into the encoder rather than ignoring it.
ok('no bitrate is sent for flac', !ctx({}, { extractAudio: 'flac' }).includes('--audio-quality'))
ok('flac still passes -x', ctx({}, { extractAudio: 'flac' }).includes('-x'))

// Naming a video container on an audio job makes yt-dlp reject the combination.
ok(
  'no --merge-output-format on an extraction job',
  !ctx({ container: 'mkv' }, { extractAudio: 'mp3' }).includes('--merge-output-format')
)
ok(
  'merge container still applies to a video job',
  hasPair(ctx({ container: 'mkv' }), '--merge-output-format', 'mkv')
)

ok(
  'cover art is embedded when asked',
  ctx({ embedThumbnail: true }, { extractAudio: 'mp3' }).includes('--embed-thumbnail')
)
ok(
  'cover art is not embedded when off',
  !ctx({ embedThumbnail: false }, { extractAudio: 'mp3' }).includes('--embed-thumbnail')
)

/*
 * Metadata needs a postprocessor, so it follows the ffmpeg rule: a row marked as
 * NOT needing ffmpeg must not emit a flag that demands it. Same failure mode as
 * a `bv*+ba` selector on a no-ffmpeg row — the job hard-errors rather than
 * falling back.
 */
ok(
  'metadata is embedded on a job that already needs ffmpeg',
  ctx({ embedMetadata: true }).includes('--embed-metadata')
)
ok(
  'metadata is NOT embedded on a job that avoids ffmpeg',
  !buildDownloadArgs({
    url: 'https://example.com/v',
    format: 'b[height<=360]',
    outDir: 'C:\\out',
    needsFfmpeg: false,
    settings: { ...BASE, embedMetadata: true }
  }).includes('--embed-metadata')
)

// --- Subtitles -------------------------------------------------------------
const subs = (settings: Partial<Settings>, langs: string[]): string[] =>
  ctx(settings, { subLangs: langs })

ok(
  'chosen languages reach the command line',
  hasPair(subs({}, ['en', 'nb']), '--sub-langs', 'en,nb')
)
ok('no subtitle flags when none are chosen', !subs({}, []).includes('--sub-langs'))

ok('embed mode embeds', subs({ subtitleMode: 'embed' }, ['en']).includes('--embed-subs'))
ok(
  'embed mode writes no sidecar the user did not ask for',
  !subs({ subtitleMode: 'embed' }, ['en']).includes('--write-subs')
)
ok('file mode writes sidecars', subs({ subtitleMode: 'file' }, ['en']).includes('--write-subs'))
ok(
  'file mode converts to srt, which every player reads',
  hasPair(subs({ subtitleMode: 'file' }, ['en']), '--convert-subs', 'srt')
)
ok(
  'both mode does both',
  subs({ subtitleMode: 'both' }, ['en']).includes('--embed-subs') &&
    subs({ subtitleMode: 'both' }, ['en']).includes('--write-subs')
)
ok(
  'automatic captions are opt-in',
  !subs({ subtitleAuto: false }, ['en']).includes('--write-auto-subs') &&
    subs({ subtitleAuto: true }, ['en']).includes('--write-auto-subs')
)

// Subtitles on an mp3 are not merely useless — `--embed-subs` fails against one.
ok(
  'subtitles are dropped entirely on an audio-extraction job',
  !ctx({}, { extractAudio: 'mp3', subLangs: ['en'] }).includes('--sub-langs')
)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
// Set the code rather than calling process.exit(): forcing an exit while the
// type-stripping loader still has async handles open trips a libuv assertion on
// Windows, which fails CI even when every check passed.
process.exitCode = failures === 0 ? 0 : 1
