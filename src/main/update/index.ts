import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import electronUpdater from 'electron-updater'
import { binDir, dataDir, isPortable } from '../paths'
import { resolveYtdlp } from '../engine/binaries'
import { installComponent } from '../components/install'
import { findComponent, loadManifest } from '../components/manifest'
import type { AppUpdateState, EngineUpdateState } from '../../shared/types'

const { autoUpdater } = electronUpdater

const SIX_HOURS = 6 * 60 * 60 * 1000
const ONE_WEEK = 7 * 24 * 60 * 60 * 1000

type Emit = (state: { app: AppUpdateState; engine: EngineUpdateState }) => void

let emit: Emit = () => undefined

const appState: AppUpdateState = {
  currentVersion: '0.0.0',
  status: 'idle',
  newVersion: null,
  percent: null,
  error: null,
  canSelfUpdate: false,
  reason: null
}

const engineState: EngineUpdateState = {
  currentVersion: null,
  status: 'idle',
  newVersion: null,
  error: null,
  lastCheckedAt: null
}

export function getUpdateState(): { app: AppUpdateState; engine: EngineUpdateState } {
  return { app: { ...appState }, engine: { ...engineState } }
}

function push(): void {
  emit(getUpdateState())
}

// --- Engine (yt-dlp) channel ------------------------------------------------

interface UpdateMeta {
  lastEngineCheck: number | null
}

async function readMeta(): Promise<UpdateMeta> {
  try {
    return JSON.parse(await readFile(join(dataDir(), 'update.json'), 'utf8')) as UpdateMeta
  } catch {
    return { lastEngineCheck: null }
  }
}

async function writeMeta(meta: UpdateMeta): Promise<void> {
  await mkdir(dataDir(), { recursive: true }).catch(() => undefined)
  await writeFile(join(dataDir(), 'update.json'), JSON.stringify(meta), 'utf8').catch(
    () => undefined
  )
}

/**
 * Updates the yt-dlp binary independently of the app.
 *
 * This is the channel that actually keeps the app working: YouTube and friends
 * break yt-dlp every few weeks, and shipping a whole signed app release for each
 * of those would be unmaintainable — and would leave users broken in the
 * meantime. Only the managed binary is touched; a PATH yt-dlp belongs to the
 * user's system, not to us.
 */
export async function checkEngineUpdate(force = false): Promise<void> {
  const meta = await readMeta()
  const due = force || !meta.lastEngineCheck || Date.now() - meta.lastEngineCheck > ONE_WEEK

  const installed = await resolveYtdlp()
  engineState.currentVersion = installed.version
  if (installed.source !== 'managed') {
    engineState.status = 'idle'
    push()
    return
  }
  if (!due) return

  engineState.status = 'checking'
  engineState.error = null
  push()

  try {
    const response = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(20_000)
    })
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`)
    const release = (await response.json()) as { tag_name?: string }
    const latest = release.tag_name ?? null

    engineState.lastCheckedAt = Date.now()
    await writeMeta({ lastEngineCheck: engineState.lastCheckedAt })

    if (!latest || latest === installed.version) {
      engineState.status = 'current'
      engineState.newVersion = null
      push()
      return
    }

    engineState.status = 'updating'
    engineState.newVersion = latest
    push()

    const { manifest } = await loadManifest()
    const spec = findComponent(manifest, 'ytdlp')
    if (!spec) throw new Error('yt-dlp is missing from the component registry')

    await installComponent(spec, binDir(), () => undefined)

    const after = await resolveYtdlp()
    engineState.currentVersion = after.version
    engineState.newVersion = null
    engineState.status = 'current'
    push()
  } catch (err) {
    engineState.status = 'error'
    engineState.error = (err as Error).message
    push()
  }
}

// --- App channel ------------------------------------------------------------

function configureAutoUpdater(): void {
  autoUpdater.autoDownload = true
  // Installing mid-session would kill downloads in flight. Wait for quit.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    appState.status = 'checking'
    push()
  })
  autoUpdater.on('update-available', (info: { version: string }) => {
    appState.status = 'downloading'
    appState.newVersion = info.version
    push()
  })
  autoUpdater.on('update-not-available', () => {
    appState.status = 'current'
    appState.newVersion = null
    push()
  })
  autoUpdater.on('download-progress', (progress: { percent: number }) => {
    appState.status = 'downloading'
    appState.percent = progress.percent
    push()
  })
  autoUpdater.on('update-downloaded', (info: { version: string }) => {
    appState.status = 'ready'
    appState.newVersion = info.version
    appState.percent = 100
    push()
  })
  autoUpdater.on('error', (err: Error) => {
    appState.status = 'error'
    appState.error = err.message
    push()
  })
}

export function initUpdates(onChange: Emit): void {
  emit = onChange
  appState.currentVersion = app.getVersion()

  // Three reasons self-update cannot work, each needing a different message
  // rather than a silent no-op.
  if (!app.isPackaged) {
    appState.canSelfUpdate = false
    appState.status = 'unsupported'
    appState.reason = 'dev'
  } else if (isPortable()) {
    // A running portable exe cannot replace itself on disk.
    appState.canSelfUpdate = false
    appState.status = 'unsupported'
    appState.reason = 'portable'
  } else {
    appState.canSelfUpdate = true
    configureAutoUpdater()
    void autoUpdater.checkForUpdates().catch(() => undefined)
    setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), SIX_HOURS)
  }

  push()
  void checkEngineUpdate()
  setInterval(() => void checkEngineUpdate(), SIX_HOURS)
}

export async function checkAppUpdate(): Promise<void> {
  if (!appState.canSelfUpdate) return
  await autoUpdater.checkForUpdates().catch(() => undefined)
}

/** Quits and installs a downloaded update. */
export function installNow(): void {
  if (appState.status !== 'ready') return
  autoUpdater.quitAndInstall()
}
