/**
 * End-to-end check of the real Essentials install, against the real published
 * assets and the live registry.
 *
 * Run: node --experimental-strip-types scripts/test-essentials.ts
 *
 * Downloads ~92 MB. This exercises components/install.ts itself rather than a
 * reimplementation of it — which is why that module takes its target directory
 * as an argument and imports nothing from electron.
 */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { installComponent } from '../src/main/components/install.ts'
import { forPlatform, type ComponentSpec } from '../src/main/components/manifest.ts'

const execFileAsync = promisify(execFile)

/**
 * The live registry by default. Overridable with a local path so a candidate
 * registry can be proven against the real published assets *before* it is
 * pushed — otherwise the only way to test a new entry is to publish it first
 * and find out afterwards.
 */
const MANIFEST =
  process.env['TIZO_MANIFEST_URL'] ??
  'https://raw.githubusercontent.com/BKHornYT/tizo/main/components.json'
const remote = MANIFEST.startsWith('http')

function ok(label: string, pass: boolean, detail = ''): boolean {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return pass
}

const scratch = await mkdtemp(join(tmpdir(), 'tizo-essentials-'))
let failures = 0

try {
  let raw: string
  if (remote) {
    const response = await fetch(MANIFEST)
    if (!ok('registry is reachable unauthenticated', response.ok, `HTTP ${response.status}`)) {
      failures++
      process.exitCode = 1
      throw new Error('registry unreachable')
    }
    raw = await response.text()
  } else {
    raw = await readFile(MANIFEST, 'utf8')
    ok(`registry read from ${MANIFEST}`, true)
  }

  const manifest = JSON.parse(raw) as {
    essentials: { components: string[] }
    components: ComponentSpec[]
  }

  // Resolved for THIS platform, not taken off the top level. The top-level
  // fields are the Windows variant, so skipping this would download ffmpeg.exe
  // onto a Linux box and then fail the execute check — testing the wrong thing
  // and blaming the wrong cause.
  const specs = manifest.essentials.components
    .map((id) => manifest.components.find((c) => c.id === id))
    .filter((s): s is ComponentSpec => Boolean(s))
    .map((s) => forPlatform(s))
    .filter((s): s is ComponentSpec => Boolean(s))

  if (
    !ok(
      `manifest publishes every essential component for ${process.platform}`,
      specs.length === manifest.essentials.components.length
    )
  )
    failures++

  const stagesSeen = new Set<string>()
  let lastPercent = 0

  for (const spec of specs) {
    process.stdout.write(`\n  installing ${spec.name} (${(spec.size / 1e6).toFixed(1)} MB)…\n`)
    const started = Date.now()

    await installComponent(spec, scratch, (p) => {
      stagesSeen.add(p.stage)
      if (p.totalBytes) lastPercent = (p.receivedBytes / p.totalBytes) * 100
    })

    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    console.log(`  done in ${seconds}s`)

    for (const binary of spec.binaries) {
      const path = join(scratch, binary)
      const size = await stat(path).then((s) => s.size).catch(() => 0)
      if (!ok(`${binary} installed`, size > 0, `${(size / 1e6).toFixed(1)} MB`)) failures++

      // Prove it runs, which is the check that catches AV quarantine and
      // architecture mismatches that a hash comparison sails straight past.
      const versionArg = binary.toLowerCase().startsWith('ffmpeg') || binary.toLowerCase().startsWith('ffprobe')
        ? '-version'
        : '--version'
      const runs = await execFileAsync(path, [versionArg], { timeout: 20_000, windowsHide: true })
        .then((r) => (r.stdout || r.stderr).trim().split('\n')[0] ?? '')
        .catch(() => '')
      if (!ok(`${binary} executes`, runs.length > 0, runs.slice(0, 60))) failures++
    }
  }

  if (!ok('progress reached 100%', lastPercent > 99, `${lastPercent.toFixed(1)}%`)) failures++
  if (!ok('download and check stages both reported', stagesSeen.has('downloading') && stagesSeen.has('checking'), [...stagesSeen].join(', ')))
    failures++
} finally {
  await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
// Set the code rather than calling process.exit(): forcing an exit while the
// type-stripping loader still has async handles open trips a libuv assertion on
// Windows, which fails CI even when every check passed.
process.exitCode = failures === 0 ? 0 : 1
