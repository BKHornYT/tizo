import { useState } from 'react'
import type { FormatOption } from '../../../shared/types'
import { bytes } from '../format'
import { strings } from '../strings'

/**
 * The curated list is shown by default with an inline expander for the raw
 * stream list.
 *
 * Deliberately not a global "Normal / Expert" mode buried in settings: a user
 * who wants one unusual format for one video should not have to change an
 * app-wide preference and remember to change it back.
 */
export default function FormatPicker({
  formats,
  allFormats,
  selected,
  hasFfmpeg,
  onSelect
}: {
  formats: FormatOption[]
  allFormats: FormatOption[]
  selected: FormatOption | null
  hasFfmpeg: boolean
  onSelect: (format: FormatOption) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? allFormats : formats

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-medium tracking-wide text-white/40 uppercase">
          {strings.downloader.quality}
        </h3>
        {allFormats.length > formats.length && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-white/35 underline-offset-4 hover:text-white/70 hover:underline"
          >
            {expanded
              ? strings.downloader.fewerFormats
              : `${strings.downloader.allFormats} (${allFormats.length})`}
          </button>
        )}
      </div>

      {expanded && (
        <p className="-mt-1 text-xs text-white/25">{strings.downloader.allFormatsHint}</p>
      )}

      <div className={expanded ? 'flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1' : 'flex flex-col gap-2'}>
        {rows.map((format) => {
          const blocked = format.needsFfmpeg && !hasFfmpeg
          const isSelected = selected?.id === format.id
          return (
            <button
              key={format.id}
              onClick={() => onSelect(format)}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                isSelected
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-white/10 bg-ink-900 hover:border-white/20'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/90">{format.label}</span>
                  <span className="text-xs text-white/30 uppercase">{format.ext}</span>
                  {blocked && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      {strings.downloader.needsHqPack}
                    </span>
                  )}
                </div>
                {format.note && (
                  <p className="mt-0.5 truncate text-xs text-white/35">{format.note}</p>
                )}
              </div>
              <span className="shrink-0 pl-4 font-mono text-xs text-white/40">
                {bytes(format.filesize)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
