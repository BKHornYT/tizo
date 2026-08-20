import { contextBridge, ipcRenderer } from 'electron'
import type {
  EngineStatus,
  MediaInfo,
  ProgressEvent,
  QueueItem,
  Result,
  Settings,
  SetupPlan,
  SetupProgress
} from '../shared/types'

export interface DownloadArgs {
  url: string
  format: string
  needsFfmpeg: boolean
  outDir?: string
  resolveConflict?: 'overwrite' | 'rename'
}

export type DownloadResult =
  | { ok: true; jobId: string }
  | { ok: false; error: { code: string; message: string } }
  | { ok: false; conflict: { path: string } }

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

  download: (args: DownloadArgs): Promise<DownloadResult> =>
    ipcRenderer.invoke('engine:download', args),

  queue: {
    list: (): Promise<QueueItem[]> => ipcRenderer.invoke('queue:list'),
    /** Accepts pasted text; every http(s) link inside it is queued. */
    add: (text: string): Promise<string[]> => ipcRenderer.invoke('queue:add', text),
    start: (id: string): Promise<void> => ipcRenderer.invoke('queue:start', id),
    startAll: (): Promise<void> => ipcRenderer.invoke('queue:startAll'),
    cancelAll: (): Promise<void> => ipcRenderer.invoke('queue:cancelAll'),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke('queue:cancel', id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('queue:remove', id),
    clearFinished: (): Promise<void> => ipcRenderer.invoke('queue:clearFinished'),
    /** Replaces a playlist row with one item per chosen video. */
    expand: (id: string, urls: string[]): Promise<void> =>
      ipcRenderer.invoke('queue:expand', id, urls),
    setFormat: (id: string, formatId: string): Promise<void> =>
      ipcRenderer.invoke('queue:setFormat', id, formatId),
    onUpdate: (handler: (items: QueueItem[]) => void): (() => void) => {
      const listener = (_e: unknown, items: QueueItem[]): void => handler(items)
      ipcRenderer.on('queue:update', listener)
      return () => {
        ipcRenderer.off('queue:update', listener)
      }
    }
  },

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),

  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:set', patch),

  resetSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:reset'),

  cancel: (jobId: string): Promise<boolean> => ipcRenderer.invoke('engine:cancel', jobId),

  setupPlan: (): Promise<SetupPlan> => ipcRenderer.invoke('setup:plan'),

  runSetup: (): Promise<void> => ipcRenderer.invoke('setup:run'),

  cancelSetup: (): Promise<void> => ipcRenderer.invoke('setup:cancel'),

  installFromFile: (
    componentId: string
  ): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('setup:installFromFile', componentId),

  onSetupProgress: (handler: (progress: SetupProgress) => void): (() => void) => {
    const listener = (_e: unknown, progress: SetupProgress): void => handler(progress)
    ipcRenderer.on('setup:progress', listener)
    return () => {
      ipcRenderer.off('setup:progress', listener)
    }
  },

  defaultDownloadDir: (): Promise<string> => ipcRenderer.invoke('paths:downloadDir'),

  pickFolder: (current?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickFolder', current),

  reveal: (target: string): Promise<void> => ipcRenderer.invoke('shell:reveal', target),

  openPath: (target: string): Promise<void> => ipcRenderer.invoke('shell:openPath', target),

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
