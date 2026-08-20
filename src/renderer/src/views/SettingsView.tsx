import { useEffect, useState } from 'react'
import type {
  Container,
  EngineStatus,
  FileExistsRule,
  Settings,
  UpdateState
} from '../../../shared/types'
import { strings } from '../strings'

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

  useEffect(() => {
    void window.tizo.getSettings().then(setSettings)
    void window.tizo.updates.state().then(setUpdate)
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
