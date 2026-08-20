/**
 * Verifies the resume path in components/fetcher.ts against a real server.
 *
 * Run: node --experimental-strip-types scripts/test-fetcher.ts
 *
 * Resume is the load-bearing part of a mandatory setup — if a 92 MB download
 * restarts from zero on every blip, users on poor connections never finish.
 * That deserves a test that actually interrupts a transfer, not a code read.
 */
import { mkdtemp, rm, stat, truncate, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fetchFile, sha256File } from '../src/main/components/fetcher.ts'

const URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'

function ok(label: string, pass: boolean, detail = ''): boolean {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return pass
}

const scratch = await mkdtemp(join(tmpdir(), 'tizo-fetchtest-'))
let failures = 0

try {
  // 1. Baseline: a clean, complete download.
  const full = join(scratch, 'full.exe')
  let sawProgress = false
  let lastPct = 0
  await fetchFile({
    url: URL,
    dest: full,
    onProgress: (p) => {
      sawProgress = true
      if (p.totalBytes) lastPct = (p.receivedBytes / p.totalBytes) * 100
    }
  })
  const fullSize = (await stat(full)).size
  const fullHash = await sha256File(full)
  if (!ok('clean download completes', fullSize > 1_000_000, `${fullSize} bytes`)) failures++
  if (!ok('progress callback fires', sawProgress, `reached ${lastPct.toFixed(0)}%`)) failures++

  // 2. Resume: seed a half-finished .part and confirm the rest is fetched and
  //    that the result is byte-identical to the clean download.
  const resumed = join(scratch, 'resumed.exe')
  await copyFile(full, `${resumed}.part`)
  await truncate(`${resumed}.part`, Math.floor(fullSize / 2))
  const partBefore = (await stat(`${resumed}.part`)).size

  let firstReported = -1
  await fetchFile({
    url: URL,
    dest: resumed,
    onProgress: (p) => {
      if (firstReported < 0) firstReported = p.receivedBytes
    }
  })
  const resumedHash = await sha256File(resumed)

  if (!ok('resumed file matches clean download', resumedHash === fullHash)) failures++
  if (
    !ok(
      'resume continued rather than restarting',
      firstReported >= partBefore,
      `first progress at ${firstReported} bytes, part was ${partBefore}`
    )
  )
    failures++

  // 3. Integrity: a wrong hash must fail loudly AND discard the bad part, or the
  //    corrupt bytes would survive every retry.
  const bad = join(scratch, 'bad.exe')
  let rejected = false
  try {
    await fetchFile({ url: URL, dest: bad, sha256: 'de'.repeat(32), maxAttempts: 1 })
  } catch (err) {
    rejected = (err as Error).message.includes('integrity')
  }
  if (!ok('wrong sha256 is rejected', rejected)) failures++

  let partGone = false
  try {
    await stat(`${bad}.part`)
  } catch {
    partGone = true
  }
  if (!ok('corrupt part is discarded, not left to resume', partGone)) failures++
} finally {
  await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
// Set the code rather than calling process.exit(): forcing an exit while the
// type-stripping loader still has async handles open trips a libuv assertion on
// Windows, which fails CI even when every check passed.
process.exitCode = failures === 0 ? 0 : 1
