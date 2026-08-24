/**
 * Resolution hooks that let the REAL src/main modules load under plain Node.
 * The point of these tests is that they run the shipping code rather than a
 * copy, so nothing in src/ may be changed to accommodate them.
 *
 * Three things need bridging:
 *  - `electron` has no Node build; it is pointed at electron-stub.mjs.
 *  - src/main imports are extensionless (`'../paths'`) because a bundler
 *    resolves them. Node ESM does not, so `.ts` and `/index.ts` are tried.
 *  - `import bundled from '../../../components.json'` is plain in a bundler but
 *    needs an explicit `with { type: 'json' }` in Node ESM. The attribute is
 *    supplied here rather than added to the source, for the reason above.
 */
const STUB = new URL('./electron-stub.mjs', import.meta.url).href

async function resolveWithSuffixes(specifier, context, next) {
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

export async function resolve(specifier, context, next) {
  if (specifier === 'electron') return { url: STUB, shortCircuit: true }

  // The attribute has to be on the way IN as well as on the way out: Node
  // validates the importing context's attributes against the resolved module.
  const json = specifier.endsWith('.json')
  const ctx = json ? { ...context, importAttributes: { type: 'json' } } : context

  const result = await resolveWithSuffixes(specifier, ctx, next)
  return json ? { ...result, importAttributes: { type: 'json' } } : result
}
