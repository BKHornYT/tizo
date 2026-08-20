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
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { installComponent } from '../src/main/components/install.ts'
import type { ComponentSpec } from '../src/main/components/manifest.ts'

const execFileAsync = promisify(execFile)
const MANIFEST = 'https://raw.githubusercontent.com/BKHornYT/tizo/main/components.json'

function ok(label: string, pass: boolean, detail = ''): boolean {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return pass
}

const scratch = await mkdtemp(join(tmpdir(), 'tizo-essentials-'))
let failures = 0

try {
  const response = await fetch(MANIFEST)
  if (!ok('registry is reachable unauthenticated', response.ok, `HTTP ${response.status}`)) {
    failures++
    process.exit(1)
  }

  const manifest = (await response.json()) as {
    essentials: { components: string[] }
    components: ComponentSpec[]
  }

  const specs = manifest.essentials.components
    .map((id) => manifest.components.find((c) => c.id === id))
    .filter((s): s is ComponentSpec => Boolean(s))

  if (!ok('manifest lists every essential component', specs.length === manifest.essentials.components.length))
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
process.exit(failures === 0 ? 0 : 1)
