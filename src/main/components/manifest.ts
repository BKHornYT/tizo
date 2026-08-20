import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir } from '../paths'
import bundled from '../../../components.json'

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
}

export interface SiteProfile {
  impersonate?: string | null
  needsCookies?: boolean
  concurrentFragments?: number
}

export interface Manifest {
  schema: number
  essentials: { version: number; components: string[] }
  components: ComponentSpec[]
  siteProfiles: Record<string, SiteProfile>
  domains: Record<string, string>
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

  return {
    schema: m.schema,
    essentials: m.essentials,
    components: m.components,
    siteProfiles: strip(m.siteProfiles as Record<string, SiteProfile>),
    domains: strip(m.domains as Record<string, string>)
  }
}

/** The copy compiled into the app. Guarantees setup works with no network to the registry. */
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

export function findComponent(manifest: Manifest, id: string): ComponentSpec | undefined {
  return manifest.components.find((c) => c.id === id)
}
