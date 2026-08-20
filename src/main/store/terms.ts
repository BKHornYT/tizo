import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dataDir } from '../paths'
import type { TermsState } from '../../shared/types'

/**
 * Bump when the terms change materially — a new version re-prompts everyone.
 * Do not bump for typos: re-prompting for nothing trains people to click
 * through without reading, which defeats the point of asking at all.
 */
export const TERMS_VERSION = 1

const FILE = 'terms.json'

export async function readTerms(): Promise<TermsState> {
  try {
    const raw = JSON.parse(await readFile(join(dataDir(), FILE), 'utf8')) as Partial<TermsState>
    const accepted = typeof raw.acceptedVersion === 'number' ? raw.acceptedVersion : null
    return {
      required: accepted !== TERMS_VERSION,
      acceptedVersion: accepted,
      acceptedAt: raw.acceptedAt ?? null,
      currentVersion: TERMS_VERSION
    }
  } catch {
    return {
      required: true,
      acceptedVersion: null,
      acceptedAt: null,
      currentVersion: TERMS_VERSION
    }
  }
}

export async function acceptTerms(): Promise<TermsState> {
  const state: TermsState = {
    required: false,
    acceptedVersion: TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
    currentVersion: TERMS_VERSION
  }
  await mkdir(dataDir(), { recursive: true }).catch(() => undefined)
  await writeFile(
    join(dataDir(), FILE),
    JSON.stringify({ acceptedVersion: state.acceptedVersion, acceptedAt: state.acceptedAt }, null, 2),
    'utf8'
  )
  return state
}
