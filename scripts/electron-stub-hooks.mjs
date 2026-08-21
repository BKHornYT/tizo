/**
 * Resolution hooks that let the REAL src/main modules load under plain Node.
 * The point of the stats test is that it runs the shipping code rather than a
 * copy, so nothing in src/ may be changed to accommodate it.
 *
 * Two things need bridging:
 *  - `electron` has no Node build; it is pointed at electron-stub.mjs.
 *  - src/main imports are extensionless (`'../paths'`) because a bundler
 *    resolves them. Node ESM does not, so `.ts` and `/index.ts` are tried.
 */
const STUB = new URL('./electron-stub.mjs', import.meta.url).href

export async function resolve(specifier, context, next) {
  if (specifier === 'electron') return { url: STUB, shortCircuit: true }
  try {
    return await next(specifier, context)
  } catch (error) {
    if (!specifier.startsWith('.')) throw error
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        return await next(specifier + suffix, context)
      } catch {
        /* try the next shape */
      }
    }
    throw error
  }
}
