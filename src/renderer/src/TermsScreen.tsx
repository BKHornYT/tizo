import { useEffect, useRef, useState } from 'react'
import { terms } from './terms'

/**
 * First-run terms gate.
 *
 * The agree button stays disabled until the text has actually been scrolled to
 * the end. It is a small thing, but a consent click on text nobody scrolled is
 * not consent — and the whole reason to ask is so the telemetry section gets
 * seen rather than buried.
 */
export default function TermsScreen({
  onAccept
}: {
  onAccept: () => void
}): React.JSX.Element {
  const [read, setRead] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = (): void => {
      // Short viewports can already be at the bottom on load.
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setRead(true)
    }
    check()
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [])

  return (
    <div className="app-gradient flex h-full items-center justify-center px-8 py-8">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-2xl border border-surface-line bg-surface-strong shadow-2xl">
        <header className="shrink-0 px-7 pt-7">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{terms.title}</h1>
          <p className="mt-1.5 text-sm text-ink-700">{terms.intro}</p>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-7 py-5 select-text"
        >
          {terms.sections.map((section) => (
            <section key={section.heading} className="mb-5 last:mb-0">
              <h2 className="text-sm font-semibold text-ink-900">{section.heading}</h2>
              {section.body.map((paragraph, i) => (
                <p key={i} className="mt-1.5 text-[13px] leading-relaxed text-ink-700">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <footer className="shrink-0 border-t border-surface-line px-7 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-500">{terms.reviewLater}</span>
            <div className="flex gap-2">
              <button
                onClick={() => void window.tizo.quit()}
                className="rounded-md bg-ink-900/8 px-4 py-2 text-xs text-ink-700 transition hover:bg-ink-900/15"
              >
                {terms.decline}
              </button>
              <button
                onClick={onAccept}
                disabled={!read}
                className="rounded-md bg-brand-500 px-5 py-2 text-xs font-medium text-white transition enabled:hover:bg-brand-400 disabled:opacity-35"
              >
                {terms.agree}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
