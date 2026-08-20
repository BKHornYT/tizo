import { useCallback, useEffect, useState } from 'react'
import type { EngineStatus, SetupPlan, Settings } from '../../shared/types'
import { strings } from './strings'
import SetupWizard from './SetupWizard'
import Queue from './views/Queue'
import SettingsView from './views/SettingsView'

type View = 'download' | 'settings'

export default function App(): React.JSX.Element {
  const [plan, setPlan] = useState<SetupPlan | null>(null)
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>('download')

  const refresh = useCallback(async () => {
    const [nextPlan, nextStatus, nextSettings] = await Promise.all([
      window.tizo.setupPlan(),
      window.tizo.engineStatus(),
      window.tizo.getSettings()
    ])
    setPlan(nextPlan)
    setStatus(nextStatus)
    setSettings(nextSettings)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Nothing renders until we know whether setup is owed — flashing the main UI
  // and then replacing it with a wizard reads as a bug.
  if (!plan) return <div className="h-full bg-ink-950" />
  if (plan.required) return <SetupWizard plan={plan} onDone={() => void refresh()} />

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-8 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold text-white">
            Video Downloader <span className="text-accent-400">Tizo</span>
          </span>
          <nav className="flex gap-1">
            <Tab active={view === 'download'} onClick={() => setView('download')}>
              {strings.nav.download}
            </Tab>
            <Tab active={view === 'settings'} onClick={() => setView('settings')}>
              {strings.nav.settings}
            </Tab>
          </nav>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {!status?.ytdlp.found && <Pill label={strings.status.noEngine} tone="warn" />}
          {!status?.ffmpeg.found && <Pill label={strings.status.noFfmpeg} tone="warn" />}
          {status?.portable && <Pill label={strings.status.portable} tone="ok" />}
          <button
            onClick={() => settings && void window.tizo.openPath(settings.outputDir)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-white/50 transition hover:bg-white/5 hover:text-white/80"
          >
            {strings.queue.openOutput}
          </button>
        </div>
      </header>

      {view === 'download' ? (
        <Queue status={status} />
      ) : (
        <main className="flex-1 overflow-y-auto px-8 py-6">
          <SettingsView status={status} onChanged={() => void refresh()} />
        </main>
      )}
    </div>
  )
}

function Tab({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        active ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
      }`}
    >
      {children}
    </button>
  )
}

function Pill({ label, tone }: { label: string; tone: 'ok' | 'warn' }): React.JSX.Element {
  return (
    <span
      className={`rounded-full px-2.5 py-1 ${
        tone === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
      }`}
    >
      {label}
    </span>
  )
}
