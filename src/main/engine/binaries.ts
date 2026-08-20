import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { binDir, dataDir, isPortable } from '../paths'
import type { BinaryStatus, EngineStatus } from '../../shared/types'

const execFileAsync = promisify(execFile)

// Bare names must carry .exe: Node's spawn does not apply PATHEXT on Windows,
// so 'yt-dlp' would simply not resolve even with yt-dlp.exe on PATH.
const YTDLP_EXE = 'yt-dlp.exe'
const FFMPEG_EXE = 'ffmpeg.exe'

async function readVersion(exe: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(exe, args, {
      timeout: 15_000,
      windowsHide: true
    })
    return stdout.trim().split('\n')[0]?.trim() || null
  } catch {
    return null
  }
}

/**
 * Resolution order: the binary we manage, then — in development only — whatever
 * is on PATH. Packaged builds deliberately refuse the PATH fallback: a shipped
 * app must run the version setup verified, not whatever the user happens to
 * have lying around.
 */
async function resolve(
  managedName: string,
  systemName: string,
  versionArgs: string[],
  parse: (raw: string) => string
): Promise<BinaryStatus> {
  const managed = join(binDir(), managedName)
  if (existsSync(managed)) {
    const raw = await readVersion(managed, versionArgs)
    if (raw) return { found: true, path: managed, source: 'managed', version: parse(raw) }
  }

  if (!app.isPackaged) {
    const raw = await readVersion(systemName, versionArgs)
    if (raw) return { found: true, path: systemName, source: 'system', version: parse(raw) }
  }

  return { found: false, path: null, source: 'missing', version: null }
}

export function resolveYtdlp(): Promise<BinaryStatus> {
  return resolve(YTDLP_EXE, YTDLP_EXE, ['--version'], (raw) => raw)
}

export function resolveFfmpeg(): Promise<BinaryStatus> {
  return resolve(FFMPEG_EXE, FFMPEG_EXE, ['-version'], (raw) => {
    // "ffmpeg version 9.0-full_build-www.gyan.dev Copyright ..." -> "9.0-full_build..."
    const m = /ffmpeg version (\S+)/i.exec(raw)
    return m?.[1] ?? raw
  })
}

export async function engineStatus(): Promise<EngineStatus> {
  const [ytdlp, ffmpeg] = await Promise.all([resolveYtdlp(), resolveFfmpeg()])
  return { ytdlp, ffmpeg, dataDir: dataDir(), portable: isPortable() }
}
