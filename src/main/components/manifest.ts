import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir } from '../paths'
import bundled from '../../../components.json'

/**
 * The per-platform half of a component: where to get it, how big it is, what it
 * hashes to, and what it puts on disk. Everything else about a component (name,
 * summary, what it provides) is the same everywhere.
 */
export interface PlatformVariant {
  size: number
  sha256: string | null
  url: string
  binaries: string[]
}

export interface ComponentSpec {
  id: string
  name: string
  summary: string
  version: string
  kind: 'zip' | 'binary'
  size: number
  sha256: string | null
  url: string
  provides: string[]
  binaries: string[]
  /**
   * Overrides keyed by `process.platform`. Additive on purpose, and it has to
   * stay that way: the top-level url/size/sha256/binaries ARE the Windows
   * variant, because every client shipped since v0.0.5 reads those fields
   * directly. Restructuring this file into a platform map would break first-run
   * setup — a mandatory gate — for every Windows install already out there.
   */
  platforms?: Record<string, PlatformVariant>
}

export interface SiteProfile {
  impersonate?: string | null
  needsCookies?: boolean
  concurrentFragments?: number
}

/**
 * One yt-dlp extractor plugin delivered by the registry.
 *
 * A plugin is executable code that runs on a user's machine, so the rules are
 * the same as for a binary and not negotiable: https only, from our own
 * registry, and `sha256` checked before the file is written anywhere yt-dlp
 * will load it. Never populate this from a user report, a page, or anything a
 * user can influence.
 */
export interface PluginSpec {
  /** Package directory name. Also the module name, with dashes as underscores. */
  id: string
  name: string
  version: string
  summary: string
  url: string
  /** Lowercase hex. Refuse the file if it does not match. */
  sha256: string
}

export interface Manifest {
  schema: number
  essentials: { version: number; components: string[] }
  components: ComponentSpec[]
  siteProfiles: Record<string, SiteProfile>
  domains: Record<string, string>
  plugins: PluginSpec[]
}

/**
 * Overridable so the update feed can move off GitHub later without an app
 * change, per the hosting decision in docs/plan.md.
 */
const REMOTE_URL =
  process.env['TIZO_MANIFEST_URL'] ??
  'https://raw.githubusercontent.com/BKHornYT/tizo/main/components.json'

const CACHE_NAME = 'components.cache.json'

function clean(raw: unknown): Manifest | null {
  const m = raw as Partial<Manifest>
  if (!m || typeof m !== 'object') return null
  if (m.schema !== 1) return null
  if (!m.essentials || !Array.isArray(m.components)) return null

  // Underscore keys are documentation inside the JSON; strip them so they never
  // reach code that iterates these maps.
  const strip = <T,>(obj: Record<string, T> | undefined): Record<string, T> =>
    Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => !k.startsWith('_')))

  // A binary name becomes `join(binDir(), name)`, so a name carrying a path
  // separator would write outside the directory we manage. The registry is ours,
  // but it is fetched over the network and cached to disk, so the shape is
  // checked rather than trusted.
  // Written with includes() rather than a character class on purpose: a regex
  // needing an escaped backslash is one bad edit away from silently matching
  // only the forward slash, which looks correct and checks half of what it says.
  const isBinaryName = (b: unknown): b is string =>
    typeof b === 'string' &&
    b.length > 0 &&
    b !== '.' &&
    b !== '..' &&
    !b.includes('/') &&
    !b.includes('\\')

  // Validated field by field for the same reason plugins are: this decides what
  // gets downloaded and executed next to the engine. A half-written variant must
  // be dropped, never half-applied — and dropping it means the component simply
  // reads as unavailable on that platform, which is a state the callers handle.
  const cleanVariant = (value: unknown): PlatformVariant | null => {
    const v = value as Partial<PlatformVariant>
    if (!v || typeof v !== 'object') return null
    if (typeof v.url !== 'string' || !v.url.startsWith('https://')) return null
    if (typeof v.size !== 'number' || !Number.isFinite(v.size) || v.size <= 0) return null
    // An explicit `null` is required rather than an absent field: "no hash on
    // purpose" (as for yt-dlp's rolling release) has to be stated, not forgotten.
    const sha =
      v.sha256 === null
        ? null
        : typeof v.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(v.sha256)
          ? v.sha256
          : undefined
    if (sha === undefined) return null
    if (!Array.isArray(v.binaries) || v.binaries.length === 0) return null
    if (!v.binaries.every(isBinaryName)) return null
    return { size: v.size, sha256: sha, url: v.url, binaries: v.binaries }
  }

  const components = (m.components as ComponentSpec[]).map((spec) => {
    const raw = spec.platforms
    if (!raw || typeof raw !== 'object') {
      const { platforms: _none, ...rest } = spec
      return rest as ComponentSpec
    }
    const platforms: Record<string, PlatformVariant> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('_')) continue
      const variant = cleanVariant(value)
      if (variant) platforms[key] = variant
    }
    return { ...spec, platforms }
  })

  return {
    schema: m.schema,
    essentials: m.essentials,
    components,
    siteProfiles: strip(m.siteProfiles as Record<string, SiteProfile>),
    domains: strip(m.domains as Record<string, string>),
    // Validated field by field rather than trusted: this list decides what code
    // gets written next to the engine, so a malformed or half-written entry must
    // be dropped rather than half-applied.
    plugins: (Array.isArray(m.plugins) ? (m.plugins as PluginSpec[]) : []).filter(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        /^[a-z0-9][a-z0-9-]{1,40}$/.test(p.id) &&
        typeof p.url === 'string' &&
        p.url.startsWith('https://') &&
        typeof p.sha256 === 'string' &&
        /^[0-9a-f]{64}$/i.test(p.sha256)
    )
  }
}

/**
 * The validator every registry passes through — fetched, cached or bundled.
 *
 * Exported so tests can assert against the real thing. Copying this logic into
 * a test would reproduce whatever it gets wrong and pass, which is exactly how
 * the inert-endpoint bug survived four releases.
 */
export function parseRegistry(raw: unknown): Manifest | null {
  return clean(raw)
}

/** The copy compiled into the app.
 Guarantees setup works with no network to the registry. */
export function bundledManifest(): Manifest {
  const parsed = clean(bundled)
  if (!parsed) throw new Error('Bundled components.json is invalid — this is a build error')
  return parsed
}

async function readCache(): Promise<Manifest | null> {
  try {
    return clean(JSON.parse(await readFile(join(dataDir(), CACHE_NAME), 'utf8')))
  } catch {
    return null
  }
}

async function writeCache(manifest: Manifest): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true })
    await writeFile(join(dataDir(), CACHE_NAME), JSON.stringify(manifest), 'utf8')
  } catch {
    /* a cache we cannot write is not worth failing setup over */
  }
}

/**
 * Resolution order: fresh remote, then last good cache, then the bundled copy.
 *
 * The bundled fallback is the point — a registry outage or a typo pushed to the
 * manifest must never brick first-run setup, which is mandatory and therefore
 * the single worst place in the app to have a hard external dependency.
 */
export async function loadManifest(options?: { refresh?: boolean }): Promise<{
  manifest: Manifest
  source: 'remote' | 'cache' | 'bundled'
}> {
  if (options?.refresh !== false) {
    try {
      const response = await fetch(REMOTE_URL, {
        signal: AbortSignal.timeout(15_000),
        headers: { accept: 'application/json' }
      })
      if (response.ok) {
        const parsed = clean(await response.json())
        if (parsed) {
          await writeCache(parsed)
          return { manifest: parsed, source: 'remote' }
        }
      }
    } catch {
      /* fall through */
    }
  }

  const cached = await readCache()
  if (cached) return { manifest: cached, source: 'cache' }

  return { manifest: bundledManifest(), source: 'bundled' }
}

/**
 * Flattens a spec for one platform, or returns null when the component is not
 * published for it.
 *
 * Null rather than a Windows fallback, deliberately. Handing a Linux machine
 * `ffmpeg.exe` would download 77 MB, fail the execute check, and report
 * "installed but will not run. Antivirus may have quarantined it." — the app
 * dead at a mandatory gate, blaming the user's antivirus for our packaging.
 * Absent has to read as absent.
 */
export function forPlatform(
  spec: ComponentSpec,
  platform: string = process.platform
): ComponentSpec | null {
  if (platform === 'win32') return spec
  const variant = spec.platforms?.[platform]
  if (!variant) return null
  const { platforms: _ignored, ...rest } = spec
  return { ...rest, ...variant }
}

/**
 * Resolution goes through `forPlatform`, so no caller can forget it. A component
 * that exists but is not published for this platform is `undefined` here, same
 * as one that does not exist at all — both mean "you cannot install this", and
 * the callers already say so.
 */
export function findComponent(manifest: Manifest, id: string): ComponentSpec | undefined {
  const spec = manifest.components.find((c) => c.id === id)
  return spec ? (forPlatform(spec) ?? undefined) : undefined
}
