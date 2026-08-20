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
    <div className="app-gradient flex h-full items-center justify-center px-8">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {strings.setup.title} <span className="text-brand-600">{strings.app.short}</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          {strings.setup.intro}
        </p>

        <ul className="mt-6 flex flex-col gap-2">
          {plan.components.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-surface-line bg-surface px-4 py-3 shadow-sm backdrop-blur-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink-900">{c.name}</span>
                  {c.installed && (
                    <span className="rounded bg-emerald-600/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                      {strings.setup.installedBadge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-500">{c.summary}</p>
              </div>
              <span className="shrink-0 pl-4 font-mono text-xs text-ink-500">
                {bytes(c.size)}
              </span>
            </li>
          ))}
        </ul>

        {running || progress?.phase === 'running' ? (
          <div className="mt-6">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-ink-900">
                {progress?.stage ? strings.setup.stages[progress.stage] : strings.setup.starting}
                {progress?.componentName ? ` ${progress.componentName}` : ''}
              </span>
              <span className="font-mono text-xs text-ink-500">{pct.toFixed(0)}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-900/10">
              <div
                className="h-full bg-brand-500 transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between font-mono text-xs text-ink-500">
              <span>
                {bytes(progress?.receivedBytes ?? 0)} {strings.progress.of}{' '}
                {bytes(progress?.totalBytes ?? 0)}
              </span>
              <span>{fmtSpeed(progress?.speed ?? null)}</span>
            </div>
            <button
              onClick={() => void window.tizo.cancelSetup()}
              className="mt-4 text-xs text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
            >
              {strings.setup.cancel}
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <button
              onClick={start}
              className="w-full rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-400"
            >
              {strings.setup.start} — {bytes(plan.totalBytes)}
            </button>
            <p className="mt-3 text-center text-xs text-ink-500">
              {strings.setup.resumeNote}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-600/25 bg-red-50/80 px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={start}
                className="rounded-md bg-white/70 px-3 py-1.5 text-xs text-ink-700 hover:bg-white"
              >
                {strings.setup.retry}
              </button>
              <button
                onClick={() => void manual()}
                className="rounded-md bg-white/70 px-3 py-1.5 text-xs text-ink-700 hover:bg-white"
              >
                {strings.setup.manual}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-red-700/70">
              {strings.setup.manualHint}
            </p>
          </div>
        )}

        {plan.manifestSource !== 'remote' && (
          <p className="mt-4 text-center text-[11px] text-amber-800">
            {strings.setup.offlineRegistry(plan.manifestSource)}
          </p>
        )}
      </div>
    </div>
  )
}
