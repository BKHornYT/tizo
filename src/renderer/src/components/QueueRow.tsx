import type { QueueItem } from '../../../shared/types'
import { bytes, duration, speed } from '../format'
import { strings } from '../strings'

const ACTIVE: QueueItem['state'][] = ['downloading', 'processing']

/**
 * Failures worth reporting. A geo-block, a missing login or a dead connection is
 * not something an issue can fix, and inviting a report for those would bury the
 * real cases in noise.
 */
const REPORTABLE = new Set(['UNSUPPORTED_SITE', 'UNKNOWN'])

export default function QueueRow({
  item,
  hasFfmpeg,
  onChoose,
  onReport
}: {
  item: QueueItem
  hasFfmpeg: boolean
  onChoose: (item: QueueItem) => void
  onReport: (item: QueueItem) => void
}): React.JSX.Element {
  const active = ACTIVE.includes(item.state)
  const pct = item.percent ?? 0
  const format =
    item.allFormats.find((f) => f.id === item.formatId) ??
    item.formats.find((f) => f.id === item.formatId)
  const blocked = Boolean(format?.needsFfmpeg) && !hasFfmpeg

  return (
    <li className="relative overflow-hidden rounded-xl border border-surface-line bg-surface shadow-sm backdrop-blur-sm">
      {/* Progress reads as a fill behind the row rather than a separate bar —
          the row itself is the thing making progress. */}
      {active && (
        <div
          className="absolute inset-y-0 left-0 bg-brand-500/18 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      )}

      <div className="relative flex items-center gap-3.5 p-2.5">
        <Thumb item={item} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{item.title ?? item.url}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-500">
            <StateLabel item={item} />
            {item.playlist && (
              <span>
                · {strings.queue.playlistCount(item.playlist.entries.length, item.playlist.count)}
              </span>
            )}
            {item.uploader && <span className="truncate">· {item.uploader}</span>}
            {item.duration !== null && <span>· {duration(item.duration)}</span>}
          </p>
          {item.state === 'error' && item.error && (
            <p className="mt-1 truncate text-xs text-red-700">{item.error.message}</p>
          )}
        </div>

        {item.state !== 'playlist' &&
          item.formats.length > 0 &&
          !active &&
          item.state !== 'done' && <FormatSelect item={item} hasFfmpeg={hasFfmpeg} />}

        {active && (
          <div className="shrink-0 text-right font-mono text-xs text-ink-700">
            <div className="font-semibold">{pct.toFixed(0)}%</div>
            {item.state === 'downloading' && (
              <div className="text-ink-500">{speed(item.speed)}</div>
            )}
          </div>
        )}

        <Actions item={item} blocked={blocked} onChoose={onChoose} onReport={onReport} />
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
        className="h-11 w-20 shrink-0 rounded-md object-cover shadow-sm"
      />
    )
  }
  return (
    <div
      className={`h-11 w-20 shrink-0 rounded-md bg-ink-900/8 ${
        item.state === 'probing' ? 'animate-pulse' : ''
      }`}
    />
  )
}

function StateLabel({ item }: { item: QueueItem }): React.JSX.Element {
  const tone =
    item.state === 'done'
      ? 'text-emerald-700 font-medium'
      : item.state === 'error'
        ? 'text-red-700 font-medium'
        : item.state === 'downloading' || item.state === 'processing'
          ? 'text-brand-600 font-medium'
          : 'text-ink-500'

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
      className="max-w-[10.5rem] shrink-0 rounded-md bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm outline-none hover:bg-brand-400"
    >
      <optgroup label={strings.queue.bestGroup} className="bg-white text-ink-900">
        {item.formats.map((f) => (
          <option key={f.id} value={f.id} className="bg-white text-ink-900">
            {f.label}
            {f.needsFfmpeg && !hasFfmpeg ? ' ⚠' : ''}
          </option>
        ))}
      </optgroup>
      {item.allFormats.length > 0 && (
        <optgroup label={strings.queue.allFormatsGroup} className="bg-white text-ink-900">
          {item.allFormats.map((f) => (
            <option key={f.id} value={f.id} className="bg-white text-ink-900">
              {f.label}
              {f.needsFfmpeg && !hasFfmpeg ? ' ⚠' : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

function Actions({
  item,
  blocked,
  onChoose,
  onReport
}: {
  item: QueueItem
  blocked: boolean
  onChoose: (item: QueueItem) => void
  onReport: (item: QueueItem) => void
}): React.JSX.Element {
  const q = window.tizo.queue

  return (
    <div className="flex shrink-0 items-center gap-1">
      {item.state === 'playlist' && item.playlist && (
        <>
          <Action onClick={() => onChoose(item)}>{strings.queue.choose}</Action>
          <Action
            primary
            onClick={() =>
              void q.expand(
                item.id,
                (item.playlist?.entries ?? []).map((e) => e.url)
              )
            }
          >
            {strings.queue.addAll}
          </Action>
        </>
      )}

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

      {item.state === 'error' && item.error && REPORTABLE.has(item.error.code) && (
        <Action onClick={() => onReport(item)}>{strings.feedback.reportSite}</Action>
      )}

      {(item.state === 'downloading' ||
        item.state === 'processing' ||
        item.state === 'queued') && (
        <Action onClick={() => void q.cancel(item.id)}>{strings.queue.stop}</Action>
      )}

      {item.state === 'done' && item.outputPath && (
        <Action onClick={() => item.outputPath && void window.tizo.reveal(item.outputPath)}>
          {strings.queue.reveal}
        </Action>
      )}

      <button
        onClick={() => void q.remove(item.id)}
        title={strings.queue.remove}
        aria-label={strings.queue.remove}
        className="rounded-md px-2 py-1.5 text-ink-400 transition hover:bg-ink-900/8 hover:text-ink-900"
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
      className={`rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition disabled:opacity-40 ${
        primary
          ? 'bg-brand-500 text-white enabled:hover:bg-brand-400'
          : 'bg-white/70 text-ink-700 enabled:hover:bg-white'
      }`}
    >
      {children}
    </button>
  )
}
