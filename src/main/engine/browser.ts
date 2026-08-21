/**
 * Experimental: find media by letting the page's own player run.
 *
 * The last rung. A regex over HTML cannot see a source that JavaScript builds at
 * runtime, and a growing share of players do exactly that — a video.js instance
 * with `preload: "none"` and no source in the markup, filled in by a script from
 * another origin. Reversing that script per site is a treadmill; letting it run
 * and watching what it fetches is not.
 *
 * What comes back is the URL *and the headers the player actually sent*. That
 * second part is what makes it useful: these CDNs routinely 403 a request that
 * arrives without the right Referer or Origin, so a URL alone reproduces the
 * failure it was meant to fix.
 *
 * yt-dlp still performs the download. This only discovers.
 */
import { app, BrowserWindow, session } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { classifyMedia } from './media'

/** Media the player asked for, in the order it asked. */
export interface SniffedMedia {
  url: string
  /** Exactly what the player sent, minus hop-by-hop noise. */
  headers: Record<string, string>
  isManifest: boolean
}

function score(media: SniffedMedia): number {
  // A manifest describes every quality; a lone mp4 is whatever the player chose.
  // Preferring it means the format picker has something to offer.
  return media.isManifest ? 2 : 1
}

/**
 * Headers worth replaying. An allow-list, not a block-list: everything else a
 * browser sends is either irrelevant or hop-by-hop, and a stray `host` or
 * `content-length` copied onto a different request breaks it.
 */
const REPLAY = new Set(['referer', 'origin', 'user-agent', 'cookie', 'authorization'])

export interface SniffOptions {
  /** Sent as the referer for the top-level load. Many embeds require it. */
  referer?: string | undefined
  /** Give up after this long. A slow player missed is better than a hang. */
  timeoutMs?: number
}

/**
 * Loads a page in a hidden window and returns the media it fetched.
 *
 * The window is sandboxed, has no node integration, uses a throwaway in-memory
 * partition, and cannot open new windows — it renders hostile pages by design,
 * so none of that is optional. The partition is per call rather than persistent
 * so nothing a page stores outlives the probe.
 */
export async function sniffInProcess(
  pageUrl: string,
  options: SniffOptions = {}
): Promise<SniffedMedia[]> {
  const timeoutMs = options.timeoutMs ?? 25_000

  // No `persist:` prefix — this session lives in memory and dies with the call.
  const partition = `tizo-sniff-${randomUUID()}`
  const ses = session.fromPartition(partition)

  const found = new Map<string, SniffedMedia>()
  const sentHeaders = new Map<string, Record<string, string>>()

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(details.requestHeaders)) {
      if (REPLAY.has(key.toLowerCase())) headers[key] = String(value)
    }
    sentHeaders.set(details.url, headers)
    callback({ requestHeaders: details.requestHeaders })
  })

  const remember = (url: string, contentType: string | null): void => {
    if (found.has(url)) return
    const verdict = classifyMedia(url, contentType)
    if (!verdict) return
    found.set(url, { url, headers: sentHeaders.get(url) ?? {}, isManifest: verdict.isManifest })
  }

  // Both hooks: a signed URL often carries no extension, so the response type is
  // the only tell — but a segment request may never complete before we give up,
  // so the request side has to be watched as well.
  ses.webRequest.onSendHeaders((details) => {
    if (process.env['TIZO_SNIFF_DEBUG']) console.error('REQ', details.url.slice(0, 110))
    remember(details.url, null)
  })
  ses.webRequest.onHeadersReceived((details, callback) => {
    const type = details.responseHeaders?.['content-type']?.[0] ?? null
    if (process.env['TIZO_SNIFF_DEBUG']) console.error('RES', type, details.url.slice(0, 90))
    remember(details.url, type)
    callback({ responseHeaders: details.responseHeaders })
  })

  /*
   * Block third-party sub-frames.
   *
   * Two reasons, and the first is not optional: these pages carry dozens of ad
   * and popunder frames, and rendering them produced repeated
   * `origin.GetTupleOrPrecursorTupleIfOpaque()` CHECK failures that abort the
   * process. Second, ad frames load their own video, which would otherwise rank
   * as a candidate and hand back a preroll instead of the feature.
   *
   * The player itself is either the top-level document (an embed URL, which is
   * how deep.ts calls this) or a same-site frame, so neither is affected.
   */
  let pageHost = ''
  try {
    pageHost = new URL(pageUrl).hostname.replace(/^www\./, '')
  } catch {
    /* a malformed URL simply blocks nothing */
  }

  ses.webRequest.onBeforeRequest((details, callback) => {
    if (details.resourceType !== 'subFrame') return callback({})
    try {
      const host = new URL(details.url).hostname.replace(/^www\./, '')
      const sameSite = host === pageHost || host.endsWith(`.${pageHost}`)
      return callback({ cancel: !sameSite })
    } catch {
      return callback({ cancel: true })
    }
  })

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false
    }
  })

  // These pages are built to open popunders. Denying is both a courtesy and a
  // correctness matter: a popup would load its own media and pollute the result.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  ses.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))

  try {
    await new Promise<void>((resolve) => {
      const done = (): void => resolve()
      const timer = setTimeout(done, timeoutMs)

      win.webContents.once('did-finish-load', () => {
        // A manifest is usually requested a moment after load, and often only
        // once something calls play(). Nudge it, then wait out the rest of the
        // budget rather than resolving immediately.
        void kick(win).catch(() => undefined)
      })
      win.webContents.once('did-fail-load', () => {
        clearTimeout(timer)
        done()
      })

      // A renderer that dies takes any further discovery with it, so stop now
      // and report whatever was already seen rather than waiting out the budget.
      win.webContents.once('render-process-gone', () => {
        clearTimeout(timer)
        done()
      })

      void win
        .loadURL(pageUrl, options.referer ? { httpReferrer: options.referer } : undefined)
        .catch(() => {
          clearTimeout(timer)
          done()
        })
    })
  } finally {
    if (!win.isDestroyed()) win.destroy()
    // Frees the in-memory partition rather than leaving it for the app's life.
    await ses.clearStorageData().catch(() => undefined)
  }

  return [...found.values()].sort((a, b) => score(b) - score(a))
}

/**
 * Asks every player on the page to start.
 *
 * `preload: "none"` means nothing is fetched until playback begins, so without
 * this the window loads, downloads no media, and the probe reports finding
 * nothing on a page that works fine for a person. Sub-frames are included
 * because the player is usually in one.
 */
async function kick(win: BrowserWindow): Promise<void> {
  const script = `
    (() => {
      const go = (doc) => {
        doc.querySelectorAll('video,audio').forEach((el) => {
          try { el.muted = true; const p = el.play(); if (p && p.catch) p.catch(() => {}) } catch {}
        })
        // Sites that overlay a poster: the real <video> only appears after this.
        doc.querySelectorAll(
          '.vjs-big-play-button,.jw-icon-display,[class*="play-button"],[class*="playButton"],[id*="play"]'
        ).forEach((el) => { try { el.click() } catch {} })
      }
      go(document)
      return true
    })()
  `
  await win.webContents.executeJavaScript(script, true).catch(() => undefined)

  for (const frame of win.webContents.mainFrame.framesInSubtree) {
    if (frame === win.webContents.mainFrame) continue
    await frame.executeJavaScript(script, true).catch(() => undefined)
  }
}


/** Marks the one line of stdout the child uses to hand back its result. */
export const SNIFF_MARKER = '@@TIZOSNIFF@@'
export const SNIFF_URL_FLAG = '--tizo-sniff-url='
export const SNIFF_REFERER_FLAG = '--tizo-sniff-referer='

/**
 * Runs a sniff in a child Electron process.
 *
 * Not an optimisation — a correctness requirement. Rendering a hostile page can
 * abort the browser process outright: a real aggregator produced repeated
 * `site_info.cc … origin.GetTupleOrPrecursorTupleIfOpaque().IsValid()` CHECK
 * failures and killed the run. A Chromium CHECK is an abort, not an exception,
 * so it cannot be caught in-process and try/catch buys nothing. Doing this in
 * the main process would mean one bad page takes down the app and every queued
 * download with it.
 *
 * So the window lives in a child, and a child that dies for any reason — crash,
 * timeout, garbage on stdout — is simply "found nothing". That is a result the
 * caller already knows how to handle.
 */
export async function sniffMedia(
  pageUrl: string,
  options: SniffOptions = {}
): Promise<SniffedMedia[]> {
  const timeoutMs = options.timeoutMs ?? 25_000

  const args: string[] = []
  // In development `execPath` is electron.exe, which needs the app directory
  // before its own flags; a packaged build is the app and takes them directly.
  if (!app.isPackaged) args.push(app.getAppPath())
  args.push(`${SNIFF_URL_FLAG}${pageUrl}`)
  if (options.referer) args.push(`${SNIFF_REFERER_FLAG}${options.referer}`)

  return new Promise<SniffedMedia[]>((resolve) => {
    let settled = false
    const finish = (value: SniffedMedia[]): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!child.killed) child.kill()
      resolve(value)
    }

    const child = spawn(process.execPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        // Would start the child as plain Node, where there is no browser at all.
        ELECTRON_RUN_AS_NODE: undefined
      } as NodeJS.ProcessEnv
    })

    // Generous slack over the child's own budget: it should stop itself first,
    // and this only catches a child that has stopped responding entirely.
    const timer = setTimeout(() => finish([]), timeoutMs + 15_000)

    let out = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      // Cheap guard against a child that decides to print a page to stdout.
      if (out.length > 4_000_000) finish([])
    })

    child.on('error', () => finish([]))

    child.on('exit', () => {
      const line = out.split(/\r?\n/).find((l) => l.startsWith(SNIFF_MARKER))
      if (!line) return finish([])
      try {
        finish(JSON.parse(line.slice(SNIFF_MARKER.length)) as SniffedMedia[])
      } catch {
        finish([])
      }
    })
  })
}

/**
 * Child-process entry. Returns false when this process is a normal app launch.
 *
 * Called before anything else in main, because a sniff child must not take the
 * single-instance lock, open the real window, or register IPC.
 */
export function sniffChildTarget(argv: string[]): { url: string; referer?: string } | null {
  const urlArg = argv.find((a) => a.startsWith(SNIFF_URL_FLAG))
  if (!urlArg) return null
  const refArg = argv.find((a) => a.startsWith(SNIFF_REFERER_FLAG))
  const referer = refArg?.slice(SNIFF_REFERER_FLAG.length)
  return { url: urlArg.slice(SNIFF_URL_FLAG.length), ...(referer ? { referer } : {}) }
}

/** Runs the sniff and reports on stdout. Only ever called in a child. */
export async function runSniffChild(target: { url: string; referer?: string }): Promise<void> {
  let found: SniffedMedia[] = []
  try {
    found = await sniffInProcess(target.url, { referer: target.referer })
  } catch {
    found = []
  }
  await new Promise<void>((resolve) => {
    // Waiting for the flush callback matters: exiting immediately after a write
    // truncates it, which showed up as a child that "found nothing" every time.
    process.stdout.write(`${SNIFF_MARKER}${JSON.stringify(found)}\n`, () => resolve())
  })
}
