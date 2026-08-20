import { useEffect, useState } from 'react'

type Versions = Awaited<ReturnType<Window['tizo']['getVersions']>>

export default function App(): React.JSX.Element {
  const [versions, setVersions] = useState<Versions | null>(null)

  useEffect(() => {
    void window.tizo.getVersions().then(setVersions)
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-ink-950 px-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Video Downloader <span className="text-accent-400">Tizo</span>
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Phase 0 — scaffold. The shell is alive and the IPC bridge is wired.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-xl border border-white/10 bg-ink-900 px-6 py-5 text-sm">
        {versions ? (
          Object.entries(versions).map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="text-white/40 capitalize">{name}</dt>
              <dd className="font-mono text-white/80">{value}</dd>
            </div>
          ))
        ) : (
          <span className="col-span-2 text-white/40">Reading versions…</span>
        )}
      </dl>

      <p className="text-xs text-white/25">Next: Phase 1 — the download engine.</p>
    </div>
  )
}
