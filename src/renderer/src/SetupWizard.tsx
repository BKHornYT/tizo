import { useEffect, useState } from 'react'
import type { SetupPlan, SetupProgress } from '../../shared/types'
import { bytes, speed as fmtSpeed } from './format'
import { strings } from './strings'

export default function SetupWizard({
  plan,
  onDone
}: {
  plan: SetupPlan
  onDone: () => void
}): React.JSX.Element {
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return window.tizo.onSetupProgress((event) => {
      setProgress(event)
      if (event.phase === 'done') {
        setRunning(false)
        onDone()
      }
      if (event.phase === 'error') {
        setRunning(false)
        setError(event.error ?? strings.setup.failed)
      }
      if (event.phase === 'cancelled') setRunning(false)
    })
  }, [onDone])

  const start = (): void => {
    setError(null)
    setRunning(true)
    void window.tizo.runSetup()
  }

  const manual = async (): Promise<void> => {
    const result = await window.tizo.installFromFile('ffmpeg')
    if (result.ok) onDone()
    else if (result.error !== 'Cancelled.') setError(result.error)
  }

  const pct = progress?.overallPercent ?? 0

  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {strings.setup.title} <span className="text-accent-400">{strings.app.short}</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          {strings.setup.intro}
        </p>

        <ul className="mt-6 flex flex-col gap-2">
          {plan.components.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-ink-900 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/90">{c.name}</span>
                  {c.installed && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      {strings.setup.installedBadge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-white/40">{c.summary}</p>
              </div>
              <span className="shrink-0 pl-4 font-mono text-xs text-white/40">
                {bytes(c.size)}
              </span>
            </li>
          ))}
        </ul>

        {running || progress?.phase === 'running' ? (
          <div className="mt-6">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-white/80">
                {progress?.stage ? strings.setup.stages[progress.stage] : strings.setup.starting}
                {progress?.componentName ? ` ${progress.componentName}` : ''}
              </span>
              <span className="font-mono text-xs text-white/40">{pct.toFixed(0)}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full bg-accent-500 transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between font-mono text-xs text-white/30">
              <span>
                {bytes(progress?.receivedBytes ?? 0)} {strings.progress.of}{' '}
                {bytes(progress?.totalBytes ?? 0)}
              </span>
              <span>{fmtSpeed(progress?.speed ?? null)}</span>
            </div>
            <button
              onClick={() => void window.tizo.cancelSetup()}
              className="mt-4 text-xs text-white/30 underline-offset-4 hover:text-white/60 hover:underline"
            >
              {strings.setup.cancel}
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <button
              onClick={start}
              className="w-full rounded-lg bg-accent-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-accent-400"
            >
              {strings.setup.start} — {bytes(plan.totalBytes)}
            </button>
            <p className="mt-3 text-center text-xs text-white/25">
              {strings.setup.resumeNote}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <p className="text-sm text-red-200">{error}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={start}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
              >
                {strings.setup.retry}
              </button>
              <button
                onClick={() => void manual()}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
              >
                {strings.setup.manual}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-red-300/40">
              {strings.setup.manualHint}
            </p>
          </div>
        )}

        {plan.manifestSource !== 'remote' && (
          <p className="mt-4 text-center text-[11px] text-amber-300/50">
            {strings.setup.offlineRegistry(plan.manifestSource)}
          </p>
        )}
      </div>
    </div>
  )
}
