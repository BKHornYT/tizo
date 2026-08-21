/**
 * Fetching a page as HTML, including pages that refuse a plain request.
 *
 * Node's `fetch` cannot fake a TLS fingerprint, so a Cloudflare-walled page
 * answers it with 403 while yt-dlp walks straight through — it bundles
 * curl_cffi. That gap was invisible until a walled aggregator turned up: the
 * embed finder could not read the page, so it never saw an iframe it would
 * happily have followed, and the site looked unsupported for a reason that had
 * nothing to do with its player.
 *
 * The plain fetch stays first. It is far faster, it is what almost every page
 * needs, and spawning a process per page would be a poor trade for the few that
 * are walled.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveYtdlp } from './binaries'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** Enough of a page to reach any inline player, without holding a huge one. */
const MAX_BYTES = 4_000_000

/** Statuses where a real browser client is worth trying. */
const WALLED = new Set([403, 429, 503])

function isHtml(contentType: string | null): boolean {
  return /text\/html|application\/xhtml/i.test(contentType ?? '')
}

/**
 * Fetches through yt-dlp, which impersonates a browser down to the TLS
 * handshake.
 *
 * `--write-pages` drops the fetched page beside the process, so it runs in a
 * throwaway directory and the file is read back from there. It writes the page
 * even when extraction fails, which is exactly the case this exists for: we want
 * the HTML precisely because yt-dlp could not do anything with the URL.
 */
async function fetchImpersonated(pageUrl: string): Promise<string | null> {
  const bin = await resolveYtdlp()
  if (!bin.found || !bin.path) return null

  const dir = await mkdtemp(join(tmpdir(), 'tizo-page-')).catch(() => null)
  if (!dir) return null

  try {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(
        bin.path!,
        [
          '--ignore-config',
          '--no-warnings',
          '--skip-download',
          '--write-pages',
          '--impersonate',
          'chrome',
          pageUrl
        ],
        { cwd: dir, windowsHide: true, stdio: 'ignore' }
      )
      const timer = setTimeout(() => {
        child.kill()
        resolve(false)
      }, 45_000)
      // The exit code is ignored on purpose: "Unsupported URL" is a failure for
      // yt-dlp and a success for us, because the page was still written.
      child.on('exit', () => {
        clearTimeout(timer)
        resolve(true)
      })
      child.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
    })
    if (!ok) return null

    const files = await readdir(dir)
    const page = files.find((f) => f.endsWith('.dump') || f.endsWith('.html'))
    if (!page) return null

    return (await readFile(join(dir, page), 'utf8')).slice(0, MAX_BYTES)
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Fetches a page as HTML, or null.
 *
 * Shared by the page scanner and the embed finder so both see identical markup —
 * a site serving them different pages would make the two disagree for reasons
 * nobody could reproduce.
 */
export async function fetchHtml(pageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(pageUrl, {
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000)
    })

    if (response.ok && isHtml(response.headers.get('content-type'))) {
      return (await response.text()).slice(0, MAX_BYTES)
    }
    // A wall, rather than a missing page: worth the slower route.
    if (WALLED.has(response.status)) return fetchImpersonated(pageUrl)
    return null
  } catch {
    // A refused or reset connection is also how some walls answer.
    return fetchImpersonated(pageUrl)
  }
}
