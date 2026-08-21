/**
 * Installs yt-dlp extractor plugins, from the app and from the registry.
 *
 * yt-dlp loads plugins from `<binDir>/yt-dlp-plugins/<pkg>/yt_dlp_plugins/`, and
 * the bundled binary honours that despite being a PyInstaller build. That is what
 * lets a site become supported by shipping a small Python file instead of an app
 * release.
 *
 * A plugin is executable code running on a user's machine. It is closer to
 * shipping a binary than to shipping a config file, so it gets the same
 * treatment ffmpeg gets: https only, from our own registry, and sha256-verified
 * before it is written anywhere yt-dlp will load it. Nothing here may ever be
 * pointed at a URL that a user, a page or an issue report supplied.
 */
import { app } from 'electron'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { binDir, dataDir } from '../paths'
import { fetchFile } from '../components/fetcher'
import { loadManifest, type PluginSpec } from '../components/manifest'
import type { InstalledPlugin } from '../../shared/types'

const STATE_FILE = 'plugins.json'

interface PluginState {
  /** id -> installed version, for registry plugins only. */
  installed: Record<string, string>
}

function pluginRoot(): string {
  return join(binDir(), 'yt-dlp-plugins')
}

/** Package dir -> the module file yt-dlp will import. Dashes are not valid there. */
function moduleName(id: string): string {
  return id.replace(/-/g, '_')
}

async function readState(): Promise<PluginState> {
  try {
    const raw = JSON.parse(await readFile(join(dataDir(), STATE_FILE), 'utf8')) as PluginState
    return { installed: raw.installed ?? {} }
  } catch {
    return { installed: {} }
  }
}

async function writeState(state: PluginState): Promise<void> {
  await mkdir(dataDir(), { recursive: true }).catch(() => undefined)
  await writeFile(join(dataDir(), STATE_FILE), JSON.stringify(state), 'utf8').catch(
    () => undefined
  )
}

/** Where the plugins packed into the app live, packaged and in development. */
function bundledDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'plugins')
    : join(app.getAppPath(), 'resources', 'plugins')
}

/**
 * Copies the plugins that shipped with the app.
 *
 * Each bundled package is replaced individually rather than by clearing the
 * whole directory: registry plugins live alongside them, and wiping the root
 * would delete on every launch exactly what the registry had just installed.
 */
export async function installBundledPlugins(): Promise<void> {
  const from = bundledDir()
  if (!existsSync(from)) return

  try {
    await mkdir(pluginRoot(), { recursive: true })
    for (const pkg of await readdir(from)) {
      const target = join(pluginRoot(), pkg)
      // Replaced wholesale so a plugin dropped from a release leaves disk too,
      // rather than lingering as a stale file nobody can reproduce from source.
      await rm(target, { recursive: true, force: true })
      await cp(join(from, pkg), target, { recursive: true })
    }
  } catch {
    // Costs the sites these cover and nothing else; never block startup.
  }
}

/**
 * Installs and updates the plugins the registry offers.
 *
 * Silent and best-effort. A registry that is unreachable, a file that fails its
 * hash, or a half-written install all leave the app exactly as capable as it was
 * before — which is the only acceptable failure mode for something that runs on
 * every launch.
 */
export async function syncRegistryPlugins(): Promise<void> {
  let specs: PluginSpec[] = []
  try {
    const { manifest } = await loadManifest({ refresh: false })
    specs = manifest.plugins
  } catch {
    return
  }
  if (specs.length === 0) return

  const state = await readState()
  const bundled = existsSync(bundledDir()) ? await readdir(bundledDir()).catch(() => []) : []

  for (const spec of specs) {
    // A registry entry must never quietly replace something we shipped: that
    // would turn a compromised registry into a way to swap out our own code.
    if (bundled.includes(spec.id)) continue
    if (state.installed[spec.id] === spec.version) continue

    const staging = join(dataDir(), 'plugin-staging', `${spec.id}.py`)
    try {
      await mkdir(join(dataDir(), 'plugin-staging'), { recursive: true })
      // fetchFile refuses to keep a file whose hash does not match, so nothing
      // unverified ever reaches the directory yt-dlp loads from.
      await fetchFile({ url: spec.url, dest: staging, sha256: spec.sha256 })

      const dir = join(pluginRoot(), spec.id, 'yt_dlp_plugins', 'extractor')
      await rm(join(pluginRoot(), spec.id), { recursive: true, force: true })
      await mkdir(dir, { recursive: true })
      await cp(staging, join(dir, `${moduleName(spec.id)}.py`))

      state.installed[spec.id] = spec.version
      await writeState(state)
    } catch {
      // Leave the previous version in place; a failed update is not a reason to
      // remove working support.
    } finally {
      await rm(staging, { force: true }).catch(() => undefined)
    }
  }

  await rm(join(dataDir(), 'plugin-staging'), { recursive: true, force: true }).catch(
    () => undefined
  )
}

/** Everything installed right now, for the Options list. */
export async function listPlugins(): Promise<InstalledPlugin[]> {
  const out: InstalledPlugin[] = []
  const state = await readState()

  let specs: PluginSpec[] = []
  try {
    specs = (await loadManifest({ refresh: false })).manifest.plugins
  } catch {
    specs = []
  }

  let packages: string[] = []
  try {
    packages = await readdir(pluginRoot())
  } catch {
    return out
  }

  const bundled = existsSync(bundledDir()) ? await readdir(bundledDir()).catch(() => []) : []

  for (const pkg of packages) {
    const spec = specs.find((s) => s.id === pkg)
    out.push({
      id: pkg,
      name: spec?.name ?? pkg,
      version: spec?.version ?? state.installed[pkg] ?? '—',
      summary: spec?.summary ?? '',
      fromRegistry: !bundled.includes(pkg)
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
