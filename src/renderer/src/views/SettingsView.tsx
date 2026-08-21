import { useEffect, useState } from 'react'
import type {
  AudioBitrate,
  Container,
  EngineStatus,
  FeedbackKind,
  FileExistsRule,
  Settings,
  SiteStat,
  SubtitleMode,
  UpdateState
} from '../../../shared/types'
import { AUDIO_BITRATES } from '../../../shared/types'
import { strings } from '../strings'
import { terms as termsCopy } from '../terms'
import FeedbackDialog from '../components/FeedbackDialog'

const SPEED_PRESETS: Array<{ label: string; value: number | null }> = [
  { label: strings.settings.unlimited, value: null },
  { label: '10 MB/s', value: 10_240 },
  { label: '5 MB/s', value: 5120 },
  { label: '2 MB/s', value: 2048 },
  { label: '1 MB/s', value: 1024 },
  { label: '500 KB/s', value: 500 }
]

const RULES: FileExistsRule[] = ['skip-if-same', 'rename', 'overwrite', 'ask']
const CONTAINERS: Container[] = ['mp4', 'mkv', 'original']
const SUB_MODES: SubtitleMode[] = ['embed', 'file', 'both']

/**
 * The stored value is a list; the field is one comma-separated line, which is
 * how people actually think about "en, nb". Anything that is not a plain
 * language code is dropped rather than sent to the command line.
 */
function parseLangs(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((l) => l.trim().toLowerCase())
        .filter((l) => /^[a-z0-9-]{1,20}$/.test(l))
    )
  ].slice(0, 20)
}

export default function SettingsView({
  status,
  onChanged
}: {
  status: EngineStatus | null
  onChanged?: () => void
}): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [checking, setChecking] = useState(false)
  const [sites, setSites] = useState<SiteStat[]>([])
  const [statsPossible, setStatsPossible] = useState(true)
  const [pending, setPending] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState<FeedbackKind | null>(null)
  const [showTerms, setShowTerms] = useState(false)

  const reloadStats = (): void => {
    void window.tizo.stats.local().then(setSites)
    void window.tizo.stats.pending().then((p) => setPending(p.sites))
  }

  useEffect(() => {
    void window.tizo.getSettings().then(setSettings)
    void window.tizo.updates.state().then(setUpdate)
    void window.tizo.stats.enabled().then(setStatsPossible)
    reloadStats()
    return window.tizo.updates.onChange(setUpdate)
  }, [])

  const patch = async (change: Partial<Settings>): Promise<void> => {
    const next = await window.tizo.setSettings(change)
    setSettings(next)
    onChanged?.()
  }

  if (!settings) return <div />

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-12">
      <Group title={strings.settings.title}>
        <Row label={strings.settings.outputDir} hint={strings.settings.outputDirHint}>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-ink-900/6 px-3 py-2 font-mono text-xs text-ink-700">
              {settings.outputDir}
            </code>
            <button
              onClick={() =>
                void window.tizo.pickFolder(settings.outputDir).then((dir) => {
                  if (dir) void patch({ outputDir: dir })
                })
              }
              className="shrink-0 rounded-md bg-brand-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-400"
            >
              {strings.downloader.change}
            </button>
          </div>
        </Row>

        <Row label={strings.settings.maxSpeed} hint={strings.settings.maxSpeedHint}>
          <Select
            value={String(settings.maxSpeedKbps ?? '')}
            onChange={(v) => void patch({ maxSpeedKbps: v === '' ? null : Number(v) })}
            options={SPEED_PRESETS.map((p) => ({ value: String(p.value ?? ''), label: p.label }))}
          />
        </Row>

        <Row label={strings.settings.container} hint={strings.settings.containerHint}>
          <Select
            value={settings.container}
            onChange={(v) => void patch({ container: v as Container })}
            options={CONTAINERS.map((c) => ({ value: c, label: strings.settings.containers[c] }))}
          />
        </Row>

        <Row label={strings.settings.onFileExists} hint={strings.settings.onFileExistsHint}>
          <Select
            value={settings.onFileExists}
            onChange={(v) => void patch({ onFileExists: v as FileExistsRule })}
            options={RULES.map((r) => ({ value: r, label: strings.settings.rules[r] }))}
          />
        </Row>

        <Row label={strings.settings.concurrent} hint={strings.settings.concurrentHint}>
          <Select
            value={String(settings.concurrentDownloads)}
            onChange={(v) => void patch({ concurrentDownloads: Number(v) })}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </Row>

        <Toggle
          label={strings.settings.folderPerDownload}
          hint={strings.settings.folderPerDownloadHint}
          checked={settings.folderPerDownload}
          onChange={(v) => void patch({ folderPerDownload: v })}
        />
        <Toggle
          label={strings.settings.geoBypass}
          hint={strings.settings.geoBypassHint}
          checked={settings.geoBypass}
          onChange={(v) => void patch({ geoBypass: v })}
        />
      </Group>

      <Group title={strings.settings.audio}>
        <p className="-mt-1 text-xs text-ink-500">{strings.settings.audioHint}</p>

        <Row label={strings.settings.audioBitrate} hint={strings.settings.audioBitrateHint}>
          <Select
            value={String(settings.audioBitrate)}
            onChange={(v) => void patch({ audioBitrate: Number(v) as AudioBitrate })}
            options={AUDIO_BITRATES.map((b) => ({ value: String(b), label: `${b} kbps` }))}
          />
        </Row>

        <Toggle
          label={strings.settings.embedThumbnail}
          hint={strings.settings.embedThumbnailHint}
          checked={settings.embedThumbnail}
          onChange={(v) => void patch({ embedThumbnail: v })}
        />
        <Toggle
          label={strings.settings.embedMetadata}
          hint={strings.settings.embedMetadataHint}
          checked={settings.embedMetadata}
          onChange={(v) => void patch({ embedMetadata: v })}
        />
      </Group>

      <Group title={strings.settings.subtitles}>
        <p className="-mt-1 text-xs text-ink-500">{strings.settings.subtitlesHint}</p>

        <Row label={strings.settings.subtitleLangs} hint={strings.settings.subtitleLangsHint}>
          <input
            type="text"
            defaultValue={settings.subtitleLangs.join(', ')}
            placeholder="en, nb"
            // Committed on blur rather than per keystroke: parsing mid-typing
            // would delete the separator the moment it was typed.
            onBlur={(e) => void patch({ subtitleLangs: parseLangs(e.target.value) })}
            className="w-full rounded-md border border-ink-900/10 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500"
          />
        </Row>

        <Row label={strings.settings.subtitleMode} hint="">
          <Select
            value={settings.subtitleMode}
            onChange={(v) => void patch({ subtitleMode: v as SubtitleMode })}
            options={SUB_MODES.map((m) => ({
              value: m,
              label: strings.settings.subtitleModes[m]
            }))}
          />
        </Row>

        <Toggle
          label={strings.settings.subtitleAuto}
          hint={strings.settings.subtitleAutoHint}
          checked={settings.subtitleAuto}
          onChange={(v) => void patch({ subtitleAuto: v })}
        />
      </Group>

      <Group title={strings.settings.updates}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-700">{strings.settings.appVersion}</span>
          <span className="font-mono text-xs text-ink-500">
            {update ? strings.update.version(update.app.currentVersion) : '—'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-700">{strings.settings.engineVersion}</span>
          <span className="font-mono text-xs text-ink-500">
            {update?.engine.status === 'updating'
              ? strings.update.engineUpdating
              : (update?.engine.currentVersion ?? status?.ytdlp.version ?? '—')}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-ink-500">
          {update?.app.reason === 'dev'
            ? strings.update.devNote
            : update?.app.reason === 'portable'
              ? strings.update.portableNote
              : strings.settings.updatesHint}
        </p>

        <div>
          <button
            onClick={() => {
              setChecking(true)
              void window.tizo.updates.check().finally(() => setChecking(false))
            }}
            disabled={checking}
            className="rounded-md bg-brand-500 px-4 py-2 text-xs font-medium text-white transition enabled:hover:bg-brand-400 disabled:opacity-40"
          >
            {checking ? strings.update.checking : strings.update.check}
          </button>
        </div>
      </Group>

      <Group title={strings.settings.privacy}>
        <Toggle
          label={strings.settings.shareStats}
          hint={strings.settings.shareStatsHint}
          checked={settings.shareStats}
          onChange={(v) => void patch({ shareStats: v })}
        />

        {!statsPossible && (
          <p className="rounded-md bg-ink-900/6 px-3 py-2 text-xs text-ink-500">
            {strings.settings.statsUnavailable}
          </p>
        )}

        {settings.shareStats && Object.keys(pending).length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-ink-500">{strings.settings.nextUpload}</p>
            <pre className="max-h-32 overflow-auto rounded-md bg-ink-900/6 p-2.5 font-mono text-[11px] whitespace-pre-wrap text-ink-700 select-text">
              {JSON.stringify({ sites: pending }, null, 2)}
            </pre>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-500">{strings.settings.yourSites}</p>
          {sites.length === 0 ? (
            <p className="text-xs text-ink-400">{strings.settings.noSites}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sites.slice(0, 8).map((site) => (
                <li key={site.domain} className="flex justify-between text-xs">
                  <span className="text-ink-700">{site.domain}</span>
                  <span className="font-mono text-ink-500">{site.downloads}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void window.tizo.stats.clear().then(reloadStats)}
            className="rounded-md bg-ink-900/8 px-3 py-2 text-xs text-ink-700 transition hover:bg-ink-900/15"
          >
            {strings.settings.clearStats}
          </button>
          <button
            onClick={() => setShowTerms(true)}
            className="rounded-md bg-ink-900/8 px-3 py-2 text-xs text-ink-700 transition hover:bg-ink-900/15"
          >
            {strings.settings.viewTerms}
          </button>
        </div>
      </Group>

      <Group title={strings.settings.feedbackSection}>
        <p className="text-xs leading-relaxed text-ink-500">{strings.settings.feedbackHint}</p>
        <div className="flex flex-wrap gap-2">
          {(['site', 'idea', 'bug'] as FeedbackKind[]).map((kind) => (
            <button
              key={kind}
              onClick={() => setFeedback(kind)}
              className="rounded-md bg-brand-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-400"
            >
              {strings.feedback.kinds[kind]}
            </button>
          ))}
          <button
            onClick={() => void window.tizo.feedback.browseIssues()}
            className="rounded-md bg-ink-900/8 px-3 py-2 text-xs text-ink-700 transition hover:bg-ink-900/15"
          >
            {strings.feedback.browse}
          </button>
        </div>
      </Group>

      <Group title={strings.settings.components}>
        <ComponentRow
          name="Download engine (yt-dlp)"
          version={status?.ytdlp.version ?? null}
          installed={status?.ytdlp.found ?? false}
        />
        <ComponentRow
          name="HQ Pack (ffmpeg)"
          version={status?.ffmpeg.version ?? null}
          installed={status?.ffmpeg.found ?? false}
        />
        <div className="pt-1">
          <p className="text-xs text-ink-500">{strings.settings.dataLocation}</p>
          <code className="mt-1 block truncate font-mono text-[11px] text-ink-400">
            {status?.dataDir ?? '—'}
          </code>
        </div>
      </Group>

      {feedback && <FeedbackDialog kind={feedback} onClose={() => setFeedback(null)} />}

      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-chrome-900/60 px-8 py-10">
          <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-surface-line bg-white shadow-2xl">
            <header className="shrink-0 px-6 pt-6">
              <h3 className="text-lg font-semibold text-ink-900">{termsCopy.title}</h3>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 select-text">
              {termsCopy.sections.map((section) => (
                <section key={section.heading} className="mb-4 last:mb-0">
                  <h4 className="text-sm font-semibold text-ink-900">{section.heading}</h4>
                  {section.body.map((paragraph, i) => (
                    <p key={i} className="mt-1 text-[13px] leading-relaxed text-ink-700">
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
            </div>
            <footer className="flex shrink-0 justify-end border-t border-surface-line px-6 py-3">
              <button
                onClick={() => setShowTerms(false)}
                className="rounded-md bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-400"
              >
                {strings.feedback.cancel}
              </button>
            </footer>
          </div>
        </div>
      )}

      <div>
        <button
          onClick={() => void window.tizo.resetSettings().then(setSettings)}
          className="rounded-md bg-white/60 px-4 py-2 text-xs text-ink-700 transition hover:bg-white"
        >
          {strings.settings.reset}
        </button>
      </div>
    </div>
  )
}

function Group({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-surface-line bg-surface p-5 shadow-sm backdrop-blur-sm">
      <h3 className="text-xs font-semibold tracking-wide text-ink-700 uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink-900">{label}</label>
      {children}
      <p className="text-xs text-ink-500">{hint}</p>
    </div>
  )
}

function Select({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}): React.JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white outline-none hover:bg-brand-400"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-white text-ink-900">
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 text-left"
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
          checked ? 'bg-brand-500' : 'bg-ink-900/15'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        <span className="mt-0.5 block text-xs text-ink-500">{hint}</span>
      </span>
    </button>
  )
}

function ComponentRow({
  name,
  version,
  installed
}: {
  name: string
  version: string | null
  installed: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-700">{name}</span>
      <span className={`font-mono text-xs ${installed ? 'text-emerald-700' : 'text-amber-700'}`}>
        {installed ? (version ?? strings.settings.installed) : strings.settings.notInstalled}
      </span>
    </div>
  )
}
