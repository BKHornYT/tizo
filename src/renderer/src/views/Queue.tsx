import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EngineStatus, QueueItem } from '../../../shared/types'
import type { SortKey } from '../App'
import { strings } from '../strings'
import QueueRow from '../components/QueueRow'
import PlaylistPicker from '../components/PlaylistPicker'
import FeedbackDialog from '../components/FeedbackDialog'

/** Rough progress order, so "Status" sorting puts active work at the top. */
const STATE_RANK: Record<QueueItem['state'], number> = {
  downloading: 0,
  processing: 1,
  queued: 2,
  probing: 3,
  playlist: 4,
  ready: 5,
  error: 6,
  cancelled: 7,
  done: 8
}

export default function Queue({
  status,
  sort,
  pasteToken
}: {
  status: EngineStatus | null
  sort: SortKey
  /** Bumped by the toolbar's Add button to pull from the clipboard. */
  pasteToken: number
}): React.JSX.Element {
  const [items, setItems] = useState<QueueItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [choosing, setChoosing] = useState<QueueItem | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [reporting, setReporting] = useState<QueueItem | null>(null)

  useEffect(() => {
    void window.tizo.queue.list().then(setItems)
    return window.tizo.queue.onUpdate(setItems)
  }, [])

  const flash = useCallback((text: string) => {
    setToast({ id: Date.now(), text })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const add = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      if (!/https?:\/\//i.test(trimmed)) {
        flash(strings.queue.noLinks)
        return
      }
      const added = await window.tizo.queue.add(trimmed)
      // The queue silently ignores links already in the list, so an empty
      // result here means "nothing new", not "nothing happened".
      flash(added.length > 0 ? strings.queue.added(added.length) : strings.queue.alreadyQueued)
    },
    [flash]
  )

  /**
   * Pasting anywhere in the window adds links — there is no input to click into
   * first. This is the reference app's "copy a URL and it appears" behaviour,
   * which is the fastest possible path from finding a video to queueing it.
   */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const text = e.clipboardData?.getData('text') ?? ''
      if (text) {
        e.preventDefault()
        void add(text)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [add])

  // Toolbar Add button: same action, sourced from the system clipboard.
  useEffect(() => {
    if (pasteToken > 0) void window.tizo.readClipboard().then((text) => void add(text))
  }, [pasteToken, add])

  useEffect(() => {
    const over = (e: DragEvent): void => {
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e: DragEvent): void => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const drop = (e: DragEvent): void => {
      e.preventDefault()
      setDragging(false)
      const dropped = e.dataTransfer?.getData('text') ?? ''
      if (dropped) void add(dropped)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [add])

  const sorted = useMemo(() => {
    const list = [...items]
    switch (sort) {
      case 'title':
        return list.sort((a, b) => (a.title ?? a.url).localeCompare(b.title ?? b.url))
      case 'size':
        return list.sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
      case 'state':
        return list.sort(
          (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.addedAt - b.addedAt
        )
      default:
        return list.sort((a, b) => a.addedAt - b.addedAt)
    }
  }, [items, sort])

  const hasFfmpeg = status?.ffmpeg.found ?? false
  const active = items.filter((i) => i.state === 'downloading' || i.state === 'processing').length
  const startable = items.some(
    (i) => (i.state === 'ready' || i.state === 'error' || i.state === 'cancelled') && i.formatId
  )
  const finished = items.some(
    (i) => i.state === 'done' || i.state === 'error' || i.state === 'cancelled'
  )

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl">
          {sorted.length === 0 ? (
            <div className="mt-20 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-surface-line bg-surface shadow-sm">
                <span className="font-mono text-sm font-semibold text-brand-600">
                  {strings.queue.pasteHint}
                </span>
              </div>
              <p className="text-lg font-semibold text-ink-900">{strings.queue.empty}</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-700">
                {strings.queue.emptyHint}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2.5 flex items-baseline justify-between">
                <h2 className="text-xs font-semibold tracking-wide text-ink-700 uppercase">
                  {strings.queue.heading}
                </h2>
                <span className="text-xs text-ink-500">
                  {strings.queue.count(sorted.length)}
                  {active > 0 && ` · ${strings.queue.activeCount(active)}`}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {sorted.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    hasFfmpeg={hasFfmpeg}
                    onChoose={setChoosing}
                    onReport={setReporting}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 bg-chrome-800 px-8 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.18)]">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
          {finished && (
            <button
              onClick={() => void window.tizo.queue.clearFinished()}
              className="rounded-md bg-white/10 px-4 py-2 text-xs text-white/80 transition hover:bg-white/15"
            >
              {strings.queue.clearFinished}
            </button>
          )}
          {active > 0 ? (
            <button
              onClick={() => void window.tizo.queue.cancelAll()}
              className="rounded-md bg-white/10 px-5 py-2 text-xs font-medium text-white transition hover:bg-white/15"
            >
              {strings.queue.stopAll}
            </button>
          ) : (
            <button
              onClick={() => void window.tizo.queue.startAll()}
              disabled={!startable}
              className="rounded-md bg-brand-500 px-5 py-2 text-xs font-medium text-white transition enabled:hover:bg-brand-400 disabled:opacity-35"
            >
              {strings.queue.downloadAll}
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div
          key={toast.id}
          className="pointer-events-none absolute bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-full bg-chrome-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg"
        >
          {toast.text}
        </div>
      )}

      {reporting && (
        <FeedbackDialog
          kind="site"
          context={{
            url: reporting.url,
            ...(reporting.error?.code ? { errorCode: reporting.error.code } : {}),
            ...(reporting.error?.detail ? { errorDetail: reporting.error.detail } : {})
          }}
          onClose={() => setReporting(null)}
        />
      )}

      {choosing?.playlist && (
        <PlaylistPicker
          playlist={choosing.playlist}
          onCancel={() => setChoosing(null)}
          onAdd={(urls) => {
            void window.tizo.queue.expand(choosing.id, urls)
            setChoosing(null)
          }}
        />
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-chrome-900/55 backdrop-blur-[2px]">
          <div className="rounded-2xl border-2 border-dashed border-white/70 px-10 py-8 text-center">
            <p className="text-sm font-semibold text-white">{strings.queue.dropActive}</p>
            <p className="mt-1 text-xs text-white/70">{strings.queue.dropHint}</p>
          </div>
        </div>
      )}
    </div>
  )
}
