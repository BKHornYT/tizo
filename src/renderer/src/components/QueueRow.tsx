import type { QueueItem } from '../../../shared/types'
import { bytes, duration, speed } from '../format'
import { strings } from '../strings'

const ACTIVE: QueueItem['state'][] = ['downloading', 'processing']

export default function QueueRow({
  item,
  hasFfmpeg
}: {
  item: QueueItem
  hasFfmpeg: boolean
}): React.JSX.Element {
  const active = ACTIVE.includes(item.state)
  const pct = item.percent ?? 0
  const format =
    item.allFormats.find((f) => f.id === item.formatId) ??
    item.formats.find((f) => f.id === item.formatId)
  const blocked = Boolean(format?.needsFfmpeg) && !hasFfmpeg

  return (
    <li className="relative overflow-hidden rounded-xl border border-white/10 bg-ink-900">
      {/* Progress reads as a fill behind the row rather than a separate bar —
          the row itself is the thing making progress. */}
      {active && (
        <div
          className="absolute inset-y-0 left-0 bg-accent-500/10 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      )}

      <div className="relative flex items-center gap-4 p-3">
        <Thumb item={item} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white/90">
            {item.title ?? item.url}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-white/40">
            <StateLabel item={item} />
            {item.uploader && <span className="truncate">· {item.uploader}</span>}
            {item.duration !== null && <span>· {duration(item.duration)}</span>}
          </p>
          {item.state === 'error' && item.error && (
            <p className="mt-1 truncate text-xs text-red-300/80">{item.error.message}</p>
          )}
        </div>

        {item.formats.length > 0 && !active && item.state !== 'done' && (
          <FormatSelect item={item} hasFfmpeg={hasFfmpeg} />
        )}

        {active && (
          <div className="shrink-0 text-right font-mono text-xs text-white/50">
            <div>{pct.toFixed(0)}%</div>
            {item.state === 'downloading' && (
              <div className="text-white/30">{speed(item.speed)}</div>
            )}
          </div>
        )}

        <Actions item={item} blocked={blocked} />
      </div>
    </li>
  )
}

function Thumb({ item }: { item: QueueItem }): React.JSX.Element {
  if (item.thumbnail) {
    return (
      <img
        src={item.thumbnail}
        alt=""
        className="h-11 w-20 shrink-0 rounded-md object-cover"
      />
    )
  }
  return (
    <div
      className={`h-11 w-20 shrink-0 rounded-md bg-white/5 ${
        item.state === 'probing' ? 'animate-pulse' : ''
      }`}
    />
  )
}

function StateLabel({ item }: { item: QueueItem }): React.JSX.Element {
  const tone =
    item.state === 'done'
      ? 'text-emerald-300/80'
      : item.state === 'error'
        ? 'text-red-300/80'
        : item.state === 'downloading' || item.state === 'processing'
          ? 'text-accent-400/90'
          : 'text-white/40'

  const detail =
    item.state === 'downloading' && item.totalBytes
      ? ` ${bytes(item.downloadedBytes)} / ${bytes(item.totalBytes)}${
          item.eta !== null ? ` · ${strings.progress.eta} ${duration(item.eta)}` : ''
        }`
      : ''

  return (
    <span className={tone}>
      {strings.queue.states[item.state]}
      {detail}
    </span>
  )
}

function FormatSelect({
  item,
  hasFfmpeg
}: {
  item: QueueItem
  hasFfmpeg: boolean
}): React.JSX.Element {
  return (
    <select
      value={item.formatId ?? ''}
      onChange={(e) => void window.tizo.queue.setFormat(item.id, e.target.value)}
      className="max-w-[11rem] shrink-0 rounded-md border border-white/10 bg-ink-800 px-2 py-1.5 text-xs text-white/70 outline-none focus:border-accent-500"
    >
      <optgroup label={strings.queue.bestGroup}>
        {item.formats.map((f) => (
          <option key={f.id} value={f.id} className="bg-ink-800">
            {f.label}
            {f.needsFfmpeg && !hasFfmpeg ? ' ⚠' : ''}
          </option>
        ))}
      </optgroup>
      {item.allFormats.length > 0 && (
        <optgroup label={strings.queue.allFormatsGroup}>
          {item.allFormats.map((f) => (
            <option key={f.id} value={f.id} className="bg-ink-800">
              {f.label}
              {f.needsFfmpeg && !hasFfmpeg ? ' ⚠' : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

function Actions({ item, blocked }: { item: QueueItem; blocked: boolean }): React.JSX.Element {
  const q = window.tizo.queue

  return (
    <div className="flex shrink-0 items-center gap-1">
      {item.state === 'ready' && (
        <Action
          onClick={() => void q.start(item.id)}
          disabled={blocked}
          primary
          title={blocked ? strings.downloader.needsHqPack : undefined}
        >
          {strings.queue.start}
        </Action>
      )}

      {(item.state === 'error' || item.state === 'cancelled') && item.formats.length > 0 && (
        <Action onClick={() => void q.start(item.id)}>{strings.queue.retry}</Action>
      )}

      {(item.state === 'downloading' ||
        item.state === 'processing' ||
        item.state === 'queued') && (
        <Action onClick={() => void q.cancel(item.id)}>{strings.queue.stop}</Action>
      )}

      {item.state === 'done' && item.outputPath && (
        <Action onClick={() => void window.tizo.reveal(item.outputPath!)}>
          {strings.queue.reveal}
        </Action>
      )}

      <button
        onClick={() => void q.remove(item.id)}
        title={strings.queue.remove}
        aria-label={strings.queue.remove}
        className="rounded-md px-2 py-1.5 text-white/25 transition hover:bg-white/5 hover:text-white/70"
      >
        ✕
      </button>
    </div>
  )
}

function Action({
  onClick,
  children,
  primary,
  disabled,
  title
}: {
  onClick: () => void
  children: React.ReactNode
  primary?: boolean
  disabled?: boolean
  title?: string | undefined
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md px-3 py-1.5 text-xs transition disabled:opacity-30 ${
        primary
          ? 'bg-accent-500 font-medium text-white enabled:hover:bg-accent-400'
          : 'border border-white/10 text-white/60 enabled:hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}
