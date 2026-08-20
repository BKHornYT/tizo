import { contextBridge, ipcRenderer } from 'electron'
import type {
  EngineStatus,
  MediaInfo,
  ProgressEvent,
  FeedbackDraft,
  FeedbackKind,
  QueueItem,
  Result,
  SiteStat,
  TermsState,
  UpdateState,
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

  readClipboard: (): Promise<string> => ipcRenderer.invoke('clipboard:read'),

  terms: {
    state: (): Promise<TermsState> => ipcRenderer.invoke('terms:state'),
    accept: (): Promise<TermsState> => ipcRenderer.invoke('terms:accept')
  },

  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),

  stats: {
    local: (): Promise<SiteStat[]> => ipcRenderer.invoke('stats:local'),
    /** Exactly what an upload would contain — shown before opting in. */
    pending: (): Promise<{ app: string; sites: Record<string, number> }> =>
      ipcRenderer.invoke('stats:pending'),
    clear: (): Promise<void> => ipcRenderer.invoke('stats:clear'),
    /** False when no endpoint is configured, i.e. nothing can be sent at all. */
    enabled: (): Promise<boolean> => ipcRenderer.invoke('stats:enabled')
  },

  feedback: {
    /** Builds the report without sending it, so it can be shown first. */
    draft: (
      kind: FeedbackKind,
      context?: { url?: string; errorCode?: string; errorDetail?: string }
    ): Promise<FeedbackDraft> => ipcRenderer.invoke('feedback:draft', kind, context),
    open: (url: string): Promise<void> => ipcRenderer.invoke('feedback:open', url),
    browseIssues: (): Promise<void> => ipcRenderer.invoke('feedback:issues')
  },

  updates: {
    state: (): Promise<UpdateState> => ipcRenderer.invoke('update:state'),
    check: (): Promise<UpdateState> => ipcRenderer.invoke('update:check'),
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    onChange: (handler: (state: UpdateState) => void): (() => void) => {
      const listener = (_e: unknown, state: UpdateState): void => handler(state)
      ipcRenderer.on('update:state', listener)
      return () => {
        ipcRenderer.off('update:state', listener)
      }
    }
  },

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
