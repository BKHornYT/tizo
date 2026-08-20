import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { resolveFfmpeg, resolveYtdlp } from './binaries'
import { binaryMissing, classifyError } from './errors'
import type { EngineError, ProgressEvent } from '../../shared/types'

const PROGRESS_MARK = '@@TIZO@@'
const FILE_MARK = '@@TIZOFILE@@'

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
  outDir: string
  needsFfmpeg: boolean
}

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
    spawn('taskkill.exe', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
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

export async function startDownload(
  req: DownloadRequest,
  emit: (event: ProgressEvent) => void
): Promise<{ ok: true; jobId: string } | { ok: false; error: EngineError }> {
  const ytdlp = await resolveYtdlp()
  if (!ytdlp.found || !ytdlp.path) return { ok: false, error: binaryMissing('yt-dlp') }

  const ffmpeg = await resolveFfmpeg()
  // The capability gate: refuse before spawning rather than letting yt-dlp fail
  // halfway through, so the UI can offer the HQ pack with nothing half-written.
  if (req.needsFfmpeg && !ffmpeg.found) {
    return {
      ok: false,
      error: {
        code: 'FFMPEG_REQUIRED',
        message: 'This quality needs the HQ pack, which is not installed yet.'
      }
    }
  }

  mkdirSync(req.outDir, { recursive: true })

  const args = [
    // A stray user-level yt-dlp.conf could silently change output paths or
    // formats underneath us. Never inherit it.
    '--ignore-config',
    '--newline',
    '--no-colors',
    '--no-quiet',
    '--no-playlist',
    '--progress-template',
    `download:${PROGRESS_MARK}%(progress)j`,
    '--print',
    `after_move:${FILE_MARK}%(filepath)s`,
    '-f',
    req.format,
    '-P',
    req.outDir,
    // 150 *bytes*, not characters — long unicode titles otherwise blow past
    // Windows' path limit once the folder is prepended.
    '-o',
    '%(title).150B [%(id)s].%(ext)s'
  ]

  if (req.needsFfmpeg) {
    args.push('--merge-output-format', 'mp4')
    if (ffmpeg.path && ffmpeg.source === 'managed') {
      args.push('--ffmpeg-location', dirname(ffmpeg.path))
    }
  }

  args.push(req.url)

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
        percent:
          raw._percent ?? (total && downloaded ? (downloaded / total) * 100 : null),
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

  child.on('error', (err) => {
    jobs.delete(jobId)
    emit({
      jobId,
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

    if (job?.cancelled) {
      emit({
        jobId,
        status: 'cancelled',
        percent: null,
        downloadedBytes: null,
        totalBytes: null,
        speed: null,
        eta: null,
        filename: lastFilename
      })
      return
    }

    if (code === 0) {
      emit({
        jobId,
        status: 'done',
        percent: 100,
        downloadedBytes: null,
        totalBytes: null,
        speed: null,
        eta: null,
        filename: lastFilename,
        ...(outputPath ? { outputPath } : {})
      })
      return
    }

    emit({
      jobId,
      status: 'error',
      percent: null,
      downloadedBytes: null,
      totalBytes: null,
      speed: null,
      eta: null,
      filename: lastFilename,
      error: classifyError(stderr, req.url)
    })
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
