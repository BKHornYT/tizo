import { randomUUID } from 'node:crypto'
import { probe } from '../engine/probe'
import { cancelDownload, startDownload } from '../engine/download'
import { loadSettings } from '../store/settings'
import type { FormatOption, ProgressEvent, QueueItem } from '../../shared/types'

type Listener = (items: QueueItem[]) => void

const items = new Map<string, QueueItem>()
/** Queue item id -> engine job id, for cancellation. */
const jobs = new Map<string, string>()
let listener: Listener | null = null

export function onQueueChange(fn: Listener): void {
  listener = fn
}

function snapshot(): QueueItem[] {
  return [...items.values()].sort((a, b) => a.addedAt - b.addedAt)
}

function emit(): void {
  listener?.(snapshot())
}

function patch(id: string, change: Partial<QueueItem>): void {
  const item = items.get(id)
  if (!item) return
  items.set(id, { ...item, ...change })
  emit()
}

/**
 * Picks the format to preselect: the best option the user can actually download
 * right now. Offering a 4K row that immediately errors on a machine without the
 * HQ pack is worse than quietly starting one step lower.
 */
function defaultFormat(formats: FormatOption[], hasFfmpeg: boolean): FormatOption | null {
  if (hasFfmpeg) return formats[0] ?? null
  return formats.find((f) => !f.needsFfmpeg) ?? formats[0] ?? null
}

function blank(url: string): QueueItem {
  return {
    id: randomUUID(),
    url,
    state: 'probing',
    addedAt: Date.now(),
    title: null,
    uploader: null,
    duration: null,
    thumbnail: null,
    extractor: null,
    formats: [],
    allFormats: [],
    formatId: null,
    percent: null,
    speed: null,
    eta: null,
    downloadedBytes: null,
    totalBytes: null,
    outputPath: null,
    error: null
  }
}

/**
 * Adds one or more URLs. Accepts a blob of pasted text and pulls the links out
 * of it, so pasting a list from anywhere just works instead of requiring one
 * link at a time.
 */
export function addUrls(text: string, hasFfmpeg: boolean): string[] {
  const urls = [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter((t) => /^https?:\/\//i.test(t))
    )
  ]

  const added: string[] = []
  for (const url of urls) {
    // Re-adding a link already in the list would just download it twice.
    const existing = [...items.values()].find(
      (i) => i.url === url && i.state !== 'done' && i.state !== 'error' && i.state !== 'cancelled'
    )
    if (existing) continue

    const item = blank(url)
    items.set(item.id, item)
    added.push(item.id)
    void runProbe(item.id, hasFfmpeg)
  }
  emit()
  return added
}

async function runProbe(id: string, hasFfmpeg: boolean): Promise<void> {
  const item = items.get(id)
  if (!item) return

  const result = await probe(item.url)
  if (!items.has(id)) return // removed while probing

  if (!result.ok) {
    patch(id, { state: 'error', error: result.error })
    return
  }

  const info = result.value
  const chosen = defaultFormat(info.formats, hasFfmpeg)
  patch(id, {
    state: 'ready',
    title: info.title,
    uploader: info.uploader,
    duration: info.duration,
    thumbnail: info.thumbnail,
    extractor: info.extractor,
    formats: info.formats,
    allFormats: info.allFormats,
    formatId: chosen?.id ?? null,
    url: info.webpageUrl
  })
}

export function setFormat(id: string, formatId: string): void {
  const item = items.get(id)
  if (!item || item.state === 'downloading' || item.state === 'processing') return
  patch(id, { formatId })
}

export function remove(id: string): void {
  const jobId = jobs.get(id)
  if (jobId) cancelDownload(jobId)
  jobs.delete(id)
  items.delete(id)
  emit()
  void pump()
}

export function clearFinished(): void {
  for (const [id, item] of items) {
    if (item.state === 'done' || item.state === 'error' || item.state === 'cancelled') {
      items.delete(id)
    }
  }
  emit()
}

export function cancel(id: string): void {
  const jobId = jobs.get(id)
  if (jobId) {
    cancelDownload(jobId)
    return // the engine's close handler reports 'cancelled'
  }
  const item = items.get(id)
  if (item && (item.state === 'queued' || item.state === 'probing')) {
    patch(id, { state: item.formats.length > 0 ? 'ready' : 'cancelled' })
  }
}

/** Queue one item. Actual starting is left to the concurrency pump. */
export function start(id: string): void {
  const item = items.get(id)
  if (!item || !item.formatId) return
  if (item.state === 'downloading' || item.state === 'processing' || item.state === 'queued') return
  patch(id, { state: 'queued', error: null, percent: null })
  void pump()
}

export function startAll(): void {
  for (const item of snapshot()) {
    if (item.state === 'ready' || item.state === 'cancelled' || item.state === 'error') {
      if (item.formatId) patch(item.id, { state: 'queued', error: null, percent: null })
    }
  }
  void pump()
}

export function cancelAllQueued(): void {
  for (const item of snapshot()) {
    if (item.state === 'queued') patch(item.id, { state: 'ready' })
    else if (item.state === 'downloading' || item.state === 'processing') cancel(item.id)
  }
}

let pumping = false

/**
 * Starts queued items up to the configured concurrency.
 *
 * Guarded by `pumping` because it is called from several async paths at once —
 * two overlapping runs would both see the same free slot and start two jobs in
 * it, quietly exceeding the limit the user set.
 */
async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    const settings = await loadSettings()
    const active = () =>
      snapshot().filter((i) => i.state === 'downloading' || i.state === 'processing').length

    for (const item of snapshot()) {
      if (active() >= settings.concurrentDownloads) break
      if (item.state !== 'queued' || !item.formatId) continue

      const format =
        item.allFormats.find((f) => f.id === item.formatId) ??
        item.formats.find((f) => f.id === item.formatId)

      patch(item.id, { state: 'downloading', percent: 0 })

      // Named so the conflict retry below reuses it. Handing the retry a no-op
      // callback would leave that item frozen at 0% forever while it actually
      // downloaded fine.
      const onEvent = (event: ProgressEvent): void => {
        const current = items.get(item.id)
        if (!current) return

        if (event.status === 'downloading' || event.status === 'processing') {
          patch(item.id, {
            state: event.status,
            percent: event.percent,
            speed: event.speed,
            eta: event.eta,
            downloadedBytes: event.downloadedBytes,
            totalBytes: event.totalBytes
          })
          return
        }

        jobs.delete(item.id)
        patch(item.id, {
          state: event.status,
          percent: event.status === 'done' ? 100 : current.percent,
          speed: null,
          eta: null,
          outputPath: event.outputPath ?? null,
          error: event.error ?? null
        })
        void pump()
      }

      const request = {
        url: item.url,
        format: item.formatId,
        needsFfmpeg: format?.needsFfmpeg ?? false
      }

      const result = await startDownload(request, onEvent)

      if (result.ok) {
        jobs.set(item.id, result.jobId)
      } else if ('conflict' in result) {
        // The queue never blocks on a modal: a batch that stops halfway waiting
        // for a click is worse than one that keeps both files.
        const retry = await startDownload({ ...request, resolveConflict: 'rename' }, onEvent)
        if (retry.ok) jobs.set(item.id, retry.jobId)
        else if ('error' in retry) patch(item.id, { state: 'error', error: retry.error })
      } else {
        patch(item.id, { state: 'error', error: result.error })
      }
    }
  } finally {
    pumping = false
  }
}

export function getQueue(): QueueItem[] {
  return snapshot()
}
