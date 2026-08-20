import { useCallback, useEffect, useState } from 'react'
import type {
  EngineStatus,
  SetupPlan,
  Settings,
  TermsState,
  UpdateState
} from '../../shared/types'
import { strings } from './strings'
import SetupWizard from './SetupWizard'
import TermsScreen from './TermsScreen'
import Queue from './views/Queue'
import SettingsView from './views/SettingsView'
import Icon, { type IconName } from './components/Icon'
import FeedbackDialog from './components/FeedbackDialog'

type View = 'download' | 'settings'
export type SortKey = 'added' | 'title' | 'size' | 'state'

export default function App(): React.JSX.Element {
  const [terms, setTerms] = useState<TermsState | null>(null)
  const [plan, setPlan] = useState<SetupPlan | null>(null)
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>('download')
  const [sort, setSort] = useState<SortKey>('added')
  const [sortOpen, setSortOpen] = useState(false)
  // Bumped to ask the queue view to pull from the clipboard.
  const [pasteToken, setPasteToken] = useState(0)
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)

  const refresh = useCallback(async () => {
    const [nextTerms, nextPlan, nextStatus, nextSettings] = await Promise.all([
      window.tizo.terms.state(),
      window.tizo.setupPlan(),
      window.tizo.engineStatus(),
      window.tizo.getSettings()
    ])
    setTerms(nextTerms)
    setPlan(nextPlan)
    setStatus(nextStatus)
    setSettings(nextSettings)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void window.tizo.updates.state().then(setUpdate)
    return window.tizo.updates.onChange(setUpdate)
  }, [])

  // Nothing renders until we know what is owed — flashing the main UI and then
  // replacing it with a gate reads as a bug.
  if (!plan || !terms) return <div className="app-gradient h-full" />
  // Terms come before setup: they cover the download that setup is about to do.
  if (terms.required) {
    return <TermsScreen onAccept={() => void window.tizo.terms.accept().then(() => refresh())} />
  }
  if (plan.required) return <SetupWizard plan={plan} onDone={() => void refresh()} />

  return (
    <div className="flex h-full flex-col overflow-hidden bg-chrome-900">
      <header className="relative z-30 flex shrink-0 items-end justify-between bg-chrome-800 px-4 pt-2 pb-1.5 shadow-lg shadow-black/20">
        <div className="flex items-end gap-1">
          <ToolButton
            icon="add"
            label={strings.toolbar.add}
            onClick={() => {
              setView('download')
              setPasteToken((n) => n + 1)
            }}
          />
          <ToolButton
            icon="downloads"
            label={strings.toolbar.downloads}
            active={view === 'download'}
            onClick={() => setView('download')}
          />
          <div className="relative">
            <ToolButton
              icon="sort"
              label={strings.toolbar.sorting}
              active={sortOpen}
              onClick={() => setSortOpen((v) => !v)}
            />
            {sortOpen && (
              <SortMenu
                value={sort}
                onPick={(key) => {
                  setSort(key)
                  setSortOpen(false)
                }}
                onClose={() => setSortOpen(false)}
              />
            )}
          </div>
          <ToolButton
            icon="options"
            label={strings.toolbar.options}
            active={view === 'settings'}
            onClick={() => setView('settings')}
          />
          <ToolButton
            icon="folder"
            label={strings.toolbar.openOutput}
            onClick={() => settings && void window.tizo.openPath(settings.outputDir)}
          />
          <ToolButton
            icon="feedback"
            label={strings.toolbar.feedback}
            onClick={() => setSuggesting(true)}
          />
        </div>

        <div className="flex items-center gap-2 pb-1.5 text-xs">
          {!status?.ytdlp.found && <Pill label={strings.status.noEngine} tone="warn" />}
          {!status?.ffmpeg.found && <Pill label={strings.status.noFfmpeg} tone="warn" />}
          {status?.portable && <Pill label={strings.status.portable} tone="ok" />}
          <button
            onClick={() => void window.tizo.updates.check()}
            title={strings.update.check}
            className="pl-1 font-mono text-[11px] text-white/40 transition hover:text-white/80"
          >
            {update ? strings.update.version(update.app.currentVersion) : ''}
          </button>
        </div>
      </header>

      {suggesting && <FeedbackDialog kind="idea" onClose={() => setSuggesting(false)} />}

      {update?.app.status === 'ready' && update.app.newVersion !== dismissed && (
        <UpdateBanner
          version={update.app.newVersion ?? ''}
          onDismiss={() => setDismissed(update.app.newVersion)}
        />
      )}

      <div className="app-gradient relative min-h-0 flex-1">
        {view === 'download' ? (
          <Queue status={status} sort={sort} pasteToken={pasteToken} />
        ) : (
          <main className="h-full overflow-y-auto px-8 py-6">
            <SettingsView status={status} onChanged={() => void refresh()} />
          </main>
        )}
      </div>
    </div>
  )
}

function UpdateBanner({
  version,
  onDismiss
}: {
  version: string
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 bg-brand-600 px-8 py-2 text-xs text-white">
      <span>{strings.update.ready(version)}</span>
      <button
        onClick={() => void window.tizo.updates.install()}
        className="rounded-md bg-white/20 px-3 py-1 font-medium transition hover:bg-white/30"
      >
        {strings.update.restart}
      </button>
      <button onClick={onDismiss} className="text-white/60 transition hover:text-white">
        {strings.update.later}
      </button>
    </div>
  )
}

function ToolButton({
  icon,
  label,
  onClick,
  active
}: {
  icon: IconName
  label: string
  onClick: () => void
  active?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex w-[5.5rem] flex-col items-center gap-1 rounded-md px-2 py-1.5 transition ${
        active ? 'bg-white/12 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'
      }`}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" />
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  )
}

function SortMenu({
  value,
  onPick,
  onClose
}: {
  value: SortKey
  onPick: (key: SortKey) => void
  onClose: () => void
}): React.JSX.Element {
  const options: Array<{ key: SortKey; label: string }> = [
    { key: 'added', label: strings.sort.added },
    { key: 'title', label: strings.sort.title },
    { key: 'size', label: strings.sort.size },
    { key: 'state', label: strings.sort.state }
  ]

  return (
    <>
      {/* Click-away layer, so the menu closes like a menu should. */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute top-full left-0 z-40 mt-1 w-48 overflow-hidden rounded-lg bg-chrome-700 py-1 shadow-xl shadow-black/40">
        {options.map((option) => (
          <button
            key={option.key}
            onClick={() => onPick(option.key)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
              value === option.key
                ? 'bg-brand-500/30 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="w-3">{value === option.key ? '✓' : ''}</span>
            {option.label}
          </button>
        ))}
      </div>
    </>
  )
}

function Pill({ label, tone }: { label: string; tone: 'ok' | 'warn' }): React.JSX.Element {
  return (
    <span
      className={`rounded-full px-2.5 py-1 ${
        tone === 'ok' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200'
      }`}
    >
      {label}
    </span>
  )
}
