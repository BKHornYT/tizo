import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, extname } from 'node:path'
import { resolveFfmpeg, resolveYtdlp } from './binaries'
import { binaryMissing, classifyError } from './errors'
import { buildDownloadArgs, profileFor, FILE_MARK, PROGRESS_MARK, type SiteTuning } from './args'
import { loadSettings } from '../store/settings'
import { loadManifest } from '../components/manifest'
import type { AudioFormat, EngineError, ProgressEvent, Settings } from '../../shared/types'

interface RawProgress {
  status?: string
  downloaded_bytes?: number | null
  total_bytes?: number | null
  total_bytes_estimate?: number | null
  speed?: number | null
  eta?: number | null
  filename?: string | null
  _percent?: number | null
}

export interface DownloadRequest {
  url: string
  /** A yt-dlp selector expression, from FormatOption.id. */
  format: string
  needsFfmpeg: boolean
  /** Overrides the configured output folder for this one job. */
  outDir?: string
  /** Media URL found by scanning the page; downloaded instead of `url`. */
  directUrl?: string
  /** The probe only got through with browser impersonation; do the same here. */
  impersonate?: boolean
  /** Set after the user has answered a file-exists prompt. */
  resolveConflict?: 'overwrite' | 'rename'
  /** From the chosen row: extract audio into this container instead of video. */
  extractAudio?: AudioFormat
  /** Subtitle languages chosen for this item. */
  subLangs?: string[]
  /**
   * Page to send as the referer. Set when the target is an embedded player
   * found on another page — those hosts routinely 403 without it.
   */
  referer?: string
  /** Headers captured from a watched player, replayed on the download. */
  headers?: Record<string, string>
}

export type StartResult =
  | { ok: true; jobId: string }
  | { ok: false; error: EngineError }
  | { ok: false; conflict: { path: string } }

interface Job {
  child: ChildProcess
  cancelled: boolean
}

const jobs = new Map<string, Job>()

/**
 * yt-dlp spawns ffmpeg as a child. Killing only yt-dlp orphans that ffmpeg,
 * which keeps writing to the output file — so the whole tree has to go.
 */
function killTree(pid: number | undefined): void {
  if (!pid) return
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
}

/** Splits a stream into whole lines, holding the trailing partial across chunks. */
function lineReader(onLine: (line: string) => void): (chunk: Buffer) => void {
  let buffer = ''
  return (chunk: Buffer): void => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  }
}

/**
 * Asks yt-dlp what it would name the file, without downloading it.
 *
 * Guessing the name ourselves is not viable — yt-dlp applies its own filename
 * sanitisation and picks the extension from the chosen format. Only yt-dlp
 * knows the answer, so we ask it rather than approximate.
 */
async function predictPath(
  exe: string,
  args: string[]
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      exe,
      [...args.slice(0, -1), '--skip-download', '--print', 'filename', args[args.length - 1]!],
      { timeout: 60_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        const line = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith(FILE_MARK) && !l.startsWith(PROGRESS_MARK))
          .pop()
        resolve(line || null)
      }
    )
  })
}

/** " (2)", " (3)", … until nothing is in the way. */
function freeSuffix(predicted: string): string {
  if (!existsSync(predicted)) return ''
  const ext = extname(predicted)
  const stem = predicted.slice(0, predicted.length - ext.length)
  for (let n = 2; n < 1000; n++) {
    if (!existsSync(`${stem} (${n})${ext}`)) return ` (${n})`
  }
  return ` (${Date.now()})`
}

async function siteProfile(url: string): Promise<SiteTuning | undefined> {
  try {
    // Never refresh here: a download must not wait on a registry round trip.
    const { manifest } = await loadManifest({ refresh: false })
    return profileFor(url, manifest.siteProfiles)
  } catch {
    return undefined
  }
}

export async function startDownload(
  req: DownloadRequest,
  emit: (event: ProgressEvent) => void
): Promise<StartResult> {
  const ytdlp = await resolveYtdlp()
  if (!ytdlp.found || !ytdlp.path) return { ok: false, error: binaryMissing('yt-dlp') }

  const ffmpeg = await resolveFfmpeg()
  // The capability gate: refuse before spawning rather than letting yt-dlp fail
  // halfway through, so the UI can offer the HQ pack with nothing half-written.
  if ((req.needsFfmpeg || req.extractAudio) && !ffmpeg.found) {
    return {
      ok: false,
      error: {
        code: 'FFMPEG_REQUIRED',
        message: req.extractAudio
          ? 'Converting audio needs the HQ pack, which is not installed yet.'
          : 'This quality needs the HQ pack, which is not installed yet.'
      }
    }
  }

  const settings: Settings = await loadSettings()
  const outDir = req.outDir ?? settings.outputDir
  mkdirSync(outDir, { recursive: true })

  // A scraped media URL is fetched directly, with the page it came from sent as
  // the referer. Site tuning still keys off the page, not the CDN host.
  const target = req.directUrl ?? req.url
  // An explicit referer wins: with an embedded player the page to cite is the
  // one the player was found on, which is no longer `req.url`.
  const referer = req.referer ?? (req.directUrl ? req.url : undefined)

  const profile = await siteProfile(req.url)
  const ffmpegDir = ffmpeg.path && ffmpeg.source === 'managed' ? dirname(ffmpeg.path) : null

  const effectiveRule = req.resolveConflict ?? settings.onFileExists
  const base = {
    url: target,
    format: req.format,
    outDir,
    needsFfmpeg: req.needsFfmpeg,
    profile,
    ffmpegDir,
    referer,
    impersonate: req.impersonate ?? false,
    extractAudio: req.extractAudio,
    subLangs: req.subLangs ?? [],
    headers: req.headers
  }

  let collisionSuffix: string | undefined
  if (effectiveRule === 'rename' || effectiveRule === 'ask') {
    const predicted = await predictPath(
      ytdlp.path,
      buildDownloadArgs({ ...base, settings })
    )
    if (predicted && existsSync(predicted)) {
      if (effectiveRule === 'ask') return { ok: false, conflict: { path: predicted } }
      collisionSuffix = freeSuffix(predicted)
    }
  }

  const args = buildDownloadArgs({
    ...base,
    settings: {
      ...settings,
      onFileExists: effectiveRule === 'ask' ? 'skip-if-same' : effectiveRule
    },
    collisionSuffix
  })

  const jobId = randomUUID()
  const child = spawn(ytdlp.path, args, { windowsHide: true })
  jobs.set(jobId, { child, cancelled: false })

  let stderr = ''
  let outputPath: string | null = null
  let lastFilename: string | null = null

  const handleStdout = lineReader((line) => {
    if (line.startsWith(PROGRESS_MARK)) {
      let raw: RawProgress
      try {
        raw = JSON.parse(line.slice(PROGRESS_MARK.length)) as RawProgress
      } catch {
        return // a torn or non-finite JSON line is not worth killing the job over
      }
      const total = raw.total_bytes ?? raw.total_bytes_estimate ?? null
      const downloaded = raw.downloaded_bytes ?? null
      lastFilename = raw.filename ?? lastFilename
      emit({
        jobId,
        status: raw.status === 'finished' ? 'processing' : 'downloading',
        percent: raw._percent ?? (total && downloaded ? (downloaded / total) * 100 : null),
        downloadedBytes: downloaded,
        totalBytes: total,
        speed: raw.speed ?? null,
        eta: raw.eta ?? null,
        filename: lastFilename
      })
      return
    }

    if (line.startsWith(FILE_MARK)) {
      outputPath = line.slice(FILE_MARK.length).trim()
      return
    }

    // Post-processing has no progress template of its own; these tags are the
    // only signal that the merge/convert stage is running.
    if (/^\[(Merger|ExtractAudio|VideoConvertor|Fixup\w*|EmbedSubtitle)\]/.test(line)) {
      emit({
        jobId,
        status: 'processing',
        percent: null,
        downloadedBytes: null,
        totalBytes: null,
        speed: null,
        eta: null,
        filename: lastFilename
      })
    }
  })

  child.stdout?.on('data', handleStdout)
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
    if (stderr.length > 64_000) stderr = stderr.slice(-32_000)
  })

  const done = (event: Omit<ProgressEvent, 'jobId'>): void => emit({ jobId, ...event })

  child.on('error', (err) => {
    jobs.delete(jobId)
    done({
      status: 'error',
      percent: null,
      downloadedBytes: null,
      totalBytes: null,
      speed: null,
      eta: null,
      filename: lastFilename,
      error: { code: 'UNKNOWN', message: err.message }
    })
  })

  child.on('close', (code) => {
    const job = jobs.get(jobId)
    jobs.delete(jobId)

    const blank = {
      percent: null,
      downloadedBytes: null,
      totalBytes: null,
      speed: null,
      eta: null,
      filename: lastFilename
    }

    if (job?.cancelled) {
      done({ status: 'cancelled', ...blank })
      return
    }
    if (code === 0) {
      done({
        ...blank,
        status: 'done',
        percent: 100,
        ...(outputPath ? { outputPath } : {})
      })
      return
    }
    done({ ...blank, status: 'error', error: classifyError(stderr, req.url) })
  })

  return { ok: true, jobId }
}

export function cancelDownload(jobId: string): boolean {
  const job = jobs.get(jobId)
  if (!job) return false
  job.cancelled = true
  killTree(job.child.pid)
  return true
}

/** Called on quit — a surviving yt-dlp child would keep writing after we exit. */
export function cancelAll(): void {
  for (const [, job] of jobs) {
    job.cancelled = true
    killTree(job.child.pid)
  }
  jobs.clear()
}
