import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { binDir } from '../paths'
import { findComponent, loadManifest, type ComponentSpec } from '../components/manifest'
import { installComponent, installFromFile, InstallError } from '../components/install'
import { markComplete, readState, recordInstalled } from './state'
import type { SetupPlan, SetupProgress } from '../../shared/types'

/** Installed means the files are actually on disk, not merely recorded. */
function present(spec: ComponentSpec): boolean {
  return spec.binaries.every((b) => existsSync(join(binDir(), b)))
}

export async function getSetupPlan(): Promise<SetupPlan> {
  const { manifest, source } = await loadManifest()
  const state = await readState()

  const specs = manifest.essentials.components
    .map((id) => findComponent(manifest, id))
    .filter((s): s is ComponentSpec => Boolean(s))

  const missing = specs.filter((s) => !present(s))

  return {
    required: missing.length > 0,
    manifestSource: source,
    essentialsVersion: manifest.essentials.version,
    completedAt: state.completedAt,
    components: specs.map((s) => ({
      id: s.id,
      name: s.name,
      summary: s.summary,
      version: s.version,
      size: s.size,
      installed: present(s)
    })),
    totalBytes: missing.reduce((sum, s) => sum + s.size, 0)
  }
}

let active: AbortController | null = null

export function cancelSetup(): void {
  active?.abort()
  active = null
}

/**
 * Installs every missing Essentials component, reporting one combined progress
 * figure across all of them — the user was promised a single download, so they
 * get a single bar rather than a sequence of bars restarting at zero.
 */
export async function runSetup(emit: (progress: SetupProgress) => void): Promise<void> {
  const { manifest } = await loadManifest()
  const specs = manifest.essentials.components
    .map((id) => findComponent(manifest, id))
    .filter((s): s is ComponentSpec => Boolean(s))
    .filter((s) => !present(s))

  if (specs.length === 0) {
    await markComplete(manifest.essentials.version)
    emit({ phase: 'done', overallPercent: 100, componentId: null, componentName: null, stage: null, speed: null, receivedBytes: 0, totalBytes: 0 })
    return
  }

  const grandTotal = specs.reduce((sum, s) => sum + s.size, 0)
  let completedBytes = 0

  const controller = new AbortController()
  active = controller

  try {
    for (const spec of specs) {
      await installComponent(
        spec,
        (p) => {
          const done = completedBytes + p.receivedBytes
          emit({
            phase: 'running',
            componentId: spec.id,
            componentName: spec.name,
            stage: p.stage,
            speed: p.speed,
            receivedBytes: done,
            totalBytes: grandTotal,
            overallPercent: grandTotal > 0 ? Math.min(100, (done / grandTotal) * 100) : 0
          })
        },
        controller.signal
      )
      completedBytes += spec.size
      await recordInstalled(spec.id, spec.version)
    }

    await markComplete(manifest.essentials.version)
    emit({
      phase: 'done',
      overallPercent: 100,
      componentId: null,
      componentName: null,
      stage: null,
      speed: null,
      receivedBytes: grandTotal,
      totalBytes: grandTotal
    })
  } catch (err) {
    const aborted = controller.signal.aborted
    emit({
      phase: aborted ? 'cancelled' : 'error',
      overallPercent: grandTotal > 0 ? (completedBytes / grandTotal) * 100 : 0,
      componentId: null,
      componentName: null,
      stage: null,
      speed: null,
      receivedBytes: completedBytes,
      totalBytes: grandTotal,
      ...(aborted
        ? {}
        : {
            error:
              err instanceof InstallError
                ? `${err.message} (during ${err.stage})`
                : ((err as Error).message ?? 'Setup failed.')
          })
    })
  } finally {
    active = null
  }
}

/** The offline escape hatch: install a component from a hand-downloaded zip. */
export async function installComponentFromFile(
  componentId: string,
  zipPath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { manifest } = await loadManifest({ refresh: false })
  const spec = findComponent(manifest, componentId)
  if (!spec) return { ok: false, error: `Unknown component "${componentId}".` }
  try {
    await installFromFile(spec, zipPath)
    await recordInstalled(spec.id, spec.version)
    const plan = await getSetupPlan()
    if (!plan.required) await markComplete(manifest.essentials.version)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
