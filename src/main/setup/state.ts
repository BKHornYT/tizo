import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir } from '../paths'

export interface InstalledRecord {
  version: string
  installedAt: string
}

export interface SetupState {
  essentialsVersion: number | null
  completedAt: string | null
  components: Record<string, InstalledRecord>
}

const EMPTY: SetupState = { essentialsVersion: null, completedAt: null, components: {} }

function file(): string {
  return join(dataDir(), 'setup.json')
}

export async function readState(): Promise<SetupState> {
  try {
    const parsed = JSON.parse(await readFile(file(), 'utf8')) as Partial<SetupState>
    return {
      essentialsVersion: parsed.essentialsVersion ?? null,
      completedAt: parsed.completedAt ?? null,
      components: parsed.components ?? {}
    }
  } catch {
    return { ...EMPTY, components: {} }
  }
}

/**
 * Only ever called after a component has downloaded, verified and *executed*.
 * Writing earlier would leave an interrupted setup claiming to be finished, and
 * because setup is mandatory that produces an app that refuses to work and
 * refuses to fix itself.
 */
export async function recordInstalled(id: string, version: string): Promise<void> {
  const state = await readState()
  state.components[id] = { version, installedAt: new Date().toISOString() }
  await mkdir(dataDir(), { recursive: true })
  await writeFile(file(), JSON.stringify(state, null, 2), 'utf8')
}

export async function markComplete(essentialsVersion: number): Promise<void> {
  const state = await readState()
  state.essentialsVersion = essentialsVersion
  state.completedAt = new Date().toISOString()
  await mkdir(dataDir(), { recursive: true })
  await writeFile(file(), JSON.stringify(state, null, 2), 'utf8')
}
