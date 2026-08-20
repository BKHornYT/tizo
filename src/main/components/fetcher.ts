import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface FetchProgress {
  receivedBytes: number
  totalBytes: number | null
  /** Bytes per second, averaged over the last sample window. */
  speed: number | null
}

export interface FetchOptions {
  url: string
  /** Final destination. A `.part` sibling is used while transferring. */
  dest: string
  /** Expected size in bytes, used for progress before the server reports one. */
  expectedSize?: number | null
  /** Lowercase hex sha256. When null, integrity is left to the caller. */
  sha256?: string | null
  onProgress?: (progress: FetchProgress) => void
  signal?: AbortSignal
  /** Total attempts including the first. */
  maxAttempts?: number
}

export class FetchError extends Error {
  // Written out longhand rather than as constructor parameter properties, so
  // this module still runs under `node --experimental-strip-types` — which is
  // what scripts/test-fetcher.ts uses to test it without a build step.
  kind: 'network' | 'http' | 'integrity' | 'aborted'
  retryable: boolean

  constructor(message: string, kind: FetchError['kind'], retryable: boolean) {
    super(message)
    this.name = 'FetchError'
    this.kind = kind
    this.retryable = retryable
  }
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Downloads one file with resume and verification.
 *
 * Resume matters more here than in a normal downloader: setup is mandatory, so a
 * transfer that dies at 80 MB of 92 MB must not start from zero — that is the
 * difference between a retry and a user giving up on the app entirely.
 */
export async function fetchFile(options: FetchOptions): Promise<void> {
  const { url, dest, sha256, onProgress, signal, expectedSize } = options
  const maxAttempts = options.maxAttempts ?? 4
  const partPath = `${dest}.part`

  await mkdir(dirname(dest), { recursive: true })

  let lastError: FetchError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const already = await sizeOf(partPath)
      const headers: Record<string, string> = {}
      if (already > 0) headers['Range'] = `bytes=${already}-`

      const response = await fetch(url, { headers, ...(signal ? { signal } : {}) })

      // A server that ignores our Range header replies 200 with the whole file.
      // Appending to the existing part would corrupt it, so start clean.
      const resuming = response.status === 206
      if (!response.ok) {
        throw new FetchError(
          `Server replied ${response.status}`,
          'http',
          response.status >= 500 || response.status === 429
        )
      }
      if (already > 0 && !resuming) await unlink(partPath).catch(() => undefined)

      const contentLength = Number(response.headers.get('content-length'))
      const totalBytes = Number.isFinite(contentLength)
        ? (resuming ? already : 0) + contentLength
        : (expectedSize ?? null)

      if (!response.body) throw new FetchError('Empty response body', 'network', true)

      let received = resuming ? already : 0
      let windowBytes = 0
      let windowStart = Date.now()
      let speed: number | null = null

      const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
      source.on('data', (chunk: Buffer) => {
        received += chunk.length
        windowBytes += chunk.length
        const elapsed = Date.now() - windowStart
        if (elapsed >= 500) {
          speed = (windowBytes / elapsed) * 1000
          windowBytes = 0
          windowStart = Date.now()
        }
        onProgress?.({ receivedBytes: received, totalBytes, speed })
      })

      await pipeline(
        source,
        createWriteStream(partPath, { flags: resuming ? 'a' : 'w' })
      )

      if (sha256) {
        const actual = await sha256File(partPath)
        if (actual !== sha256.toLowerCase()) {
          // A corrupt part must never be resumed — the bad bytes would persist
          // through every retry. Discard and start over.
          await unlink(partPath).catch(() => undefined)
          throw new FetchError(
            'The downloaded file failed its integrity check.',
            'integrity',
            true
          )
        }
      }

      await rename(partPath, dest)
      onProgress?.({ receivedBytes: received, totalBytes: totalBytes ?? received, speed: null })
      return
    } catch (err) {
      if (signal?.aborted) throw new FetchError('Cancelled', 'aborted', false)

      const error =
        err instanceof FetchError
          ? err
          : new FetchError((err as Error).message || 'Network error', 'network', true)

      lastError = error
      if (!error.retryable || attempt === maxAttempts) throw error

      // Back off so a flaky link or a rate-limited CDN gets room to recover.
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000))
    }
  }

  throw lastError ?? new FetchError('Download failed', 'network', false)
}
