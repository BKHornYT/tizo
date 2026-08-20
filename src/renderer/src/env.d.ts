/// <reference types="vite/client" />

// NOTE: this import path must reach the preload *source*, not a sibling .d.ts.
// A declaration file living next to src/preload/index.ts would shadow it and
// silently resolve TizoApi to nothing.
import type { TizoApi } from '../../preload'

declare global {
  interface Window {
    tizo: TizoApi
  }
}

export {}
