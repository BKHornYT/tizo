import { contextBridge, ipcRenderer } from 'electron'

/**
 * The entire main <-> renderer surface. The renderer has no filesystem access,
 * no child_process, and no Node globals — if it needs something, it gets a
 * named channel here and nothing more.
 */
const api = {
  getVersions: (): Promise<{
    app: string
    electron: string
    chrome: string
    node: string
  }> => ipcRenderer.invoke('app:versions')
}

contextBridge.exposeInMainWorld('tizo', api)

export type TizoApi = typeof api
