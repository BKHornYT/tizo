/**
 * Installs the extractor plugins that ship with the app.
 *
 * yt-dlp loads plugins from `<binDir>/yt-dlp-plugins/<pkg>/yt_dlp_plugins/`, and
 * the bundled binary honours that despite being a PyInstaller build. That is what
 * lets a site become supported by adding a small Python file rather than by
 * changing the app.
 *
 * Copied on every launch rather than only when missing: a plugin has to match the
 * app that shipped it, and a stale file left behind by an older version would
 * fail in ways nobody could reproduce from the source tree.
 *
 * NOTE: plugins are executable code. Only ever install them from inside the app's
 * own resources, or — later — from the registry after a sha256 check, exactly the
 * way ffmpeg is handled. Never from a URL a user, a page or an issue supplied.
 */
import { app } from 'electron'
import { cp, rm, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { binDir } from '../paths'

/** Where the bundled plugins live, packaged and in development. */
function sourceDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'plugins')
    : join(app.getAppPath(), 'resources', 'plugins')
}

export async function installBundledPlugins(): Promise<void> {
  const from = sourceDir()
  if (!existsSync(from)) return

  const to = join(binDir(), 'yt-dlp-plugins')
  try {
    await mkdir(binDir(), { recursive: true })
    // Replaced wholesale, so a plugin dropped from a release is dropped here too.
    await rm(to, { recursive: true, force: true })
    await cp(from, to, { recursive: true })
  } catch {
    // Failing here costs the extra sites these cover and nothing else. It must
    // never stop the app starting.
  }
}
