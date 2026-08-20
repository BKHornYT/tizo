import { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineStatus, FormatOption, MediaInfo, ProgressEvent } from '../../../shared/types'
import { bytes, duration, speed } from '../format'
import { strings } from '../strings'
import FormatPicker from '../components/FormatPicker'

type Phase = 'idle' | 'probing' | 'ready' | 'running' | 'finished'

export default function Downloader({ status }: { status: EngineStatus | null }): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [outDir, setOutDir] = useState('')
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [format, setFormat] = useState<FormatOption | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  const jobRef = useRef<string | null>(null)

  // Seeded from settings, but editable per-download without changing the
  // global preference.
  useEffect(() => {
    void window.tizo.getSettings().then((s) => setOutDir((cur) => cur || s.outputDir))
  }, [])

  useEffect(() => {
    return window.tizo.onProgress((event) => {
      // Stale events from a cancelled job can still arrive after we moved on.
      if (event.jobId !== jobRef.current) return
      setProgress(event)
      if (event.status === 'done' || event.status === 'cancelled') {
        setPhase('finished')
        jobRef.current = null
      }
      if (event.status === 'error') {
        setError(event.error ?? { code: 'UNKNOWN', message: strings.progress.error })
        setPhase('ready')
        jobRef.current = null
      }
    })
  }, [])

  const runProbe = useCallback(async () => {
    setPhase('probing')
    setError(null)
    setInfo(null)
    setFormat(null)
    setProgress(null)
    const result = await window.tizo.probe(url)
    if (!result.ok) {
      setError(result.error)
      setPhase('idle')
      return
    }
    setInfo(result.value)
    // Default to something that works right now rather than the best option the
    // user cannot actually download yet.
    const usable = status?.ffmpeg.found
      ? result.value.formats[0]
      : result.value.formats.find((f) => !f.needsFfmpeg)
    setFormat(usable ?? result.value.formats[0] ?? null)
    setPhase('ready')
  }, [url, status])

  const start = useCallback(
    async (resolveConflict?: 'overwrite' | 'rename') => {
      if (!info || !format) return
      setError(null)
      setConflict(null)
      setProgress(null)
      setPhase('running')
      const result = await window.tizo.download({
        url: info.webpageUrl,
        format: format.id,
        needsFfmpeg: format.needsFfmpeg,
        outDir,
        ...(resolveConflict ? { resolveConflict } : {})
      })
      if (result.ok) {
        jobRef.current = result.jobId
        return
      }
      setPhase('ready')
      if ('conflict' in result) setConflict(result.conflict.path)
      else setError(result.error)
    },
    [info, format, outDir]
  )

  const hasFfmpeg = status?.ffmpeg.found ?? false

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-12">
      <section className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && url.trim() && phase !== 'probing') void runProbe()
          }}
          placeholder={strings.downloader.placeholder}
          spellCheck={false}
          autoFocus
          className="flex-1 select-text rounded-lg border border-white/10 bg-ink-900 px-4 py-3 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-accent-500"
        />
        <button
          onClick={() => void runProbe()}
          disabled={!url.trim() || phase === 'probing' || phase === 'running'}
          className="rounded-lg bg-accent-500 px-5 py-3 text-sm font-medium text-white transition enabled:hover:bg-accent-400 disabled:opacity-30"
        >
          {phase === 'probing' ? strings.downloader.checking : strings.downloader.check}
        </button>
      </section>

      {error && <ErrorCard error={error} />}

      {!info && !error && phase === 'idle' && (
        <div className="mt-10 text-center">
          <p className="text-sm text-white/45">{strings.downloader.emptyTitle}</p>
          <p className="mt-1 text-xs text-white/25">{strings.downloader.emptyBody}</p>
        </div>
      )}

      {info && (
        <section className="flex gap-4 rounded-xl border border-white/10 bg-ink-900 p-4">
          {info.thumbnail && (
            <img src={info.thumbnail} alt="" className="h-24 w-40 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0">
            <h2 className="truncate font-medium text-white/90">{info.title}</h2>
            <p className="mt-1 text-sm text-white/40">
              {info.uploader ?? strings.downloader.unknownUploader} · {duration(info.duration)} ·{' '}
              {info.extractor}
            </p>
          </div>
        </section>
      )}

      {info && info.formats.length > 0 && (
        <FormatPicker
          formats={info.formats}
          allFormats={info.allFormats}
          selected={format}
          hasFfmpeg={hasFfmpeg}
          onSelect={setFormat}
        />
      )}

      {info && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-white/40">{strings.downloader.saveTo}</span>
            <code className="min-w-0 flex-1 truncate rounded-md bg-ink-900 px-3 py-2 font-mono text-xs text-white/60">
              {outDir || '…'}
            </code>
            <button
              onClick={() => void window.tizo.pickFolder(outDir).then((d) => d && setOutDir(d))}
              className="rounded-md border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
            >
              {strings.downloader.change}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void start()}
              disabled={!format || phase === 'running' || (format.needsFfmpeg && !hasFfmpeg)}
              className="rounded-lg bg-accent-500 px-5 py-3 text-sm font-medium text-white transition enabled:hover:bg-accent-400 disabled:opacity-30"
            >
              {strings.downloader.download}
            </button>
            {phase === 'running' && (
              <button
                onClick={() => jobRef.current && void window.tizo.cancel(jobRef.current)}
                className="rounded-lg border border-white/10 px-5 py-3 text-sm text-white/70 hover:bg-white/5"
              >
                {strings.downloader.cancel}
              </button>
            )}
          </div>
        </section>
      )}

      {progress && <ProgressCard progress={progress} />}

      {conflict && (
        <ConflictDialog
          path={conflict}
          onKeepBoth={() => void start('rename')}
          onReplace={() => void start('overwrite')}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  )
}

function ProgressCard({ progress }: { progress: ProgressEvent }): React.JSX.Element {
  const pct = progress.percent ?? 0
  const label = strings.progress[progress.status]

  return (
    <section className="rounded-xl border border-white/10 bg-ink-900 p-4">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-white/80">{label}</span>
        <span className="font-mono text-xs text-white/40">
          {progress.status === 'downloading'
            ? `${pct.toFixed(1)}% · ${speed(progress.speed)} · ${strings.progress.eta} ${duration(progress.eta)}`
            : progress.status === 'done'
              ? strings.progress.complete
              : ''}
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full transition-[width] duration-200 ${
            progress.status === 'done' ? 'bg-emerald-400' : 'bg-accent-500'
          }`}
          style={{ width: `${progress.status === 'done' ? 100 : pct}%` }}
        />
      </div>

      {progress.downloadedBytes !== null && progress.status === 'downloading' && (
        <p className="mt-2 font-mono text-xs text-white/30">
          {bytes(progress.downloadedBytes)} {strings.progress.of} {bytes(progress.totalBytes)}
        </p>
      )}

      {progress.outputPath && (
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-white/50">
            {progress.outputPath}
          </code>
          <button
            onClick={() => progress.outputPath && void window.tizo.reveal(progress.outputPath)}
            className="shrink-0 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
          >
            {strings.downloader.showInFolder}
          </button>
        </div>
      )}
    </section>
  )
}

function ErrorCard({ error }: { error: { code: string; message: string } }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
      <p className="text-sm text-red-200">{error.message}</p>
      <p className="mt-1 font-mono text-[10px] tracking-wide text-red-300/40">{error.code}</p>
    </div>
  )
}

function ConflictDialog({
  path,
  onKeepBoth,
  onReplace,
  onCancel
}: {
  path: string
  onKeepBoth: () => void
  onReplace: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-8">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-ink-900 p-5">
        <h3 className="font-medium text-white/90">{strings.conflict.title}</h3>
        <p className="mt-1 text-sm text-white/50">{strings.conflict.body}</p>
        <code className="mt-3 block truncate rounded-md bg-ink-800 px-3 py-2 font-mono text-xs text-white/50">
          {path}
        </code>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
          >
            {strings.conflict.cancel}
          </button>
          <button
            onClick={onReplace}
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/5"
          >
            {strings.conflict.replace}
          </button>
          <button
            onClick={onKeepBoth}
            className="rounded-md bg-accent-500 px-3 py-2 text-xs font-medium text-white hover:bg-accent-400"
          >
            {strings.conflict.keepBoth}
          </button>
        </div>
      </div>
    </div>
  )
}
