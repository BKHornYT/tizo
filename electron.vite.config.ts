import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // Baked in at BUILD time, not read at runtime. The packaged app runs on a
    // machine where this variable does not exist, so leaving it as a live
    // `process.env` lookup meant the endpoint was always empty no matter what
    // CI was configured with, and the stats client silently short-circuited.
    define: {
      'process.env.TIZO_STATS_ENDPOINT': JSON.stringify(
        process.env.TIZO_STATS_ENDPOINT ?? ''
      )
    },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: { '@renderer': resolve(__dirname, 'src/renderer/src') }
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } }
    }
  }
})
