import { useEffect, useRef, useState } from 'react'
import type { SignInResult } from '../../../shared/types'
import { knownSite } from '../../../shared/sites'
import { strings } from '../strings'

type Phase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'notice' }
  /** The main screen: paste the login cookies (or choose the login page). */
  | { kind: 'form' }
  /** The login page is open in its own window. */
  | { kind: 'waiting' }
  | { kind: 'result'; result: SignInResult }

/**
 * Adds a login for one site. Opens on a plain form, one box per cookie the site
 * needs (X: auth_token and ct0), copied from the browser's F12 → Application →
 * Cookies. Opening the site's own login page in a window is an option, never
 * automatic (owner, 2026-11-22: Google sign-in inside the window was unreliable
 * and opening it unasked was unwelcome).
 *
 * The login page never renders in this window; it sits in its own sandboxed
 * window, and this dialog only holds the Done / Back buttons for it.
 */
export default function SignInDialog({
  site,
  onClose
}: {
  site: string
  onClose: (changed: boolean) => void
}): React.JSX.Element {
  const fields = knownSite(site)?.fields ?? []
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [values, setValues] = useState<Record<string, string>>({})
  const [pasted, setPasted] = useState('')
  // Guards against a second window while one is already open.
  const windowOpen = useRef(false)

  useEffect(() => {
    void window.tizo.auth.state().then((state) => {
      if (!state.available) setPhase({ kind: 'unavailable' })
      else if (!state.noticeSeen) setPhase({ kind: 'notice' })
      else setPhase({ kind: 'form' })
    })
  }, [])

  const openLoginPage = (): void => {
    if (windowOpen.current) return
    windowOpen.current = true
    setPhase({ kind: 'waiting' })
    void window.tizo.auth.signIn(site).then((result) => {
      windowOpen.current = false
      // Closing the window with Back goes back to the form, not out.
      if (!result.ok && result.reason === 'cancelled') setPhase({ kind: 'form' })
      else setPhase({ kind: 'result', result })
    })
  }

  // Cookie values copied from F12 sometimes carry quotes or spaces around them.
  const clean = (v: string): string => v.trim().replace(/^"(.*)"$/, '$1')
  const text =
    fields.length > 0
      ? fields
          .map((f) => [f, clean(values[f] ?? '')] as const)
          .filter(([, v]) => v)
          .map(([f, v]) => `${f}=${v}`)
          .join('; ')
      : pasted
  const ready = fields.length > 0 ? fields.every((f) => clean(values[f] ?? '')) : pasted.trim() !== ''

  const save = (): void => {
    void window.tizo.auth.importText(site, text).then((result) => setPhase({ kind: 'result', result }))
  }

  const loadFile = (): void => {
    void window.tizo.auth.importFile(site).then((result) => {
      if (!result.ok && result.reason === 'cancelled') return
      setPhase({ kind: 'result', result })
    })
  }

  const changed = phase.kind === 'result' && phase.result.ok

  let title: string = strings.signIn.formTitle(site)
  let body: React.ReactNode = null
  let buttons: React.ReactNode = null

  const primary =
    'rounded-md bg-brand-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-400 disabled:opacity-40'
  const secondary = 'rounded-md bg-ink-900/8 px-4 py-2 text-xs text-ink-700 transition hover:bg-ink-900/15'
  const input =
    'w-full rounded-md border border-surface-line bg-white px-2.5 py-1.5 font-mono text-xs text-ink-900 outline-none focus:border-brand-500'

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
            onClick={() => void window.tizo.auth.ackNotice().then(() => setPhase({ kind: 'form' }))}
            className={primary}
          >
            {strings.signIn.noticeOk}
          </button>
        </>
      )
      break

    case 'form':
      body = (
        <>
          <p className="text-[13px] leading-relaxed text-ink-700">
            {fields.length > 0 ? strings.signIn.whereFields(site) : strings.signIn.wherePaste(site)}
          </p>

          {fields.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2.5">
              {fields.map((f, i) => (
                <label key={f} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-ink-700">{strings.signIn.fieldLabel(f)}</span>
                  <input
                    autoFocus={i === 0}
                    value={values[f] ?? ''}
                    onChange={(e) => setValues({ ...values, [f]: e.target.value })}
                    spellCheck={false}
                    autoComplete="off"
                    className={input}
                  />
                </label>
              ))}
            </div>
          ) : (
            <textarea
              autoFocus
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="name=value; name2=value2"
              spellCheck={false}
              className={`${input} mt-3 h-20 resize-none`}
            />
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-ink-500">{strings.signIn.pasteNote}</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-surface-line pt-3 text-xs">
            <span className="text-ink-500">{strings.signIn.orLabel}</span>
            <button onClick={openLoginPage} className="text-brand-500 hover:underline">
              {strings.signIn.openLoginPage(site)}
            </button>
            <button onClick={loadFile} className="text-brand-500 hover:underline">
              {strings.signIn.loadFile}
            </button>
          </div>
        </>
      )
      buttons = (
        <>
          <button onClick={() => onClose(false)} className={secondary}>
            {strings.signIn.cancel}
          </button>
          <button onClick={save} disabled={!ready} className={primary}>
            {strings.signIn.save}
          </button>
        </>
      )
      break

    case 'waiting':
      title = strings.signIn.waitingTitle(site)
      body = <p className="text-sm leading-relaxed text-ink-700">{strings.signIn.waiting}</p>
      buttons = (
        <>
          <button onClick={() => void window.tizo.auth.cancel()} className={secondary}>
            {strings.signIn.back}
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
          ? strings.signIn.notSignedIn(r.site)
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
                    : ''
      title = r.ok ? strings.signIn.doneTitle : strings.signIn.formTitle(site)
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
        <>
          {!r.ok && (
            <button onClick={() => setPhase({ kind: 'form' })} className={secondary}>
              {strings.signIn.tryAgain}
            </button>
          )}
          <button onClick={() => onClose(changed)} className={primary}>
            {strings.signIn.close}
          </button>
        </>
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
