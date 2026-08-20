import { useCallback, useEffect, useState } from 'react'
import type { EngineStatus, QueueItem } from '../../../shared/types'
import { strings } from '../strings'
import QueueRow from '../components/QueueRow'
import PlaylistPicker from '../components/PlaylistPicker'

export default function Queue({ status }: { status: EngineStatus | null }): React.JSX.Element {
  const [items, setItems] = useState<QueueItem[]>([])
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [choosing, setChoosing] = useState<QueueItem | null>(null)

  useEffect(() => {
    void window.tizo.queue.list().then(setItems)
    return window.tizo.queue.onUpdate(setItems)
  }, [])

  const add = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      await window.tizo.queue.add(trimmed)
      setText('')
    },
    []
  )

  // Drag-and-drop is window-wide rather than a small target: the whole point is
  // not having to aim.
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

  const hasFfmpeg = status?.ffmpeg.found ?? false
  const active = items.filter((i) => i.state === 'downloading' || i.state === 'processing').length
  const startable = items.some(
    (i) => (i.state === 'ready' || i.state === 'error' || i.state === 'cancelled') && i.formatId
  )
  const finished = items.some(
    (i) => i.state === 'done' || i.state === 'error' || i.state === 'cancelled'
  )

  return (
    <div className="relative flex h-full flex-col">
      <div className="shrink-0 px-8 pt-6">
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add(text)
            }}
            placeholder={strings.queue.addPlaceholder}
            spellCheck={false}
            autoFocus
            className="flex-1 select-text rounded-lg border border-white/10 bg-ink-900 px-4 py-3 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-accent-500"
          />
          <button
            onClick={() => void add(text)}
            disabled={!text.trim()}
            className="rounded-lg bg-accent-500 px-5 py-3 text-sm font-medium text-white transition enabled:hover:bg-accent-400 disabled:opacity-30"
          >
            {strings.queue.add}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl">
          {items.length === 0 ? (
            <div className="mt-16 text-center">
              <p className="text-sm text-white/45">{strings.queue.empty}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-white/25">
                {strings.queue.emptyHint}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-xs font-medium tracking-wide text-white/40 uppercase">
                  {strings.queue.heading}
                </h2>
                <span className="text-xs text-white/25">
                  {strings.queue.count(items.length)}
                  {active > 0 && ` · ${strings.queue.activeCount(active)}`}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    hasFfmpeg={hasFfmpeg}
                    onChoose={setChoosing}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="shrink-0 border-t border-white/10 px-8 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
            {finished && (
              <button
                onClick={() => void window.tizo.queue.clearFinished()}
                className="rounded-md border border-white/10 px-3 py-2 text-xs text-white/50 hover:bg-white/5 hover:text-white/80"
              >
                {strings.queue.clearFinished}
              </button>
            )}
            {active > 0 ? (
              <button
                onClick={() => void window.tizo.queue.cancelAll()}
                className="rounded-md border border-white/10 px-4 py-2 text-xs text-white/70 hover:bg-white/5"
              >
                {strings.queue.stopAll}
              </button>
            ) : (
              <button
                onClick={() => void window.tizo.queue.startAll()}
                disabled={!startable}
                className="rounded-md bg-accent-500 px-4 py-2 text-xs font-medium text-white transition enabled:hover:bg-accent-400 disabled:opacity-30"
              >
                {strings.queue.downloadAll}
              </button>
            )}
          </div>
        </div>
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
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-accent-500/60 px-10 py-8 text-center">
            <p className="text-sm font-medium text-white/90">{strings.queue.dropActive}</p>
            <p className="mt-1 text-xs text-white/40">{strings.queue.dropHint}</p>
          </div>
        </div>
      )}
    </div>
  )
}
