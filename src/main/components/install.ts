import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, rm, readdir, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import extract from 'extract-zip'
import { binDir } from '../paths'
import { fetchFile, type FetchProgress } from './fetcher'
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
  const args = basename(exePath).toLowerCase().startsWith('ffmpeg') ? ['-version'] : ['--version']
  try {
    await execFileAsync(exePath, args, { timeout: 20_000, windowsHide: true })
    return true
  } catch {
    return false
  }
}

export class InstallError extends Error {
  constructor(
    message: string,
    readonly stage: InstallProgress['stage']
  ) {
    super(message)
    this.name = 'InstallError'
  }
}

export async function installComponent(
  spec: ComponentSpec,
  onProgress: (progress: InstallProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const target = binDir()
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
export async function installFromFile(spec: ComponentSpec, zipPath: string): Promise<void> {
  const target = binDir()
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
      if (!(await verifyRuns(join(target, binary)))) {
        throw new InstallError(`${binary} will not run.`, 'checking')
      }
    }
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
  }
}
