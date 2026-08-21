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
import {
  shapeFormats,
  listAllFormats,
  rawFormatsOf,
  type RawFormat
} from '../src/main/engine/formats.ts'

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

/*
 * The other streaming transports. These regressed silently: the check tested
 * `protocol` against a `.m3u8` *file extension*, which a protocol name can never
 * match, so only the literal 'm3u8_native' comparison beside it did any work.
 * Plain m3u8 and DASH came back claiming they needed no ffmpeg.
 */
for (const protocol of ['m3u8', 'http_dash_segments']) {
  const shaped = shapeFormats([{ format_id: 's', ext: 'mp4', protocol }])
  ok(`${protocol} is flagged as needing ffmpeg`, shaped[0]?.needsFfmpeg === true, protocol)
}
ok(
  'a plain https file is NOT flagged as needing ffmpeg',
  shapeFormats([{ format_id: 's', ext: 'mp4', protocol: 'https' }])[0]?.needsFfmpeg === false
)

// --- Audio extraction rows -------------------------------------------------
const withAudio: RawFormat[] = [
  { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a', abr: 128 },
  { format_id: '137', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 1080 }
]
const audioRows = shapeFormats(withAudio).filter((f) => f.kind === 'audio')
const mp3 = audioRows.find((f) => f.extractAudio === 'mp3')
const m4a = audioRows.find((f) => f.extractAudio === 'm4a')
const plain = audioRows.find((f) => !f.extractAudio)

ok('MP3 and M4A extraction rows are offered', Boolean(mp3 && m4a))
ok('the untouched "Audio only" row survives', Boolean(plain))
ok('extraction always needs ffmpeg', mp3?.needsFfmpeg === true && m4a?.needsFfmpeg === true)
ok('the no-conversion row still does not', plain?.needsFfmpeg === false)
ok(
  'MP3 reports no size — it is re-encoded, so the source size would be a guess',
  mp3?.filesize === null
)
// Identity and selector are separate for exactly this reason: M4A and
// "Audio only" select the same stream, so a shared id would make one of them
// unreachable when the queue looks the choice back up.
ok(
  'every option id is unique',
  new Set(shapeFormats(withAudio).map((f) => f.id)).size === shapeFormats(withAudio).length
)
ok('extraction rows carry a selector distinct from their id', mp3?.selector === 'ba/b')

// --- An extractor that returns one URL and no formats list -----------------
/*
 * Most plugins do this, and so do plenty of built-in extractors: one `url` at the
 * top level, no `formats` array at all. Reading `formats` blindly gives an empty
 * list, so the row renders with nothing to download while the extractor has
 * already found the file — the v0.0.3 failure arriving by another route.
 */
const single = rawFormatsOf({ url: 'https://cdn.example/v.mp4', ext: 'mp4', protocol: 'https' })
ok('a single top-level url becomes one format', single.length === 1, String(single.length))
ok('it is offered as a download', shapeFormats(single).length === 1)
ok(
  'and does not claim to need the HQ pack',
  shapeFormats(single)[0]?.needsFfmpeg === false
)
ok(
  'a single top-level stream does need it',
  shapeFormats(rawFormatsOf({ url: 'https://cdn.example/x', protocol: 'm3u8_native' }))[0]
    ?.needsFfmpeg === true
)
ok(
  'a real formats list still wins over the top-level url',
  rawFormatsOf({
    url: 'https://cdn.example/v.mp4',
    formats: [{ format_id: 'a' }, { format_id: 'b' }]
  }).length === 2
)
ok('nothing at all yields nothing', rawFormatsOf({}).length === 0)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
// Set the code rather than calling process.exit(): forcing an exit while the
// type-stripping loader still has async handles open trips a libuv assertion on
// Windows, which fails CI even when every check passed.
process.exitCode = failures === 0 ? 0 : 1
