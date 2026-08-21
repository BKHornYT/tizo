/**
 * Stands in for `electron` so main-process modules can be exercised under plain
 * Node. Only what the stats path actually touches is implemented — a wider fake
 * would just be somewhere for a test to pass against the wrong thing.
 *
 * `TIZO_TEST_DATA_DIR` is injected by the test so the module writes its
 * stats.json into a throwaway folder instead of the real user data directory.
 */
export const app = {
  getVersion: () => process.env.TIZO_TEST_APP_VERSION ?? '0.0.0-test',
  getPath: (name) => {
    const dir = process.env.TIZO_TEST_DATA_DIR
    if (!dir) throw new Error('TIZO_TEST_DATA_DIR not set')
    return name === 'videos' ? `${dir}/videos` : dir
  }
}

export default { app }
