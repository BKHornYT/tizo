import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, rm, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import extract from 'extract-zip'
import { fetchFile, type FetchProgress } from './fetcher.ts'
import type { ComponentSpec } from './manifest'

const execFileAsync = promisify(execFile)

export interface InstallProgress extends FetchProgress {
  stage: 'downloading' | 'verifying' | 'extracting' | 'checking'
}

/** Walks an extracted tree and returns the first file matching `name`. */
async function findFile(root: string, name: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      const found = await findFile(full, name)
      if (found) return found
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full
    }
  }
  return null
}

/**
 * Runs the installed binary to prove it works. A file of the right size and
 * hash can still be unrunnable — wrong architecture, blocked by SmartScreen or
 * an AV quarantine, missing a runtime. Setup state is only written after this
 * passes, so a half-broken install re-runs rather than pretending to be ready.
 */
async function verifyRuns(exePath: string): Promise<boolean> {
  // Both spellings are tried rather than guessed from the filename. The ffmpeg
  // family takes a single dash (`-version`) and yt-dlp takes two, and guessing
  // from a name prefix got ffprobe wrong — which failed every HQ Pack install
  // at the final step, with a message blaming antivirus.
  for (const arg of ['-version', '--version']) {
    try {
      await execFileAsync(exePath, [arg], { timeout: 20_000, windowsHide: true })
      return true
    } catch {
      /* try the other spelling */
    }
  }
  return false
}

/**
 * A downloaded file carries no execute permission on Unix, so it has to be set
 * before anything tries to run it. Skipped on Windows, where permissions do not
 * work this way.
 *
 * Without this, `verifyRuns` above fails with EACCES and setup reports
 * "installed but will not run. Antivirus may have quarantined it." — a
 * mandatory gate failing for a reason the message actively points away from.
 */
async function makeExecutable(path: string): Promise<void> {
  if (process.platform === 'win32') return
  await chmod(path, 0o755)
}

export class InstallError extends Error {
  // Longhand field, not a constructor parameter property — see the note on
  // FetchError. This module is executed directly by the test script under
  // `node --experimental-strip-types`, which rejects parameter properties.
  stage: InstallProgress['stage']

  constructor(message: string, stage: InstallProgress['stage']) {
    super(message)
    this.name = 'InstallError'
    this.stage = stage
  }
}

/**
 * `target` is injected rather than read from the app's paths module so this file
 * imports nothing from electron — which is what lets scripts/test-essentials.ts
 * exercise the real installer against the real assets, outside a running app.
 */
export async function installComponent(
  spec: ComponentSpec,
  target: string,
  onProgress: (progress: InstallProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  await mkdir(target, { recursive: true })

  const scratch = await mkdtemp(join(tmpdir(), 'tizo-'))
  const staged = join(scratch, spec.kind === 'zip' ? `${spec.id}.zip` : spec.binaries[0]!)

  try {
    await fetchFile({
      url: spec.url,
      dest: staged,
      expectedSize: spec.size,
      sha256: spec.sha256,
      signal,
      onProgress: (p) => onProgress({ ...p, stage: 'downloading' })
    })

    if (spec.kind === 'zip') {
      onProgress({ receivedBytes: spec.size, totalBytes: spec.size, speed: null, stage: 'extracting' })
      const unpacked = join(scratch, 'unpacked')
      await mkdir(unpacked, { recursive: true })
      await extract(staged, { dir: unpacked })

      for (const binary of spec.binaries) {
        const found = await findFile(unpacked, binary)
        if (!found) throw new InstallError(`${binary} was missing from the archive.`, 'extracting')
        await copyFile(found, join(target, binary))
      }
    } else {
      for (const binary of spec.binaries) {
        await copyFile(staged, join(target, binary))
      }
    }

    onProgress({ receivedBytes: spec.size, totalBytes: spec.size, speed: null, stage: 'checking' })
    for (const binary of spec.binaries) {
      const installed = join(target, binary)
      if (!existsSync(installed) || (await stat(installed)).size === 0) {
        throw new InstallError(`${binary} did not land on disk.`, 'checking')
      }
      await makeExecutable(installed)
      if (!(await verifyRuns(installed))) {
        throw new InstallError(
          `${binary} installed but will not run. Antivirus may have quarantined it.`,
          'checking'
        )
      }
    }
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Installing from a hand-downloaded zip — the offline escape hatch. */
export async function installFromFile(
  spec: ComponentSpec,
  zipPath: string,
  target: string
): Promise<void> {
  await mkdir(target, { recursive: true })
  const scratch = await mkdtemp(join(tmpdir(), 'tizo-'))
  try {
    const unpacked = join(scratch, 'unpacked')
    await mkdir(unpacked, { recursive: true })
    await extract(zipPath, { dir: unpacked })
    for (const binary of spec.binaries) {
      const found = await findFile(unpacked, binary)
      if (!found) throw new InstallError(`${binary} was missing from that archive.`, 'extracting')
      await copyFile(found, join(target, binary))
      await makeExecutable(join(target, binary))
      if (!(await verifyRuns(join(target, binary)))) {
        throw new InstallError(`${binary} will not run.`, 'checking')
      }
    }
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
  }
}
