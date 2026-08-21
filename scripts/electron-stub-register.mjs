/** Loaded via `node --import` so the hooks are active before anything resolves. */
import { register } from 'node:module'

register('./electron-stub-hooks.mjs', import.meta.url)
