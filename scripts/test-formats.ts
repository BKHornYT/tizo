/**
 * Guards the format shaping against the two shapes yt-dlp actually returns.
 *
 * Run: node --experimental-strip-types scripts/test-formats.ts
 *
 * Exists because of a real bug: the Generic extractor returns a working file with
 * `vcodec: null` and no `height`, and the original filter treated "codec unknown"
 * the same as "codec absent". That discarded the only format, so the queue row had
 * nothing to download even though yt-dlp had already found the mp4.
 */
import { shapeFormats, listAllFormats, type RawFormat } from '../src/main/engine/formats.ts'

let failures = 0
function ok(label: string, pass: boolean, detail = ''): void {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures++
}

// --- A plain file found on a page. Codecs unstated, no resolution. -----------
const generic: RawFormat[] = [
  { format_id: 'mp4', ext: 'mp4', protocol: 'https', filesize: 52_000_000 }
]

const genericOptions = shapeFormats(generic)
ok('generic single file produces an option', genericOptions.length === 1)
ok('generic option is downloadable', genericOptions[0]?.id === 'b', genericOptions[0]?.id)
ok('generic option is video', genericOptions[0]?.kind === 'video')
ok('generic option needs no HQ pack', genericOptions[0]?.needsFfmpeg === false)
ok('generic option keeps its size', genericOptions[0]?.filesize === 52_000_000)
ok('generic file appears in all-formats too', listAllFormats(generic).length === 1)

// --- A YouTube-shaped list: video-only ladder, one progressive, audio-only ---
const youtube: RawFormat[] = [
  { format_id: 'sb0', ext: 'mhtml', protocol: 'mhtml', vcodec: 'none', acodec: 'none' },
  { format_id: '137', ext: 'mp4', height: 1080, vcodec: 'avc1', acodec: 'none', tbr: 4000 },
  { format_id: '136', ext: 'mp4', height: 720, vcodec: 'avc1', acodec: 'none', tbr: 2000 },
  { format_id: '18', ext: 'mp4', height: 360, vcodec: 'avc1', acodec: 'mp4a', tbr: 600 },
  { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a', abr: 128 }
]

const ytOptions = shapeFormats(youtube)
const labels: string[] = ytOptions.map((o) => o.label)
ok('storyboard is excluded', !listAllFormats(youtube).some((o: { ext: string }) => o.ext === 'mhtml'))
ok('best-available offered', labels.includes('Best available'))
ok('1080p offered', labels.includes('1080p'))
ok('audio-only offered', labels.includes('Audio only'))
ok(
  'no "Original quality" row when heights exist',
  !labels.includes('Original quality'),
  labels.join(', ')
)

const p1080 = ytOptions.find((o) => o.label === '1080p')
const p360 = ytOptions.find((o) => o.label === '360p')
ok('1080p needs the HQ pack (video-only stream)', p1080?.needsFfmpeg === true)
ok('360p does not (progressive stream)', p360?.needsFfmpeg === false)
ok(
  '360p uses a progressive-only selector',
  p360?.id === 'b[height<=360]',
  p360?.id
)
ok(
  '1080p uses a merge selector',
  p1080?.id === 'bv*[height<=1080]+ba/b[height<=1080]',
  p1080?.id
)

// --- A stream manifest: single entry, no height, needs muxing ---------------
const hls: RawFormat[] = [{ format_id: 'hls-720', ext: 'mp4', protocol: 'm3u8_native' }]
ok('stream manifest is offered', shapeFormats(hls).length === 1)
ok('stream manifest is flagged as needing ffmpeg', shapeFormats(hls)[0]?.needsFfmpeg === true)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
// Set the code rather than calling process.exit(): forcing an exit while the
// type-stripping loader still has async handles open trips a libuv assertion on
// Windows, which fails CI even when every check passed.
process.exitCode = failures === 0 ? 0 : 1
