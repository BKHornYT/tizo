import { execFile } from 'node:child_process'
import { resolveYtdlp } from './binaries'
import { binaryMissing, classifyError } from './errors'
import type { MediaInfo, PlaylistInfo, Result } from '../../shared/types'
import { listAllFormats, shapeFormats, type RawFormat } from './formats'

/** Entries beyond this are ignored — a channel can hold tens of thousands. */
const PLAYLIST_CAP = 500

interface RawInfo {
  id: string
  title?: string
  uploader?: string | null
  channel?: string | null
  duration?: number | null
  thumbnail?: string | null
  webpage_url?: string
  extractor_key?: string
  extractor?: string
  formats?: RawFormat[]
}

export async function inspectPlaylist(url: string): Promise<Result<PlaylistInfo | null>> {
  const bin = await resolveYtdlp()
  if (!bin.found || !bin.path) return { ok: false, error: binaryMissing('yt-dlp') }

  if (/[?&]v=/.test(url)) return { ok: true, value: null }

  const args = [
    '--ignore-config',
    '-J',
    '--flat-playlist',
    '--no-warnings',
    '--playlist-items',
    `1:${PLAYLIST_CAP}`,
    url
  ]

  return new Promise((resolve) => {
    execFile(
      bin.path!,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: 120_000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: classifyError(stderr || String(err), url) })
          return
        }
        try {
          const raw = JSON.parse(stdout) as {
            _type?: string
            title?: string
            playlist_count?: number
            entries?: Array<{ id?: string; url?: string; title?: string; duration?: number | null }>
          }
          if (raw._type !== 'playlist' || !Array.isArray(raw.entries)) {
            resolve({ ok: true, value: null })
            return
          }

          const entries = raw.entries
            .filter((e) => e.url || e.id)
            .map((e) => ({
              id: e.id ?? e.url ?? '',
              url: e.url ?? '',
              title: e.title ?? e.id ?? 'Untitled',
              duration: e.duration ?? null
            }))
            .filter((e) => e.url)

          // A "playlist" of one is just a video with extra steps.
          if (entries.length < 2) {
            resolve({ ok: true, value: null })
            return
          }

          resolve({
            ok: true,
            value: {
              url,
              title: raw.title ?? 'Playlist',
              count: raw.playlist_count ?? entries.length,
              entries
            }
          })
        } catch {
          resolve({ ok: true, value: null })
        }
      }
    )
  })
}

export async function probe(url: string): Promise<Result<MediaInfo>> {
  const bin = await resolveYtdlp()
  if (!bin.found || !bin.path) return { ok: false, error: binaryMissing('yt-dlp') }

  // Phase 1 handles single videos only; playlist expansion lands in Phase 4.
  const args = ['-J', '--no-warnings', '--no-playlist', url]

  return new Promise((resolve) => {
    execFile(
      bin.path!,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: 90_000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: classifyError(stderr || String(err), url) })
          return
        }
        try {
          const info = JSON.parse(stdout) as RawInfo
          resolve({
            ok: true,
            value: {
              id: info.id,
              title: info.title ?? 'Untitled',
              uploader: info.uploader ?? info.channel ?? null,
              duration: info.duration ?? null,
              thumbnail: info.thumbnail ?? null,
              webpageUrl: info.webpage_url ?? url,
              extractor: info.extractor_key ?? info.extractor ?? 'unknown',
              formats: shapeFormats(info.formats ?? []),
              allFormats: listAllFormats(info.formats ?? [])
            }
          })
        } catch {
          resolve({
            ok: false,
            error: {
              code: 'UNKNOWN',
              message: 'The site responded with something we could not read.',
              detail: stdout.slice(0, 2000)
            }
          })
        }
      }
    )
  })
}
