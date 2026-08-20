import { useState } from 'react'
import type { PlaylistInfo } from '../../../shared/types'
import { duration } from '../format'
import { strings } from '../strings'

/**
 * Selection dialog for a playlist or channel.
 *
 * Everything starts selected, because a person who pasted a playlist link
 * usually wants the playlist — the list is here to let them remove the few they
 * do not want, not to make them pick 40 checkboxes one at a time.
 */
export default function PlaylistPicker({
  playlist,
  onAdd,
  onCancel
}: {
  playlist: PlaylistInfo
  onAdd: (urls: string[]) => void
  onCancel: () => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(playlist.entries.map((e) => e.url))
  )

  const toggle = (url: string): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-8 py-10">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-ink-900">
        <header className="shrink-0 border-b border-white/10 px-5 py-4">
          <h3 className="font-medium text-white/90">{strings.queue.selectTitle}</h3>
          <p className="mt-0.5 truncate text-sm text-white/40">{playlist.title}</p>
          {playlist.entries.length < playlist.count && (
            <p className="mt-1 text-xs text-amber-300/60">
              {strings.queue.capped(playlist.entries.length)}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <MiniButton onClick={() => setSelected(new Set(playlist.entries.map((e) => e.url)))}>
              {strings.queue.selectAll}
            </MiniButton>
            <MiniButton onClick={() => setSelected(new Set())}>
              {strings.queue.selectNone}
            </MiniButton>
          </div>
        </header>

        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {playlist.entries.map((entry, index) => {
            const checked = selected.has(entry.url)
            return (
              <li key={entry.url}>
                <button
                  onClick={() => toggle(entry.url)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/5"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                      checked
                        ? 'border-accent-500 bg-accent-500 text-white'
                        : 'border-white/20 text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-white/25">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-white/80">
                    {entry.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-white/30">
                    {duration(entry.duration)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
          >
            {strings.queue.cancel}
          </button>
          <button
            onClick={() => onAdd([...selected])}
            disabled={selected.size === 0}
            className="rounded-md bg-accent-500 px-4 py-2 text-xs font-medium text-white transition enabled:hover:bg-accent-400 disabled:opacity-30"
          >
            {strings.queue.addSelected(selected.size)}
          </button>
        </footer>
      </div>
    </div>
  )
}

function MiniButton({
  onClick,
  children
}: {
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/50 hover:bg-white/5 hover:text-white/80"
    >
      {children}
    </button>
  )
}
