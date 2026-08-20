/**
 * Installs the Essentials components into the real app data folder, so a dev
 * machine can skip the first-run wizard.
 *
 * Run: node --experimental-strip-types scripts/install-essentials.ts
 *
 * This is a developer convenience only — it is not part of the app, and users
 * always go through the wizard.
 */
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { installComponent } from '../src/main/components/install.ts'
import type { ComponentSpec } from '../src/main/components/manifest.ts'

const MANIFEST = 'https://raw.githubusercontent.com/BKHornYT/tizo/main/components.json'

// Mirrors paths.ts: electron's userData for a non-portable install on Windows.
const dataDir = join(process.env['APPDATA'] ?? '', 'tizo')
const binDir = join(dataDir, 'bin')

const response = await fetch(MANIFEST)
if (!response.ok) throw new Error(`registry returned ${response.status}`)

const manifest = (await response.json()) as {
  essentials: { version: number; components: string[] }
  components: ComponentSpec[]
}

const specs = manifest.essentials.components
  .map((id) => manifest.components.find((c) => c.id === id))
  .filter((s): s is ComponentSpec => Boolean(s))

await mkdir(binDir, { recursive: true })

const installed: Record<string, { version: string; installedAt: string }> = {}

for (const spec of specs) {
  let lastLogged = -10
  await installComponent(spec, binDir, (p) => {
    const pct = p.totalBytes ? Math.floor((p.receivedBytes / p.totalBytes) * 100) : 0
    if (p.stage === 'downloading' && pct >= lastLogged + 10) {
      lastLogged = pct
      process.stdout.write(`  ${spec.name}: ${pct}%\n`)
    }
  })
  installed[spec.id] = { version: spec.version, installedAt: new Date().toISOString() }
  console.log(`  ${spec.name}: installed`)
}

await writeFile(
  join(dataDir, 'setup.json'),
  JSON.stringify(
    { essentialsVersion: manifest.essentials.version, completedAt: new Date().toISOString(), components: installed },
    null,
    2
  ),
  'utf8'
)

console.log(`\nEssentials installed into ${binDir}`)
