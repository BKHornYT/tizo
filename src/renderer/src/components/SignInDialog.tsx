import { useEffect, useRef, useState } from 'react'
import type { SignInResult } from '../../../shared/types'
import { strings } from '../strings'

type Phase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'notice' }
  | { kind: 'waiting' }
  /** After a file import was abandoned: open the window again, or pick a file. */
  | { kind: 'importOrWindow' }
  | { kind: 'result'; result: SignInResult }

/**
 * Walks through one sign-in: the one-time notice, then the separate sign-in
 * window (which the main process opens and owns), then the outcome.
 *
 * The page the user signs in to never renders in this window. It sits in its
 * own sandboxed window; this dialog only holds the Done / Cancel buttons.
 */
export default function SignInDialog({
  site,
  onClose
}: {
  site: string
  onClose: (changed: boolean) => void
}): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const started = useRef(false)
  // Set while switching from the window to a file import, so the window's own
  // "cancelled" result does not close the dialog underneath the file picker.
  const importing = useRef(false)

  const begin = (): void => {
    if (started.current) return
    started.current = true
    setPhase({ kind: 'waiting' })
    void window.tizo.auth.signIn(site).then((result) => {
      if (!importing.current) setPhase({ kind: 'result', result })
    })
  }

  const importInstead = (): void => {
    importing.current = true
    void window.tizo.auth
      .cancel()
      .then(() => window.tizo.auth.importFile(site))
      .then((result) => {
        if (!result.ok && result.reason === 'cancelled') {
          // Picker closed without a file: back to choosing, not out of the dialog.
          importing.current = false
          started.current = false
          setPhase({ kind: 'importOrWindow' })
          return
        }
        setPhase({ kind: 'result', result })
      })
  }

  useEffect(() => {
    void window.tizo.auth.state().then((state) => {
      if (!state.available) setPhase({ kind: 'unavailable' })
      else if (!state.noticeSeen) setPhase({ kind: 'notice' })
      else begin()
    })
    // Run once per dialog; `begin` guards against a second window itself.
  }, [])

  // A cancel needs no message of its own; the user asked for it.
  const cancelled = phase.kind === 'result' && !phase.result.ok && phase.result.reason === 'cancelled'
  useEffect(() => {
    if (cancelled) onClose(false)
  }, [cancelled])

  const changed = phase.kind === 'result' && phase.result.ok

  let title: string = strings.signIn.waitingTitle(site)
  let body: React.ReactNode = null
  let buttons: React.ReactNode = null

  const primary =
    'rounded-md bg-brand-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-400'
  const secondary = 'rounded-md bg-ink-900/8 px-4 py-2 text-xs text-ink-700 transition hover:bg-ink-900/15'

  switch (phase.kind) {
    case 'loading':
      body = <p className="text-sm text-ink-500">…</p>
      break
    case 'unavailable':
      body = <p className="text-sm leading-relaxed text-ink-700">{strings.signIn.unavailable}</p>
      buttons = (
        <button onClick={() => onClose(false)} className={primary}>
          {strings.signIn.close}
        </button>
      )
      break
    case 'notice':
      title = strings.signIn.noticeTitle
      body = strings.signIn.notice.map((p, i) => (
        <p key={i} className="mt-2 text-sm leading-relaxed text-ink-700 first:mt-0">
          {p}
        </p>
      ))
      buttons = (
        <>
          <button onClick={() => onClose(false)} className={secondary}>
            {strings.signIn.cancel}
          </button>
          <button
            onClick={() => void window.tizo.auth.ackNotice().then(begin)}
            className={primary}
          >
            {strings.signIn.noticeOk}
          </button>
        </>
      )
      break
    case 'importOrWindow':
      body = (
        <>
          <p className="text-sm leading-relaxed text-ink-700">{strings.signIn.importHint}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">{strings.signIn.importNote}</p>
        </>
      )
      buttons = (
        <>
          <button onClick={() => onClose(false)} className={secondary}>
            {strings.signIn.cancel}
          </button>
          <button onClick={begin} className={secondary}>
            {strings.signIn.button(site)}
          </button>
          <button onClick={importInstead} className={primary}>
            {strings.signIn.importButton}
          </button>
        </>
      )
      break
    case 'waiting':
      body = (
        <>
          <p className="text-sm leading-relaxed text-ink-700">{strings.signIn.waiting}</p>
          <div className="mt-4 rounded-lg bg-ink-900/5 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-ink-700">{strings.signIn.importHint}</p>
            <button
              onClick={importInstead}
              className="mt-2 rounded-md bg-ink-900/8 px-3 py-1.5 text-xs text-ink-700 transition hover:bg-ink-900/15"
            >
              {strings.signIn.importButton}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{strings.signIn.importNote}</p>
          </div>
        </>
      )
      buttons = (
        <>
          <button onClick={() => void window.tizo.auth.cancel()} className={secondary}>
            {strings.signIn.cancel}
          </button>
          <button onClick={() => void window.tizo.auth.finish()} className={primary}>
            {strings.signIn.done}
          </button>
        </>
      )
      break
    case 'result': {
      const r = phase.result
      const message = r.ok
        ? r.imported
          ? strings.signIn.imported(r.site)
          : r.confirmed
            ? strings.signIn.success(r.site)
            : strings.signIn.successUnverified(r.site)
        : r.reason === 'not-signed-in'
          ? importing.current
            ? strings.signIn.notSignedInFile(r.site)
            : strings.signIn.notSignedIn(r.site)
          : r.reason === 'no-cookies'
            ? strings.signIn.noCookies(r.site)
            : r.reason === 'bad-file'
              ? strings.signIn.badFile
              : r.reason === 'unavailable'
            ? strings.signIn.unavailable
            : r.reason === 'busy'
              ? strings.signIn.busy
              : r.reason === 'bad-site'
                ? strings.signIn.badSite
                : null
      if (message === null) break // cancelled; the effect above closes the dialog
      body = (
        <p
          className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
            r.ok ? 'bg-emerald-500/10 text-emerald-900' : 'bg-amber-500/10 text-amber-900'
          }`}
        >
          {message}
        </p>
      )
      buttons = (
        <button onClick={() => onClose(changed)} className={primary}>
          {strings.signIn.close}
        </button>
      )
      break
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-chrome-900/60 px-8 py-10">
      <div className="flex w-full max-w-md flex-col rounded-xl border border-surface-line bg-white shadow-2xl">
        <header className="px-5 pt-5">
          <h3 className="font-semibold text-ink-900">{title}</h3>
        </header>
        <div className="px-5 py-4">{body}</div>
        {buttons && (
          <footer className="flex justify-end gap-2 border-t border-surface-line px-5 py-3">{buttons}</footer>
        )}
      </div>
    </div>
  )
}
