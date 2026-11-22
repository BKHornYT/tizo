/**
 * Signing in to sites: rung 1 of docs/browser-engine.md.
 *
 * The user signs in by hand in a visible window running our own Chromium. When
 * they finish, we copy that window's cookies into an encrypted store. Downloads
 * from that site, and only that site, then hand yt-dlp a temporary cookie file
 * that is deleted as soon as the run ends. Nothing reads another browser's
 * cookies, which is blocked on Windows anyway and looks like an infostealer to
 * antivirus.
 *
 * Why not just keep a persistent browser partition: Electron leaves Chromium's
 * cookie encryption off unless the `EnableCookieEncryption` fuse is flipped
 * (it is not, in this build), so a `persist:` partition would keep sessions in
 * plain SQLite next to the app data. Instead the window uses an in-memory
 * partition, and the store is encrypted with `safeStorage` (DPAPI on Windows,
 * the keyring on Linux). When safeStorage only offers its plain-text fallback,
 * sign-in is refused rather than storing a session unprotected.
 *
 * Sessions must never reach feedback or telemetry. Neither path reads anything
 * from here, and feedback.ts strips cookie-file paths from error text as well.
 */
import { app, BrowserWindow, safeStorage, session, type Cookie } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dataDir } from '../paths'
import { liveCookies, loginUrlFor, looksSignedIn, siteKeyOf, toNetscape, type StoredCookie } from '../../shared/sites'
import type { SignInResult, SignInState, SignedInSite } from '../../shared/types'

interface Store {
  version: 1
  noticeSeen: boolean
  sites: Record<string, { signedInAt: string; confirmed: boolean; cookies: StoredCookie[] }>
}

const EMPTY: Store = { version: 1, noticeSeen: false, sites: {} }

function storePath(): string {
  return join(dataDir(), 'signins.bin')
}

/** Encryption that actually protects something; the plain-text fallback does not. */
export function encryptionAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform === 'linux') {
    try {
      return safeStorage.getSelectedStorageBackend() !== 'basic_text'
    } catch {
      return false
    }
  }
  return true
}

/**
 * The store, or an empty one. A file that will not decrypt (copied from
 * another Windows account or machine, e.g. a portable install on a USB stick)
 * simply reads as "signed in nowhere": DPAPI binds it to the user who wrote it.
 */
function load(): Store {
  const file = storePath()
  if (!existsSync(file) || !encryptionAvailable()) return { ...EMPTY, sites: {} }
  try {
    const parsed = JSON.parse(safeStorage.decryptString(readFileSync(file))) as Store
    if (parsed?.version !== 1 || typeof parsed.sites !== 'object') return { ...EMPTY, sites: {} }
    return parsed
  } catch {
    return { ...EMPTY, sites: {} }
  }
}

function save(store: Store): void {
  if (!encryptionAvailable()) throw new Error('No secure storage on this system.')
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(storePath(), safeStorage.encryptString(JSON.stringify(store)), { mode: 0o600 })
}

export function signInState(): SignInState {
  const store = load()
  const sites: SignedInSite[] = Object.entries(store.sites)
    .map(([site, s]) => ({ site, signedInAt: s.signedInAt, confirmed: s.confirmed }))
    .sort((a, b) => a.site.localeCompare(b.site))
  return { available: encryptionAvailable(), noticeSeen: store.noticeSeen, sites }
}

export function acknowledgeNotice(): SignInState {
  if (encryptionAvailable()) {
    const store = load()
    store.noticeSeen = true
    save(store)
  }
  return signInState()
}

export function signOut(site: string): SignInState {
  if (encryptionAvailable()) {
    const store = load()
    delete store.sites[site]
    save(store)
  }
  return signInState()
}

/** The site a link belongs to, for the UI's "Sign in to …" button. */
export function siteFor(url: string): string | null {
  return siteKeyOf(url)
}

/**
 * Electron's default user agent names Electron and the app. Some sign-in pages
 * (Google's most of all) refuse a browser that admits to being embedded, so
 * the window presents itself as the Chrome it really is.
 */
function plainChromeAgent(): string {
  return app.userAgentFallback
    .replace(/\s?Electron\/\S+/i, '')
    .replace(new RegExp(`\\s?${app.getName().replace(/[^A-Za-z0-9]/g, '.')}\\/\\S+`, 'i'), '')
    .replace(/\s?tizo\/\S+/i, '')
}

function toStored(c: Cookie): StoredCookie {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain ?? '',
    path: c.path ?? '/',
    secure: c.secure ?? false,
    httpOnly: c.httpOnly ?? false,
    hostOnly: c.hostOnly ?? false,
    ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate } : {})
  }
}

let open: { site: string; win: BrowserWindow } | null = null

/** Closes the open sign-in window, which then saves (the "Done" button). */
export function finishSignIn(): void {
  if (open && !open.win.isDestroyed()) open.win.close()
}

/** Closes the open sign-in window without saving. */
let discard = false
export function cancelSignIn(): void {
  discard = true
  finishSignIn()
}

/**
 * Opens the sign-in window for a site and resolves when it closes.
 *
 * The window is sandboxed, has no preload and no node, uses a fresh in-memory
 * partition shared with nothing (not the main window, not the discovery
 * windows), refuses every permission prompt and every file download. Popups
 * stay allowed, because "Sign in with Google/Apple" opens one, and inherit the
 * same locked-down session.
 */
export async function signIn(rawSite: string, parent: BrowserWindow | null): Promise<SignInResult> {
  const site = siteKeyOf(rawSite)
  if (!site) return { ok: false, reason: 'bad-site' }
  if (!encryptionAvailable()) return { ok: false, reason: 'unavailable' }
  if (open && !open.win.isDestroyed()) {
    open.win.focus()
    return { ok: false, reason: 'busy' }
  }

  const partition = `tizo-signin-${randomUUID()}`
  const ses = session.fromPartition(partition)
  ses.setUserAgent(plainChromeAgent())
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.on('will-download', (event) => event.preventDefault())

  // Signing in again starts from the saved session, so the page shows the
  // account that is signed in rather than an empty form.
  const previous = load().sites[site]
  for (const c of liveCookies(previous?.cookies ?? [])) {
    const host = c.domain.replace(/^\./, '')
    await ses.cookies
      .set({
        url: `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`,
        name: c.name,
        value: c.value,
        ...(c.hostOnly ? {} : { domain: c.domain }),
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate } : {})
      })
      .catch(() => undefined) // one odd cookie should not block the window
  }

  const prefs = {
    partition,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    spellcheck: false
  } as const

  const win = new BrowserWindow({
    width: 520,
    height: 760,
    title: `Sign in to ${site} — click Done in Tizo when finished`,
    autoHideMenuBar: true,
    ...(parent && !parent.isDestroyed() ? { parent } : {}),
    webPreferences: prefs
  })
  win.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: prefs }
  }))
  // The page's own <title> would replace ours, and ours says how to finish.
  win.on('page-title-updated', (event) => event.preventDefault())

  open = { site, win }
  discard = false
  void win.loadURL(loginUrlFor(site)).catch(() => undefined)

  return new Promise<SignInResult>((resolve) => {
    let cookies: StoredCookie[] = []
    let captured = false
    // The first close is held back until the session's cookies are read, then
    // the window is destroyed (which does not fire `close` again).
    win.on('close', (event) => {
      if (captured) return
      event.preventDefault()
      void ses.cookies
        .get({})
        .then((all) => {
          cookies = all.map(toStored)
        })
        .catch(() => undefined)
        .finally(() => {
          captured = true
          if (!win.isDestroyed()) win.destroy()
        })
    })
    win.on('closed', () => {
      open = null
      void ses.clearStorageData().catch(() => undefined)
      if (discard) return resolve({ ok: false, reason: 'cancelled' })

      const confirmed = looksSignedIn(site, cookies)
      if (confirmed === false || cookies.length === 0) {
        return resolve({ ok: false, reason: 'not-signed-in', site })
      }
      try {
        const store = load()
        store.sites[site] = { signedInAt: new Date().toISOString(), confirmed: confirmed === true, cookies }
        save(store)
      } catch {
        return resolve({ ok: false, reason: 'unavailable' })
      }
      resolve({ ok: true, site, confirmed: confirmed === true })
    })
  })
}

/**
 * A temporary cookie file for a yt-dlp run on `url`, or null when the user is
 * not signed in to that site. Call `cleanup` when the run ends, whatever the
 * outcome; the file is written owner-only and lives in the system temp folder,
 * never next to the downloads.
 */
export function cookieFileFor(url: string): { path: string; cleanup: () => void } | null {
  const site = siteKeyOf(url)
  if (!site) return null
  let entry: Store['sites'][string] | undefined
  try {
    entry = load().sites[site]
  } catch {
    return null
  }
  if (!entry || entry.cookies.length === 0) return null

  const path = join(tmpdir(), `tizo-cookies-${randomUUID()}.txt`)
  try {
    writeFileSync(path, toNetscape(entry.cookies), { mode: 0o600 })
  } catch {
    return null
  }
  let gone = false
  return {
    path,
    cleanup: () => {
      if (gone) return
      gone = true
      try {
        rmSync(path, { force: true })
      } catch {
        /* temp folder; nothing more to do */
      }
    }
  }
}
