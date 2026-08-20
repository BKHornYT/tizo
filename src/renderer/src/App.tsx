import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  EngineStatus,
  FormatOption,
  MediaInfo,
  ProgressEvent,
  SetupPlan
} from '../../shared/types'
import { bytes, duration, speed } from './format'
import SetupWizard from './SetupWizard'

type Phase = 'idle' | 'probing' | 'ready' | 'running' | 'finished'

export default function App(): React.JSX.Element {
  const [plan, setPlan] = useState<SetupPlan | null>(null)

  const refreshPlan = useCallback(async () => {
    setPlan(await window.tizo.setupPlan())
  }, [])

  useEffect(() => {
    void refreshPlan()
  }, [refreshPlan])

  // Nothing renders until we know whether setup is owed — flashing the main UI
  // and then replacing it with a wizard reads as a bug.
  if (!plan) return <div className="h-full bg-ink-950" />
  if (plan.required) return <SetupWizard plan={plan} onDone={() => void refreshPlan()} />
  return <Downloader />
}

function Downloader(): React.JSX.Element {
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [url, setUrl] = useState('')
  const [outDir, setOutDir] = useState('')
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [format, setFormat] = useState<FormatOption | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)

  const jobRef = useRef<string | null>(null)

  useEffect(() => {
    void window.tizo.engineStatus().then(setStatus)
    void window.tizo.defaultDownloadDir().then(setOutDir)
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
        setError(event.error ?? { code: 'UNKNOWN', message: 'Download failed.' })
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
    // Default to something that works right now rather than the best option
    // the user cannot actually download yet.
    setFormat(result.value.formats.find((f) => !f.needsFfmpeg) ?? result.value.formats[0] ?? null)
    setPhase('ready')
  }, [url])

  const runDownload = useCallback(async () => {
    if (!info || !format) return
    setError(null)
    setProgress(null)
    setPhase('running')
    const result = await window.tizo.download({
      url: info.webpageUrl,
      format: format.id,
      outDir,
      needsFfmpeg: format.needsFfmpeg
    })
    if (!result.ok) {
      setError(result.error)
      setPhase('ready')
      return
    }
    jobRef.current = result.jobId
  }, [info, format, outDir])

  const hasFfmpeg = status?.ffmpeg.found ?? false

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header status={status} />

      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <section className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && url.trim() && phase !== 'probing') void runProbe()
              }}
              placeholder="Paste a video link…"
              spellCheck={false}
              className="flex-1 select-text rounded-lg border border-white/10 bg-ink-900 px-4 py-3 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-accent-500"
            />
            <button
              onClick={() => void runProbe()}
              disabled={!url.trim() || phase === 'probing' || phase === 'running'}
              className="rounded-lg bg-accent-500 px-5 py-3 text-sm font-medium text-white transition enabled:hover:bg-accent-400 disabled:opacity-30"
            >
              {phase === 'probing' ? 'Checking…' : 'Check'}
            </button>
          </section>

          {error && <ErrorCard error={error} />}

          {info && (
            <section className="flex gap-4 rounded-xl border border-white/10 bg-ink-900 p-4">
              {info.thumbnail && (
                <img src={info.thumbnail} alt="" className="h-24 w-40 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0">
                <h2 className="truncate font-medium text-white/90">{info.title}</h2>
                <p className="mt-1 text-sm text-white/40">
                  {info.uploader ?? 'Unknown'} · {duration(info.duration)} · {info.extractor}
                </p>
              </div>
            </section>
          )}

          {info && info.formats.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-white/40 uppercase">Quality</h3>
              {info.formats.map((f) => (
                <FormatRow
                  key={f.id}
                  format={f}
                  selected={format?.id === f.id}
                  blocked={f.needsFfmpeg && !hasFfmpeg}
                  onSelect={() => setFormat(f)}
                />
              ))}
            </section>
          )}

          {info && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="shrink-0 text-white/40">Save to</span>
                <code className="min-w-0 flex-1 truncate rounded-md bg-ink-900 px-3 py-2 font-mono text-xs text-white/60">
                  {outDir || '…'}
                </code>
                <button
                  onClick={() => void window.tizo.pickFolder(outDir).then((d) => d && setOutDir(d))}
                  className="rounded-md border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
                >
                  Change
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => void runDownload()}
                  disabled={!format || phase === 'running' || (format.needsFfmpeg && !hasFfmpeg)}
                  className="rounded-lg bg-accent-500 px-5 py-3 text-sm font-medium text-white transition enabled:hover:bg-accent-400 disabled:opacity-30"
                >
                  Download
                </button>
                {phase === 'running' && (
                  <button
                    onClick={() => jobRef.current && void window.tizo.cancel(jobRef.current)}
                    className="rounded-lg border border-white/10 px-5 py-3 text-sm text-white/70 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </section>
          )}

          {progress && <ProgressCard progress={progress} />}
        </div>
      </main>
    </div>
  )
}

function Header({ status }: { status: EngineStatus | null }): React.JSX.Element {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-8 py-4">
      <div className="flex items-baseline gap-3">
        <span className="font-semibold text-white">
          Video Downloader <span className="text-accent-400">Tizo</span>
        </span>
        <span className="text-xs text-white/25">Phase 1 — engine</span>
      </div>
      <div className="flex gap-2 text-xs">
        <Pill
          label={`yt-dlp ${status?.ytdlp.version ?? '—'}`}
          ok={status?.ytdlp.found ?? false}
          hint={status?.ytdlp.source}
        />
        <Pill
          label={status?.ffmpeg.found ? `ffmpeg ${status.ffmpeg.version}` : 'no ffmpeg'}
          ok={status?.ffmpeg.found ?? false}
          hint={status?.ffmpeg.source}
        />
        {status?.portable && <Pill label="portable" ok />}
      </div>
    </header>
  )
}

function Pill({ label, ok, hint }: { label: string; ok: boolean; hint?: string }): React.JSX.Element {
  return (
    <span
      title={hint}
      className={`rounded-full px-2.5 py-1 ${
        ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
      }`}
    >
      {label}
    </span>
  )
}

function FormatRow({
  format,
  selected,
  blocked,
  onSelect
}: {
  format: FormatOption
  selected: boolean
  blocked: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onSelect}
      className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
        selected ? 'border-accent-500 bg-accent-500/10' : 'border-white/10 bg-ink-900 hover:border-white/20'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/90">{format.label}</span>
          <span className="text-xs text-white/30 uppercase">{format.ext}</span>
          {blocked && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              needs HQ pack
            </span>
          )}
        </div>
        {format.note && <p className="mt-0.5 truncate text-xs text-white/35">{format.note}</p>}
      </div>
      <span className="shrink-0 pl-4 font-mono text-xs text-white/40">{bytes(format.filesize)}</span>
    </button>
  )
}

function ProgressCard({ progress }: { progress: ProgressEvent }): React.JSX.Element {
  const pct = progress.percent ?? 0
  const labels: Record<ProgressEvent['status'], string> = {
    downloading: 'Downloading',
    processing: 'Processing',
    done: 'Done',
    error: 'Failed',
    cancelled: 'Cancelled'
  }

  return (
    <section className="rounded-xl border border-white/10 bg-ink-900 p-4">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-white/80">{labels[progress.status]}</span>
        <span className="font-mono text-xs text-white/40">
          {progress.status === 'downloading'
            ? `${pct.toFixed(1)}% · ${speed(progress.speed)} · ETA ${duration(progress.eta)}`
            : progress.status === 'done'
              ? 'Complete'
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
          {bytes(progress.downloadedBytes)} of {bytes(progress.totalBytes)}
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
            Show in folder
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
