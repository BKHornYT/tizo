/**
 * Assembles build/iconsrc/*.png into build/icon.ico.
 *
 * Run: node scripts/build-icon.mjs
 *
 * Written by hand rather than pulled from a package: an .ico is a 6-byte header
 * plus a 16-byte directory entry per image, and Vista onwards accepts PNG data
 * inside it verbatim. That is less code than wiring up a dependency, and it
 * keeps the icon reproducible from source with no toolchain.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'build', 'iconsrc')
const dest = join(root, 'build', 'icon.ico')

const files = (await readdir(srcDir))
  .filter((f) => /^icon-\d+\.png$/.test(f))
  .map((f) => ({ file: f, size: Number(/(\d+)/.exec(f)[1]) }))
  .sort((a, b) => a.size - b.size)

if (files.length === 0) throw new Error(`no icon-*.png found in ${srcDir}`)

const images = await Promise.all(
  files.map(async ({ file, size }) => ({ size, data: await readFile(join(srcDir, file)) }))
)

const HEADER = 6
const ENTRY = 16

const header = Buffer.alloc(HEADER)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // 1 = icon
header.writeUInt16LE(images.length, 4)

const directory = Buffer.alloc(ENTRY * images.length)
let offset = HEADER + ENTRY * images.length

images.forEach((image, i) => {
  const at = i * ENTRY
  // 256 is stored as 0 — the field is a single byte.
  directory.writeUInt8(image.size >= 256 ? 0 : image.size, at)
  directory.writeUInt8(image.size >= 256 ? 0 : image.size, at + 1)
  directory.writeUInt8(0, at + 2) // palette size
  directory.writeUInt8(0, at + 3) // reserved
  directory.writeUInt16LE(1, at + 4) // colour planes
  directory.writeUInt16LE(32, at + 6) // bits per pixel
  directory.writeUInt32LE(image.data.length, at + 8)
  directory.writeUInt32LE(offset, at + 12)
  offset += image.data.length
})

await writeFile(dest, Buffer.concat([header, directory, ...images.map((i) => i.data)]))

console.log(
  `icon.ico written — ${images.length} sizes (${images.map((i) => i.size).join(', ')}), ${
    (offset / 1024).toFixed(1)
  } KB`
)
