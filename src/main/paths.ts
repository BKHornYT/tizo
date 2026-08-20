import { app } from 'electron'
import { join } from 'node:path'

/**
 * electron-builder's portable target sets PORTABLE_EXECUTABLE_DIR to the folder
 * the exe was launched from. That is the only reliable portable-mode signal.
 */
export function isPortable(): boolean {
  return Boolean(process.env['PORTABLE_EXECUTABLE_DIR'])
}

/**
 * Everything mutable lives here: settings, history, downloaded components, the
 * yt-dlp binary. In portable mode it sits next to the exe so a USB stick carries
 * the whole working app; otherwise it is the normal per-user app data folder.
 *
 * Must not be called before app is ready — getPath throws.
 */
export function dataDir(): string {
  const portableDir = process.env['PORTABLE_EXECUTABLE_DIR']
  return portableDir ? join(portableDir, 'tizo-data') : app.getPath('userData')
}

/** Managed binaries the app downloads and owns (yt-dlp, ffmpeg). */
export function binDir(): string {
  return join(dataDir(), 'bin')
}

/** Where finished downloads land unless the user picks somewhere else. */
export function defaultDownloadDir(): string {
  return join(app.getPath('downloads'), 'Tizo')
}
