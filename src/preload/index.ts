import { contextBridge, ipcRenderer } from 'electron'
import type {
  EngineStatus,
  MediaInfo,
  ProgressEvent,
  Result
} from '../shared/types'

export interface DownloadArgs {
  url: string
  format: string
  outDir: string
  needsFfmpeg: boolean
}

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
  }> => ipcRenderer.invoke('app:versions'),

  engineStatus: (): Promise<EngineStatus> => ipcRenderer.invoke('engine:status'),

  probe: (url: string): Promise<Result<MediaInfo>> => ipcRenderer.invoke('engine:probe', url),

  download: (
    args: DownloadArgs
  ): Promise<{ ok: true; jobId: string } | { ok: false; error: { code: string; message: string } }> =>
    ipcRenderer.invoke('engine:download', args),

  cancel: (jobId: string): Promise<boolean> => ipcRenderer.invoke('engine:cancel', jobId),

  defaultDownloadDir: (): Promise<string> => ipcRenderer.invoke('paths:downloadDir'),

  pickFolder: (current?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickFolder', current),

  reveal: (target: string): Promise<void> => ipcRenderer.invoke('shell:reveal', target),

  /** Returns an unsubscribe function — React effects must be able to clean up. */
  onProgress: (handler: (event: ProgressEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: ProgressEvent): void => handler(event)
    ipcRenderer.on('engine:progress', listener)
    return () => {
      ipcRenderer.off('engine:progress', listener)
    }
  }
}

contextBridge.exposeInMainWorld('tizo', api)

export type TizoApi = typeof api
